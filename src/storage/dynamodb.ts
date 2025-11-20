/**
 * DynamoDB Storage Implementation (Optional)
 *
 * This implementation uses AWS DynamoDB for persistent storage.
 *
 * To use this:
 * 1. Set environment variable: USE_DYNAMODB=true
 * 2. Configure AWS credentials (or use DynamoDB Local)
 * 3. Set DYNAMODB_TABLE_NAME (or use default "ExamItems")
 *
 * For DynamoDB Local:
 * - Download from: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
 * - Run: java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
 * - Set DYNAMODB_ENDPOINT=http://localhost:8000
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ExamItem, CreateItemRequest, UpdateItemRequest, ListItemsQuery } from '../types/item.js';
import { ItemStorage } from './interface.js';

export class DynamoDBStorage implements ItemStorage {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT }),
    });

    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = process.env.DYNAMODB_TABLE_NAME || 'ExamItems';
  }

  async createItem(data: CreateItemRequest): Promise<ExamItem> {
    const now = Date.now();
    const itemId = randomUUID();
    const item: ExamItem = {
      id: itemId,
      ...data,
      metadata: {
        ...data.metadata,
        created: now,
        lastModified: now,
        version: 1,
      },
    };

    // Store with composite key: id (PK) and metadata.version (SK)
    // Also add top-level fields for GSI: latestVersion and lastModified
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        ...item,
        version: item.metadata.version, // Sort key: projects metadata.version to top-level for DynamoDB
        latestVersion: 'true', // GSI PK: boolean stored as string for DynamoDB key
        lastModified: item.metadata.lastModified, // GSI SK: projects metadata.lastModified to top-level
      },
    }));

    return item;
  }

  async getItem(id: string): Promise<ExamItem | null> {
    // Query for the latest version (highest metadata.version number)
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': id,
      },
      ScanIndexForward: false, // Sort by metadata.version DESC (via top-level version key)
      Limit: 1, // Only get the latest version
    }));

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    // Remove the top-level DynamoDB keys (they're only for keys/indexes)
    // The actual data is in the item structure
    const item = result.Items[0] as any;
    const { version: _, latestVersion: __, lastModified: ___, ...itemData } = item;
    return itemData as ExamItem;
  }

  async updateItem(id: string, data: UpdateItemRequest): Promise<ExamItem | null> {
    // Get current version (with DynamoDB keys included)
    const currentWithKeys = await this.getCurrentVersionWithKeys(id);
    if (!currentWithKeys) return null;

    // Extract the item data (remove DynamoDB-specific keys)
    const { version: _, latestVersion: __, lastModified: ___, ...current } = currentWithKeys;

    // Create new version (don't overwrite old version)
    const newVersion: ExamItem = {
      ...current,
      ...data,
      content: data.content ? { ...current.content, ...data.content } : current.content,
      metadata: {
        ...current.metadata,
        ...(data.metadata || {}),
        lastModified: Date.now(),
        version: current.metadata.version + 1,
      },
    };

    // Update old version: set latestVersion to false
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        ...currentWithKeys,
        latestVersion: 'false', // Mark old version as not latest
      },
    }));

    // Store new version with composite key and GSI fields
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        ...newVersion,
        version: newVersion.metadata.version, // Sort key: projects metadata.version to top-level for DynamoDB
        latestVersion: 'true', // GSI PK: mark as latest version
        lastModified: newVersion.metadata.lastModified, // GSI SK: projects metadata.lastModified to top-level
      },
    }));

    return newVersion;
  }

  /**
   * Helper method to get the current version WITH DynamoDB keys
   * Used when we need to update the old version's latestVersion flag
   */
  private async getCurrentVersionWithKeys(id: string): Promise<any | null> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'id = :id',
      ExpressionAttributeValues: {
        ':id': id,
      },
      ScanIndexForward: false, // Sort by metadata.version DESC (via top-level version key)
      Limit: 1,
    }));

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    return result.Items[0];
  }

  async listItems(query: ListItemsQuery): Promise<{ items: ExamItem[]; total: number; nextToken?: string }> {
    // Use GSI to query only latest versions (latestVersion = true)
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: 'LatestVersionIndex',
      KeyConditionExpression: 'latestVersion = :latestVersion',
      ExpressionAttributeValues: {
        ':latestVersion': 'true',
      },
      ScanIndexForward: false, // Sort by lastModified DESC (newest first)
      Limit: query.limit || 10,
      // Support pagination: if nextToken is provided, use it as ExclusiveStartKey
      ...(query.nextToken && {
        ExclusiveStartKey: JSON.parse(Buffer.from(query.nextToken, 'base64').toString('utf-8')),
      }),
    }));

    // Remove DynamoDB-specific keys from items
    const items = (result.Items || []).map((item: any) => {
      const { version: _, latestVersion: __, lastModified: ___, ...itemData } = item;
      return itemData;
    }) as ExamItem[];

    // Encode LastEvaluatedKey as base64 string for pagination token
    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return { items, total: result.Count || 0, nextToken };
  }

  async createVersion(id: string): Promise<ExamItem | null> {
    // Get current version (with DynamoDB keys included)
    const currentWithKeys = await this.getCurrentVersionWithKeys(id);
    if (!currentWithKeys) return null;

    // Extract the item data (remove DynamoDB-specific keys)
    const { version: _, latestVersion: __, lastModified: ___, ...current } = currentWithKeys;

    // Create new version (copy of current state with incremented version)
    const newVersion: ExamItem = {
      ...current,
      metadata: {
        ...current.metadata,
        version: current.metadata.version + 1,
        lastModified: Date.now(),
      },
    };

    // Update old version: set latestVersion to false
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        ...currentWithKeys,
        latestVersion: 'false', // Mark old version as not latest
      },
    }));

    // Store new version with composite key and GSI fields
    await this.client.send(new PutCommand({
      TableName: this.tableName,
      Item: {
        ...newVersion,
        version: newVersion.metadata.version, // Sort key: projects metadata.version to top-level for DynamoDB
        latestVersion: 'true', // GSI PK: mark as latest version
        lastModified: newVersion.metadata.lastModified, // GSI SK: projects metadata.lastModified to top-level
      },
    }));

    return newVersion;
  }

  async getAuditTrail(id: string): Promise<ExamItem[]> {
    // TODO: Implement audit trail retrieval
    // This depends on your versioning strategy
    throw new Error('Not implemented - define your audit trail strategy');
  }
}

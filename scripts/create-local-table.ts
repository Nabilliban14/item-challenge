#!/usr/bin/env node
/**
 * Script to create the ExamItems table in local DynamoDB
 * 
 * Usage:
 *   DYNAMODB_ENDPOINT=http://localhost:8000 tsx scripts/create-local-table.ts
 */

import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';

const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
const tableName = process.env.DYNAMODB_TABLE_NAME || 'ExamItems';

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint,
});

async function createTable() {
  try {
    console.log(`Creating table "${tableName}" at ${endpoint}...`);

    const command = new CreateTableCommand({
      TableName: tableName,
      AttributeDefinitions: [
        {
          AttributeName: 'id',
          AttributeType: 'S', // String
        },
        {
          AttributeName: 'version',
          AttributeType: 'N', // Number
        },
        {
          AttributeName: 'latestVersion',
          AttributeType: 'S', // String (stores "true"/"false")
        },
        {
          AttributeName: 'lastModified',
          AttributeType: 'N', // Number (timestamp)
        },
      ],
      KeySchema: [
        {
          AttributeName: 'id',
          KeyType: 'HASH', // Partition key
        },
        {
          AttributeName: 'version',
          KeyType: 'RANGE', // Sort key
        },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'LatestVersionIndex',
          KeySchema: [
            {
              AttributeName: 'latestVersion',
              KeyType: 'HASH', // GSI Partition key
            },
            {
              AttributeName: 'lastModified',
              KeyType: 'RANGE', // GSI Sort key
            },
          ],
          Projection: {
            ProjectionType: 'ALL', // Include all attributes
          },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    });

    const response = await client.send(command);
    console.log(`✅ Table "${tableName}" created successfully!`);
    console.log(`   Table ARN: ${response.TableDescription?.TableArn}`);
    console.log(`   Table Status: ${response.TableDescription?.TableStatus}`);
  } catch (error: any) {
    if (error.name === 'ResourceInUseException') {
      console.log(`⚠️  Table "${tableName}" already exists. Skipping creation.`);
    } else {
      console.error('❌ Error creating table:', error.message);
      process.exit(1);
    }
  }
}

createTable();


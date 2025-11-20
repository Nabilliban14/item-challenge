import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * DynamoDB Stack
 * 
 * Separate stack for DynamoDB table to allow for independent management.
 * This table can be shared across multiple application stacks.
 * 
 * Table Schema:
 * =============
 * 
 * Primary Key:
 *   - Partition Key (PK): id (STRING) - Unique item identifier
 *   - Sort Key (SK): version (NUMBER) - Version number from metadata.version
 * 
 * Global Secondary Index (GSI): LatestVersionIndex
 *   - Partition Key: latestVersion (STRING) - "true" for latest, "false" for old versions
 *   - Sort Key: lastModified (NUMBER) - Timestamp from metadata.lastModified
 * 
 * Item Attributes:
 *   - id (STRING, PK) - Item UUID
 *   - version (NUMBER, SK) - Projected from metadata.version
 *   - latestVersion (STRING, GSI PK) - "true" or "false"
 *   - lastModified (NUMBER, GSI SK) - Projected from metadata.lastModified
 *   - subject (STRING) - e.g., "AP Biology", "AP Calculus"
 *   - itemType (STRING) - "multiple-choice", "free-response", "essay"
 *   - difficulty (NUMBER) - 1-5
 *   - content (MAP) - Question content:
 *     - question (STRING) - The question text
 *     - options (LIST<STRING>, optional) - For multiple choice
 *     - correctAnswer (STRING) - Correct answer
 *     - explanation (STRING) - Answer explanation
 *   - metadata (MAP) - Item metadata:
 *     - author (STRING) - Author name
 *     - created (NUMBER) - Creation timestamp
 *     - lastModified (NUMBER) - Last modification timestamp
 *     - version (NUMBER) - Version number (source of truth for sort key)
 *     - status (STRING) - "draft", "review", "approved", "archived"
 *     - tags (LIST<STRING>) - Item tags
 *   - securityLevel (STRING) - "standard", "secure", "highly-secure"
 * 
 * Access Patterns:
 *   - Get item by ID: Query PK=id, sort by version DESC, limit 1
 *   - Get all versions: Query PK=id, sort by version ASC
 *   - List latest items: Query GSI PK="true", sort by lastModified DESC
 *   - List by status: Query GSI PK="true", FilterExpression on metadata.status
 */
export class DynamoDBStack extends cdk.Stack {
  public readonly itemsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table for Exam Items
    // Primary Key: id (partition key)
    // Sort Key: version (number) - enables versioning and audit trail queries
    // Note: The 'version' sort key is projected from metadata.version in the application layer
    this.itemsTable = new dynamodb.Table(this, 'ExamItemsTable', {
      tableName: 'ExamItems',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'version',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand pricing
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change to RETAIN for production
      
      // Point-in-time recovery for data protection
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      
      // Encryption at rest
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Global Secondary Index (GSI) for querying latest versions
    // PK: latestVersion (boolean) - filters to latest versions only
    // SK: lastModified (number) - sorts by modification time
    this.itemsTable.addGlobalSecondaryIndex({
      indexName: 'LatestVersionIndex',
      partitionKey: {
        name: 'latestVersion',
        type: dynamodb.AttributeType.STRING, // DynamoDB stores booleans as strings in keys
      },
      sortKey: {
        name: 'lastModified',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL, // Include all attributes in GSI
    });

    // Output the table name for reference
    new cdk.CfnOutput(this, 'TableName', {
      value: this.itemsTable.tableName,
      description: 'DynamoDB table name for exam items',
      exportName: 'ExamItemsTableName',
    });

    // Output the table ARN
    new cdk.CfnOutput(this, 'TableArn', {
      value: this.itemsTable.tableArn,
      description: 'DynamoDB table ARN',
      exportName: 'ExamItemsTableArn',
    });
  }
}


import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { DynamoDBStack } from './dynamodb-stack';

/**
 * Item Challenge Stack Props
 */
export interface ItemChallengeStackProps extends cdk.StackProps {
  dynamoDBStack: DynamoDBStack;
}

/**
 * Item Challenge Stack
 * 
 * Defines the AWS infrastructure for the exam item management system.
 * Imports the DynamoDB table from the separate DynamoDBStack.
 */
export class ItemChallengeStack extends cdk.Stack {
  public readonly itemsTable: dynamodb.ITable;

  constructor(scope: Construct, id: string, props: ItemChallengeStackProps) {
    super(scope, id, props);

    // Reference the DynamoDB table from the DynamoDBStack
    // This allows the table to be managed independently
    this.itemsTable = props.dynamoDBStack.itemsTable;
  }
}


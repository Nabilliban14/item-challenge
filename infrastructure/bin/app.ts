#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { ItemChallengeStack } from '../lib/item-challenge-stack';
import { IAMRolesStack } from '../lib/iam-roles-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { SNSTopicStack } from '../lib/sns-topic-stack';
import { CloudWatchAlarmStack } from '../lib/cloudwatch-alarm-stack';
import { ApiGatewayStack } from '../lib/api-gateway-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const environment = process.env.ENVIRONMENT || 'dev';
const emailAddress = process.env.ALARM_EMAIL || 'alarms@collegboard.com';

// Create DynamoDB stack first (base infrastructure)
const dynamoDBStack = new DynamoDBStack(app, 'DynamoDBStack', {
  env,
});

// Create main application stack that depends on DynamoDB
const itemChallengeStack = new ItemChallengeStack(app, 'ItemChallengeStack', {
  env,
  dynamoDBStack,
});

// Create IAM roles stack
const iamRolesStack = new IAMRolesStack(app, 'IAMRolesStack', {
  env,
  itemsTable: dynamoDBStack.itemsTable,
});

// Create Lambda stack
const lambdaStack = new LambdaStack(app, 'LambdaStack', {
  env,
  itemsTable: dynamoDBStack.itemsTable,
  createItemRole: iamRolesStack.createItemRole,
  getItemRole: iamRolesStack.getItemRole,
  listItemsRole: iamRolesStack.listItemsRole,
  updateItemRole: iamRolesStack.updateItemRole,
  createVersionRole: iamRolesStack.createVersionRole,
});

// Create SNS topic stack for alarm notifications
const snsTopicStack = new SNSTopicStack(app, 'SNSTopicStack', {
  env,
  emailAddress,
});

// Create CloudWatch alarm stack (only in prod)
const cloudWatchAlarmStack = new CloudWatchAlarmStack(app, 'CloudWatchAlarmStack', {
  env,
  environment,
  createItemFunction: lambdaStack.createItemFunction,
  getItemFunction: lambdaStack.getItemFunction,
  listItemsFunction: lambdaStack.listItemsFunction,
  updateItemFunction: lambdaStack.updateItemFunction,
  createVersionFunction: lambdaStack.createVersionFunction,
  alarmTopic: snsTopicStack.alarmTopic,
});

// Create API Gateway stack
const apiGatewayStack = new ApiGatewayStack(app, 'ApiGatewayStack', {
  env,
  createItemFunction: lambdaStack.createItemFunction,
  getItemFunction: lambdaStack.getItemFunction,
  listItemsFunction: lambdaStack.listItemsFunction,
  updateItemFunction: lambdaStack.updateItemFunction,
  createVersionFunction: lambdaStack.createVersionFunction,
});

// Add explicit dependencies
itemChallengeStack.addDependency(dynamoDBStack);
iamRolesStack.addDependency(dynamoDBStack);
lambdaStack.addDependency(iamRolesStack);
lambdaStack.addDependency(dynamoDBStack);
cloudWatchAlarmStack.addDependency(lambdaStack);
cloudWatchAlarmStack.addDependency(snsTopicStack);
apiGatewayStack.addDependency(lambdaStack);


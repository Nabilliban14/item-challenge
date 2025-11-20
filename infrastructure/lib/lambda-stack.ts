import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Lambda Stack Props
 */
export interface LambdaStackProps extends cdk.StackProps {
  itemsTable: dynamodb.ITable;
  createItemRole: iam.IRole;
  getItemRole: iam.IRole;
  listItemsRole: iam.IRole;
  updateItemRole: iam.IRole;
  createVersionRole: iam.IRole;
  environment?: string;
}

/**
 * Lambda Stack
 * 
 * Creates Node.js Lambda functions for all handlers.
 * Each function is configured with appropriate memory size and runtime.
 */
export class LambdaStack extends cdk.Stack {
  public readonly createItemFunction: lambda.Function;
  public readonly getItemFunction: lambda.Function;
  public readonly listItemsFunction: lambda.Function;
  public readonly updateItemFunction: lambda.Function;
  public readonly createVersionFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const {
      itemsTable,
      createItemRole,
      getItemRole,
      listItemsRole,
      updateItemRole,
      createVersionRole,
      environment = 'dev'
    } = props;

    // Get the project root directory (relative to infrastructure directory)
    const projectRoot = path.join(__dirname, '../..');
    const srcPath = path.join(projectRoot, 'src');

    // Common Lambda configuration
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      architecture: lambda.Architecture.X86_64,
      timeout: cdk.Duration.seconds(30),
      environment: {
        USE_DYNAMODB: 'true',
        DYNAMODB_TABLE_NAME: itemsTable.tableName,
        NODE_ENV: environment,
      },
    };

    // Helper function to create Lambda code asset that includes shared dependencies
    // Each handler folder will be the root, but we need to include parent directories
    // We'll bundle from the src directory and set the handler path accordingly
    const createLambdaCode = (handlerPath: string) => {
      // Bundle from project root to include node_modules and all source files
      return lambda.Code.fromAsset(projectRoot, {
        exclude: [
          '**/node_modules/.cache/**',
          '**/.git/**',
          '**/infrastructure/**',
          '**/samples/**',
          '**/scripts/**',
          '**/*.test.ts',
          '**/__tests__/**',
          '**/dist/**',
          '**/.DS_Store',
        ],
      });
    };

    // Create Item Lambda
    this.createItemFunction = new lambda.Function(this, 'CreateItemFunction', {
      ...commonLambdaProps,
      functionName: 'item-challenge-create-item',
      description: 'Lambda function for creating exam items',
      code: createLambdaCode('create-item'),
      handler: 'src/handlers/create-item/index.handler',
      role: createItemRole,
      memorySize: 256, // Adequate for validation and single PutItem operation
    });

    // Get Item Lambda
    this.getItemFunction = new lambda.Function(this, 'GetItemFunction', {
      ...commonLambdaProps,
      functionName: 'item-challenge-get-item',
      description: 'Lambda function for retrieving exam items by ID',
      code: createLambdaCode('get-item'),
      handler: 'src/handlers/get-item/index.handler',
      role: getItemRole,
      memorySize: 256, // Adequate for single Query operation
    });

    // List Items Lambda
    this.listItemsFunction = new lambda.Function(this, 'ListItemsFunction', {
      ...commonLambdaProps,
      functionName: 'item-challenge-list-items',
      description: 'Lambda function for listing exam items with pagination',
      code: createLambdaCode('list-items'),
      handler: 'src/handlers/list-items/index.handler',
      role: listItemsRole,
      memorySize: 512, // Higher memory for pagination and filtering operations
    });

    // Update Item Lambda
    this.updateItemFunction = new lambda.Function(this, 'UpdateItemFunction', {
      ...commonLambdaProps,
      functionName: 'item-challenge-update-item',
      description: 'Lambda function for updating exam items',
      code: createLambdaCode('update-item'),
      handler: 'src/handlers/update-item/index.handler',
      role: updateItemRole,
      memorySize: 512, // Higher memory for Query + multiple PutItem operations
    });

    // Create Version Lambda
    this.createVersionFunction = new lambda.Function(this, 'CreateVersionFunction', {
      ...commonLambdaProps,
      functionName: 'item-challenge-create-version',
      description: 'Lambda function for creating new versions of exam items',
      code: createLambdaCode('create-version'),
      handler: 'src/handlers/create-version/index.handler',
      role: createVersionRole,
      memorySize: 512, // Higher memory for Query + multiple PutItem operations
    });
  }
}


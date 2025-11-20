import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * IAM Roles Stack Props
 */
export interface IAMRolesStackProps extends cdk.StackProps {
  itemsTable: dynamodb.ITable;
}

/**
 * IAM Roles Stack
 * 
 * Creates IAM roles for Lambda functions with:
 * - Basic Lambda execution policy
 * - DynamoDB permissions based on handler requirements
 */
export class IAMRolesStack extends cdk.Stack {
  public readonly createItemRole: iam.Role;
  public readonly getItemRole: iam.Role;
  public readonly listItemsRole: iam.Role;
  public readonly updateItemRole: iam.Role;
  public readonly createVersionRole: iam.Role;

  constructor(scope: Construct, id: string, props: IAMRolesStackProps) {
    super(scope, id, props);

    const { itemsTable } = props;

    // Create Item Role - needs PutItem permission
    this.createItemRole = new iam.Role(this, 'CreateItemRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for create-item Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant PutItem permission on the table
    itemsTable.grantWriteData(this.createItemRole);

    // Get Item Role - needs Query permission on table
    this.getItemRole = new iam.Role(this, 'GetItemRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for get-item Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant Query permission on the table
    itemsTable.grantReadData(this.getItemRole);

    // List Items Role - needs Query permission on table and GSI
    this.listItemsRole = new iam.Role(this, 'ListItemsRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for list-items Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant Query permission on the table (includes GSI access)
    itemsTable.grantReadData(this.listItemsRole);

    // Update Item Role - needs Query and PutItem permissions
    this.updateItemRole = new iam.Role(this, 'UpdateItemRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for update-item Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant both read and write permissions (Query + PutItem)
    itemsTable.grantReadWriteData(this.updateItemRole);

    // Create Version Role - needs Query and PutItem permissions
    this.createVersionRole = new iam.Role(this, 'CreateVersionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for create-version Lambda function',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant both read and write permissions (Query + PutItem)
    itemsTable.grantReadWriteData(this.createVersionRole);
  }
}


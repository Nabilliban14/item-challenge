import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

/**
 * API Gateway Stack Props
 */
export interface ApiGatewayStackProps extends cdk.StackProps {
  createItemFunction: lambda.IFunction;
  getItemFunction: lambda.IFunction;
  listItemsFunction: lambda.IFunction;
  updateItemFunction: lambda.IFunction;
  createVersionFunction: lambda.IFunction;
}

/**
 * API Gateway Stack
 * 
 * Creates HTTP API Gateway with routes to all Lambda handlers:
 * - POST /api/items -> create-item
 * - GET /api/items -> list-items
 * - GET /api/items/{id} -> get-item
 * - PUT /api/items/{id} -> update-item
 * - POST /api/items/{id}/versions -> create-version
 */
export class ApiGatewayStack extends cdk.Stack {
  public readonly httpApi: apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const {
      createItemFunction,
      getItemFunction,
      listItemsFunction,
      updateItemFunction,
      createVersionFunction,
    } = props;

    // Create HTTP API
    this.httpApi = new apigatewayv2.HttpApi(this, 'ItemChallengeApi', {
      apiName: 'item-challenge-api',
      description: 'HTTP API for exam item management system',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST, apigatewayv2.CorsHttpMethod.PUT],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Create Lambda integrations
    const createItemIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'CreateItemIntegration',
      createItemFunction
    );

    const getItemIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'GetItemIntegration',
      getItemFunction
    );

    const listItemsIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'ListItemsIntegration',
      listItemsFunction
    );

    const updateItemIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'UpdateItemIntegration',
      updateItemFunction
    );

    const createVersionIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'CreateVersionIntegration',
      createVersionFunction
    );

    // Add routes
    // POST /api/items - Create item
    this.httpApi.addRoutes({
      path: '/api/items',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: createItemIntegration,
    });

    // GET /api/items - List items
    this.httpApi.addRoutes({
      path: '/api/items',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: listItemsIntegration,
    });

    // GET /api/items/{id} - Get item by ID
    this.httpApi.addRoutes({
      path: '/api/items/{id}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: getItemIntegration,
    });

    // PUT /api/items/{id} - Update item
    this.httpApi.addRoutes({
      path: '/api/items/{id}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: updateItemIntegration,
    });

    // POST /api/items/{id}/versions - Create version
    this.httpApi.addRoutes({
      path: '/api/items/{id}/versions',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: createVersionIntegration,
    });

    // Output the API endpoint
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.httpApi.apiEndpoint,
      description: 'HTTP API Gateway endpoint URL',
      exportName: 'ItemChallengeApiEndpoint',
    });
  }
}


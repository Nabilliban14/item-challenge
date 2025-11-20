/**
 * Shared utilities and types for Lambda handlers
 * 
 * Provides common functionality for handling both API Gateway events
 * and local server requests.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Local server response structure
 * This is what the local server expects
 * The body can be either the success data type or an error object
 */
export interface LocalServerResponse<T = unknown> {
  statusCode: number;
  body: T | { error: string; details?: Array<{ field: string; message: string }> };
}

/**
 * Union type for handler output - either API Gateway response or local server response
 * The generic type T represents the success response body type
 */
export type HandlerResponse<T = unknown> = APIGatewayProxyResult | LocalServerResponse<T>;

/**
 * Type guard to check if input is an API Gateway event
 * Works with any union type that includes APIGatewayProxyEvent
 */
export function isApiGatewayEvent(
  input: unknown
): input is APIGatewayProxyEvent {
  return (
    typeof input === 'object' &&
    input !== null &&
    'httpMethod' in input &&
    'path' in input
  );
}

/**
 * Format response for API Gateway or local server
 * 
 * @param response - Local server response object
 * @param isApiGateway - Whether the response is for API Gateway
 * @returns Formatted response for API Gateway or local server
 */
export function formatResponse<T>(
  response: LocalServerResponse<T>,
  isApiGateway: boolean
): HandlerResponse<T> {
  if (isApiGateway) {
    return {
      statusCode: response.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(response.body),
    } as APIGatewayProxyResult;
  }
  return response;
}

/**
 * Extract error message from an error object
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal server error';
}


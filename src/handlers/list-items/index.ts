/**
 * List Items Handler
 * 
 * Handles GET /api/items endpoint for listing exam items with pagination and filtering.
 * Works with both Lambda events (API Gateway) and local HTTP server.
 */

import { z } from 'zod';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { createStorage } from '../../storage/index.js';
import { ExamItem, ListItemsQuery } from '../../types/item.js';
import { isApiGatewayEvent, formatResponse, getErrorMessage, type HandlerResponse } from '../utils.js';

const storage = createStorage();

// Zod schema for query parameters validation
const ListItemsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  subject: z.string().min(1).optional(),
  status: z.enum(['draft', 'review', 'approved', 'archived']).optional(),
  nextToken: z.string().optional(),
});

/**
 * Handler response type
 */
type ListItemsHandlerResponse = HandlerResponse<{ items: ExamItem[]; total: number; nextToken?: string }>;

/**
 * Extract query parameters from API Gateway event or direct query object
 */
function extractQueryParams(input: APIGatewayProxyEvent | Record<string, string | undefined>): ListItemsQuery {
  if (isApiGatewayEvent(input)) {
    // Extract from queryStringParameters
    const params = input.queryStringParameters || {};
    return {
      limit: params.limit ? parseInt(params.limit, 10) : undefined,
      offset: params.offset ? parseInt(params.offset, 10) : undefined,
      subject: params.subject,
      status: params.status as ListItemsQuery['status'],
      nextToken: params.nextToken,
    };
  }
  // Otherwise, it's already a query object from local server
  return input as ListItemsQuery;
}

/**
 * List items handler
 * 
 * Handles two input scenarios:
 * 1. API Gateway event - when deployed to Lambda via API Gateway (extracts query params from queryStringParameters)
 * 2. Direct query object - when called from local server (parsed from URL query string)
 * 
 * @param input - API Gateway HTTP event or query parameters object from local server
 * @returns API Gateway response or local server response
 */
export async function listItemsHandler(
  input: APIGatewayProxyEvent | Record<string, string | undefined>
): Promise<ListItemsHandlerResponse> {
  const isApiGateway = isApiGatewayEvent(input);
  
  try {
    // Extract query parameters
    const rawQuery = extractQueryParams(input);
    
    // Validate query parameters
    const validationResult = ListItemsQuerySchema.safeParse(rawQuery);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      return formatResponse<{ items: ExamItem[]; total: number; nextToken?: string }>(
        {
          statusCode: 400,
          body: {
            error: 'Invalid query parameters',
            details: errors,
          },
        },
        isApiGateway
      );
    }

    const query: ListItemsQuery = validationResult.data;

    // List items
    const result = await storage.listItems(query);

    return formatResponse(
      {
        statusCode: 200,
        body: result,
      },
      isApiGateway
    );
  } catch (error) {
    console.error('Error listing items:', error);
    
    return formatResponse<{ items: ExamItem[]; total: number; nextToken?: string }>(
      {
        statusCode: 500,
        body: { error: getErrorMessage(error) },
      },
      isApiGateway
    );
  }
}

/**
 * Lambda handler entry point
 */
export const handler = listItemsHandler;


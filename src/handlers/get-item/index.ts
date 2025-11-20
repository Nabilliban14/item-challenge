/**
 * Get Item Handler
 * 
 * Handles GET /api/items/:id endpoint for retrieving exam items by ID.
 * Works with both Lambda events (API Gateway) and local HTTP server.
 */

import { z } from 'zod';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { createStorage } from '../../storage/index.js';
import { ExamItem } from '../../types/item.js';
import { isApiGatewayEvent, formatResponse, getErrorMessage, type HandlerResponse, type LocalServerResponse } from '../utils.js';

const storage = createStorage();

// Zod schema for item ID validation
const ItemIdSchema = z.string().min(1, 'Item ID is required').trim();

/**
 * Direct ID from local server (string)
 * This is what the local server passes when called via curl
 */
type LocalServerId = string;

/**
 * Union type for handler input - either API Gateway event or direct ID string
 * Uses APIGatewayProxyEvent from @types/aws-lambda for API Gateway events
 */
type GetItemHandlerInput = APIGatewayProxyEvent | LocalServerId;

/**
 * Handler response type
 */
type GetItemHandlerResponse = HandlerResponse<ExamItem>;

/**
 * Extract item ID from API Gateway event or direct ID string
 */
function extractItemId(input: GetItemHandlerInput): string | null {
  // If it's an API Gateway event, extract ID from path parameters
  if (isApiGatewayEvent(input)) {
    // API Gateway path parameters are typically accessed via pathParameters.id
    // The path /api/items/:id would have pathParameters = { id: "..." }
    const id = input.pathParameters?.id;
    return id || null;
  }
  // Otherwise, it's already the ID string from local server
  return input as LocalServerId;
}

/**
 * Get item handler
 * 
 * Handles two input scenarios:
 * 1. API Gateway event - when deployed to Lambda via API Gateway (extracts ID from pathParameters)
 * 2. Direct ID string - when called from local server (curl request)
 * 
 * @param input - API Gateway HTTP event or item ID string from local server
 * @returns API Gateway response or local server response
 */
export async function getItemHandler(
  input: GetItemHandlerInput
): Promise<GetItemHandlerResponse> {
  const isApiGateway = isApiGatewayEvent(input);
  
  try {
    // Extract item ID
    const rawItemId = extractItemId(input);
    
    if (!rawItemId) {
      return formatResponse<ExamItem>(
        {
          statusCode: 400,
          body: { error: 'Item ID is required' },
        },
        isApiGateway
      );
    }

    // Validate item ID format
    const validationResult = ItemIdSchema.safeParse(rawItemId);
    
    if (!validationResult.success) {
      return formatResponse<ExamItem>(
        {
          statusCode: 400,
          body: {
            error: 'Invalid item ID',
            details: validationResult.error.errors.map(err => ({
              field: 'id',
              message: err.message,
            })),
          },
        },
        isApiGateway
      );
    }

    const itemId = validationResult.data;

    // Get the item
    const item = await storage.getItem(itemId);

    if (!item) {
      return formatResponse<ExamItem>(
        {
          statusCode: 404,
          body: { error: 'Item not found' },
        },
        isApiGateway
      );
    }

    return formatResponse(
      {
        statusCode: 200,
        body: item,
      },
      isApiGateway
    );
  } catch (error) {
    console.error('Error getting item:', error);
    
    return formatResponse<ExamItem>(
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
export const handler = getItemHandler;


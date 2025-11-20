/**
 * Update Item Handler
 * 
 * Handles PUT /api/items/:id endpoint for updating exam items.
 * Works with both Lambda events (API Gateway) and local HTTP server.
 */

import { z } from 'zod';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { createStorage } from '../../storage/index.js';
import { UpdateItemRequest, ExamItem } from '../../types/item.js';
import { isApiGatewayEvent, formatResponse, getErrorMessage, type HandlerResponse } from '../utils.js';

const storage = createStorage();

// Zod schema for update request validation
// All fields are optional for updates
const UpdateItemSchema = z.object({
  subject: z.string().min(1, 'Subject must not be empty').optional(),
  itemType: z.enum(['multiple-choice', 'free-response', 'essay'], {
    errorMap: () => ({ message: 'itemType must be one of: multiple-choice, free-response, essay' }),
  }).optional(),
  difficulty: z.number().int().min(1).max(5, 'Difficulty must be between 1 and 5').optional(),
  content: z.object({
    question: z.string().min(1, 'Question must not be empty').optional(),
    options: z.array(z.string()).optional(),
    correctAnswer: z.string().min(1, 'Correct answer must not be empty').optional(),
    explanation: z.string().min(1, 'Explanation must not be empty').optional(),
  }).optional(),
  metadata: z.object({
    author: z.string().min(1, 'Author must not be empty').optional(),
    status: z.enum(['draft', 'review', 'approved', 'archived'], {
      errorMap: () => ({ message: 'Status must be one of: draft, review, approved, archived' }),
    }).optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  securityLevel: z.enum(['standard', 'secure', 'highly-secure'], {
    errorMap: () => ({ message: 'Security level must be one of: standard, secure, highly-secure' }),
  }).optional(),
});

/**
 * Direct body from local server (already parsed JSON)
 * This is what the local server passes when called via curl
 * Can be null if no body is provided
 */
type LocalServerBody = UpdateItemRequest | null;

/**
 * Union type for handler input - either API Gateway event or direct body (or null)
 * Uses APIGatewayProxyEvent from @types/aws-lambda for API Gateway events
 */
type UpdateItemHandlerInput = APIGatewayProxyEvent | LocalServerBody;

/**
 * Handler response type
 */
type UpdateItemHandlerResponse = HandlerResponse<ExamItem>;

/**
 * Extract item ID from API Gateway event or direct ID string
 */
function extractItemId(input: UpdateItemHandlerInput): string | null {
  // If it's an API Gateway event, extract ID from path parameters
  if (isApiGatewayEvent(input)) {
    const id = input.pathParameters?.id;
    return id || null;
  }
  // For local server, the ID is passed separately, not in the input
  // This will be handled by the server.ts routing
  return null;
}

/**
 * Parse request body from API Gateway event or direct body object
 */
function parseBody(input: UpdateItemHandlerInput): UpdateItemRequest | null {
  // If it's an API Gateway event, parse the body string
  if (isApiGatewayEvent(input)) {
    if (input.body) {
      try {
        return JSON.parse(input.body) as UpdateItemRequest;
      } catch (error) {
        throw new Error('Invalid JSON in request body');
      }
    }
    return null;
  }
  // Otherwise, it's already a parsed body from local server
  return input as LocalServerBody;
}

/**
 * Update item handler
 * 
 * Handles two input scenarios:
 * 1. API Gateway event - when deployed to Lambda via API Gateway (extracts ID from pathParameters, body from event.body)
 * 2. Direct body object - when called from local server (curl request)
 * 
 * @param input - API Gateway HTTP event or parsed body object from local server
 * @param itemId - Item ID (required for local server, extracted from event for API Gateway)
 * @returns API Gateway response or local server response
 */
export async function updateItemHandler(
  input: UpdateItemHandlerInput,
  itemId?: string
): Promise<UpdateItemHandlerResponse> {
  const isApiGateway = isApiGatewayEvent(input);
  
  try {
    // Extract item ID
    const id = isApiGateway ? extractItemId(input) : itemId;
    
    if (!id) {
      return formatResponse<ExamItem>(
        {
          statusCode: 400,
          body: { error: 'Item ID is required' },
        },
        isApiGateway
      );
    }

    // Parse request body
    const body = parseBody(input);
    
    if (!body || Object.keys(body).length === 0) {
      return formatResponse<ExamItem>(
        {
          statusCode: 400,
          body: { error: 'Request body is required with at least one field to update' },
        },
        isApiGateway
      );
    }

    // Validate request data
    const validationResult = UpdateItemSchema.safeParse(body);
    
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      return formatResponse<ExamItem>(
        {
          statusCode: 400,
          body: {
            error: 'Validation failed',
            details: errors,
          },
        },
        isApiGateway
      );
    }

    // Update the item
    const updatedItem = await storage.updateItem(id, validationResult.data as UpdateItemRequest);

    if (!updatedItem) {
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
        body: updatedItem,
      },
      isApiGateway
    );
  } catch (error) {
    console.error('Error updating item:', error);
    
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
export const handler = async (event: UpdateItemHandlerInput) => {
  // Extract item ID from path parameters for API Gateway
  const itemId = isApiGatewayEvent(event) ? (extractItemId(event) ?? undefined) : undefined;
  return updateItemHandler(event, itemId);
};

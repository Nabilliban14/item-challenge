/**
 * Create Item Handler
 * 
 * Handles POST /api/items endpoint for creating new exam items.
 * Works with both Lambda events (API Gateway) and local HTTP server.
 */

import { z } from 'zod';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { createStorage } from '../../storage/index.js';
import { CreateItemRequest, ExamItem } from '../../types/item.js';
import { isApiGatewayEvent, formatResponse, getErrorMessage, type HandlerResponse, type LocalServerResponse } from '../utils.js';

const storage = createStorage();

// Zod schema for request validation
const CreateItemSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  itemType: z.enum(['multiple-choice', 'free-response', 'essay'], {
    errorMap: () => ({ message: 'itemType must be one of: multiple-choice, free-response, essay' }),
  }),
  difficulty: z.number().int().min(1).max(5, 'Difficulty must be between 1 and 5'),
  content: z.object({
    question: z.string().min(1, 'Question is required'),
    options: z.array(z.string()).optional(),
    correctAnswer: z.string().min(1, 'Correct answer is required'),
    explanation: z.string().min(1, 'Explanation is required'),
  }),
  metadata: z.object({
    author: z.string().min(1, 'Author is required'),
    status: z.enum(['draft', 'review', 'approved', 'archived'], {
      errorMap: () => ({ message: 'Status must be one of: draft, review, approved, archived' }),
    }),
    tags: z.array(z.string()).default([]),
  }),
  securityLevel: z.enum(['standard', 'secure', 'highly-secure'], {
    errorMap: () => ({ message: 'Security level must be one of: standard, secure, highly-secure' }),
  }),
});

/**
 * Direct body from local server (already parsed JSON)
 * This is what the local server passes when called via curl
 * Can be null if no body is provided
 */
type LocalServerBody = CreateItemRequest | null;

/**
 * Union type for handler input - either API Gateway event or direct body (or null)
 * Uses APIGatewayProxyEvent from @types/aws-lambda for API Gateway events
 */
type CreateItemHandlerInput = APIGatewayProxyEvent | LocalServerBody;

/**
 * Handler response type
 */
type CreateItemHandlerResponse = HandlerResponse<ExamItem>;

/**
 * Parse request body from API Gateway event or direct body object
 */
function parseBody(input: CreateItemHandlerInput): CreateItemRequest | null {
  // If it's an API Gateway event, parse the body string
  if (isApiGatewayEvent(input)) {
    if (input.body) {
      try {
        return JSON.parse(input.body) as CreateItemRequest;
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
 * Create item handler
 * 
 * Handles two input scenarios:
 * 1. API Gateway event - when deployed to Lambda via API Gateway
 * 2. Direct body object - when called from local server (curl request)
 * 
 * @param input - API Gateway HTTP event or parsed body object from local server
 * @param context - Lambda context (null for local server)
 * @returns API Gateway response or local server response
 */
export async function createItemHandler(
  input: CreateItemHandlerInput
): Promise<CreateItemHandlerResponse> {
  const isApiGateway = isApiGatewayEvent(input);
  
  try {
    // Parse request body
    const body = parseBody(input);
    
    if (!body) {
      return formatResponse<ExamItem>(
        {
          statusCode: 400,
          body: { error: 'Request body is required' },
        },
        isApiGateway
      );
    }

    // Validate request data
    const validationResult = CreateItemSchema.safeParse(body);
    
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

    // Create the item
    const item = await storage.createItem(validationResult.data as CreateItemRequest);

    return formatResponse(
      {
        statusCode: 201,
        body: item,
      },
      isApiGateway
    );
  } catch (error) {
    console.error('Error creating item:', error);
    
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
export const handler = createItemHandler;


/**
 * Unit tests for Create Item Handler
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createItemHandler } from "../handlers/create-item/index.js";
import type { APIGatewayProxyEvent } from "aws-lambda";
import type { ExamItem, CreateItemRequest } from "../types/item.js";

// Create mock storage using vi.hoisted to ensure it's available in the mock factory
const { mockStorage } = vi.hoisted(() => {
  return {
    mockStorage: {
      createItem: vi.fn(),
      getItem: vi.fn(),
      updateItem: vi.fn(),
      listItems: vi.fn(),
      createVersion: vi.fn(),
      getAuditTrail: vi.fn(),
    },
  };
});

// Mock the storage module - factory function creates the mock
vi.mock("../storage/index.js", () => {
  return {
    createStorage: () => mockStorage,
  };
});

describe("Create Item Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validItemData: CreateItemRequest = {
    subject: "AP Biology",
    itemType: "multiple-choice",
    difficulty: 3,
    content: {
      question: "What is photosynthesis?",
      options: ["A", "B", "C", "D"],
      correctAnswer: "A",
      explanation: "Photosynthesis is the process...",
    },
    metadata: {
      author: "test-author",
      status: "draft",
      tags: ["biology", "photosynthesis"],
    },
    securityLevel: "standard",
  };

  const mockCreatedItem: ExamItem = {
    id: "test-id-123",
    ...validItemData,
    metadata: {
      ...validItemData.metadata,
      created: Date.now(),
      lastModified: Date.now(),
      version: 1,
    },
  };

  describe("Local server mode (direct body)", () => {
    it("should create an item successfully", async () => {
      mockStorage.createItem.mockResolvedValue(mockCreatedItem);

      const result = await createItemHandler(validItemData);

      expect(result.statusCode).toBe(201);
      if ("body" in result && typeof result.body === "object" && result.body !== null) {
        expect(result.body).toHaveProperty("id", "test-id-123");
        if ("subject" in result.body) {
          expect(result.body.subject).toBe("AP Biology");
        }
      }
      expect(mockStorage.createItem).toHaveBeenCalledWith(validItemData);
    });

    it("should return 400 when body is null", async () => {
      const result = await createItemHandler(null);

      expect(result.statusCode).toBe(400);
      if ("body" in result && typeof result.body === "object" && result.body !== null && "error" in result.body) {
        expect(result.body.error).toBe("Request body is required");
      }
      expect(mockStorage.createItem).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid itemType", async () => {
      const invalidData = { ...validItemData, itemType: "invalid-type" as any };

      const result = await createItemHandler(invalidData);

      expect(result.statusCode).toBe(400);
      if ("body" in result && typeof result.body === "object" && result.body !== null && "error" in result.body) {
        expect(result.body.error).toBe("Validation failed");
        expect("details" in result.body).toBeDefined();
      }
      expect(mockStorage.createItem).not.toHaveBeenCalled();
    });

    it("should return 400 for missing required fields", async () => {
      const invalidData = { ...validItemData };
      delete (invalidData as any).subject;

      const result = await createItemHandler(invalidData);

      expect(result.statusCode).toBe(400);
      if ("body" in result && typeof result.body === "object" && result.body !== null && "error" in result.body) {
        expect(result.body.error).toBe("Validation failed");
      }
      expect(mockStorage.createItem).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid difficulty (out of range)", async () => {
      const invalidData = { ...validItemData, difficulty: 10 };

      const result = await createItemHandler(invalidData);

      expect(result.statusCode).toBe(400);
      if ("body" in result && typeof result.body === "object" && result.body !== null && "error" in result.body) {
        expect(result.body.error).toBe("Validation failed");
      }
      expect(mockStorage.createItem).not.toHaveBeenCalled();
    });

    it("should return 500 when storage throws an error", async () => {
      mockStorage.createItem.mockRejectedValue(new Error("Storage error"));

      const result = await createItemHandler(validItemData);

      expect(result.statusCode).toBe(500);
      if ("body" in result && typeof result.body === "object" && result.body !== null) {
        expect("error" in result.body).toBeDefined();
      }
    });
  });

  describe("API Gateway mode", () => {
    const createApiGatewayEvent = (body: any): APIGatewayProxyEvent => ({
      httpMethod: "POST",
      path: "/api/items",
      pathParameters: null,
      queryStringParameters: null,
      headers: {},
      multiValueHeaders: {},
      body: body ? JSON.stringify(body) : null,
      isBase64Encoded: false,
      requestContext: {} as any,
      resource: "",
      stageVariables: null,
      multiValueQueryStringParameters: null,
    });

    it("should create an item successfully via API Gateway", async () => {
      mockStorage.createItem.mockResolvedValue(mockCreatedItem);

      const event = createApiGatewayEvent(validItemData);
      const result = await createItemHandler(event);

      expect(result.statusCode).toBe(201);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody).toHaveProperty("id", "test-id-123");
      expect(mockStorage.createItem).toHaveBeenCalledWith(validItemData);
    });

    it("should return 400 when body is missing in API Gateway event", async () => {
      const event = createApiGatewayEvent(null);
      const result = await createItemHandler(event);

      expect(result.statusCode).toBe(400);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Request body is required");
    });

    it("should return 400 for invalid JSON in API Gateway event", async () => {
      const event: APIGatewayProxyEvent = {
        ...createApiGatewayEvent(null),
        body: "invalid json{",
      };

      const result = await createItemHandler(event);

      expect(result.statusCode).toBe(500);
      expect("body" in result && typeof result.body === "string").toBe(true);
    });

    it("should return 400 for validation errors via API Gateway", async () => {
      const invalidData = { ...validItemData, difficulty: 0 };
      const event = createApiGatewayEvent(invalidData);

      const result = await createItemHandler(event);

      expect(result.statusCode).toBe(400);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Validation failed");
    });
  });
});


/**
 * Unit tests for Update Item Handler
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateItemHandler } from "../handlers/update-item/index.js";
import type { APIGatewayProxyEvent } from "aws-lambda";
import type { ExamItem, UpdateItemRequest } from "../types/item.js";

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

describe("Update Item Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const existingItem: ExamItem = {
    id: "test-id-123",
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
      tags: ["biology"],
      created: Date.now(),
      lastModified: Date.now(),
      version: 1,
    },
    securityLevel: "standard",
  };

  const updatedItem: ExamItem = {
    ...existingItem,
    subject: "AP Chemistry",
    metadata: {
      ...existingItem.metadata,
      status: "approved",
      lastModified: Date.now(),
      version: 2,
    },
  };

  describe("Local server mode (direct body object)", () => {
    it("should update an item successfully", async () => {
      const updateData: UpdateItemRequest = {
        subject: "AP Chemistry",
        metadata: {
          status: "approved",
        },
      };
      mockStorage.updateItem.mockResolvedValue(updatedItem);

      const result = await updateItemHandler(updateData, "test-id-123");

      expect(result.statusCode).toBe(200);
      expect("body" in result && result.body).toHaveProperty("id", "test-id-123");
      expect("body" in result && "subject" in result.body && result.body.subject).toBe("AP Chemistry");
      expect(mockStorage.updateItem).toHaveBeenCalledWith("test-id-123", updateData);
    });

    it("should return 400 when item ID is missing", async () => {
      const updateData: UpdateItemRequest = { subject: "New Subject" };

      const result = await updateItemHandler(updateData);

      expect(result.statusCode).toBe(400);
      expect("body" in result && "error" in result.body && result.body.error).toBe("Item ID is required");
      expect(mockStorage.updateItem).not.toHaveBeenCalled();
    });

    it("should return 400 when body is null", async () => {
      const result = await updateItemHandler(null, "test-id-123");

      expect(result.statusCode).toBe(400);
      expect("body" in result && "error" in result.body && result.body.error).toBe(
        "Request body is required with at least one field to update"
      );
      expect(mockStorage.updateItem).not.toHaveBeenCalled();
    });

    it("should return 400 when body is empty object", async () => {
      const result = await updateItemHandler({}, "test-id-123");

      expect(result.statusCode).toBe(400);
      expect("body" in result && "error" in result.body && result.body.error).toBe(
        "Request body is required with at least one field to update"
      );
      expect(mockStorage.updateItem).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid itemType", async () => {
      const invalidData = { itemType: "invalid-type" as any };

      const result = await updateItemHandler(invalidData, "test-id-123");

      expect(result.statusCode).toBe(400);
      expect("body" in result && "error" in result.body && result.body.error).toBe("Validation failed");
      expect(mockStorage.updateItem).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid difficulty", async () => {
      const invalidData = { difficulty: 10 };

      const result = await updateItemHandler(invalidData, "test-id-123");

      expect(result.statusCode).toBe(400);
      expect("body" in result && "error" in result.body && result.body.error).toBe("Validation failed");
      expect(mockStorage.updateItem).not.toHaveBeenCalled();
    });

    it("should return 404 when item is not found", async () => {
      mockStorage.updateItem.mockResolvedValue(null);
      const updateData: UpdateItemRequest = { subject: "New Subject" };

      const result = await updateItemHandler(updateData, "non-existent-id");

      expect(result.statusCode).toBe(404);
      expect("body" in result && "error" in result.body && result.body.error).toBe("Item not found");
    });

    it("should return 500 when storage throws an error", async () => {
      mockStorage.updateItem.mockRejectedValue(new Error("Storage error"));
      const updateData: UpdateItemRequest = { subject: "New Subject" };

      const result = await updateItemHandler(updateData, "test-id-123");

      expect(result.statusCode).toBe(500);
      expect("body" in result && "error" in result.body).toBeDefined();
    });
  });

  describe("API Gateway mode", () => {
    const createApiGatewayEvent = (body: any, id: string | null): APIGatewayProxyEvent => ({
      httpMethod: "PUT",
      path: "/api/items/test-id-123",
      pathParameters: id ? { id } : null,
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

    it("should update an item successfully via API Gateway", async () => {
      const updateData: UpdateItemRequest = {
        subject: "AP Chemistry",
        metadata: { status: "approved" },
      };
      mockStorage.updateItem.mockResolvedValue(updatedItem);

      const event = createApiGatewayEvent(updateData, "test-id-123");
      const result = await updateItemHandler(event);

      expect(result.statusCode).toBe(200);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody).toHaveProperty("id", "test-id-123");
      expect(parsedBody.subject).toBe("AP Chemistry");
    });

    it("should return 400 when ID is missing in path parameters", async () => {
      const updateData: UpdateItemRequest = { subject: "New Subject" };
      const event = createApiGatewayEvent(updateData, null);

      const result = await updateItemHandler(event);

      expect(result.statusCode).toBe(400);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Item ID is required");
    });

    it("should return 400 when body is missing", async () => {
      const event = createApiGatewayEvent(null, "test-id-123");

      const result = await updateItemHandler(event);

      expect(result.statusCode).toBe(400);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Request body is required with at least one field to update");
    });

    it("should return 400 for invalid JSON in body", async () => {
      const event: APIGatewayProxyEvent = {
        ...createApiGatewayEvent(null, "test-id-123"),
        body: "invalid json{",
      };

      const result = await updateItemHandler(event);

      expect(result.statusCode).toBe(500);
    });

    it("should return 404 when item is not found via API Gateway", async () => {
      mockStorage.updateItem.mockResolvedValue(null);
      const updateData: UpdateItemRequest = { subject: "New Subject" };
      const event = createApiGatewayEvent(updateData, "non-existent-id");

      const result = await updateItemHandler(event);

      expect(result.statusCode).toBe(404);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Item not found");
    });
  });
});


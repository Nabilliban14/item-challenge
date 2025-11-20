/**
 * Unit tests for Get Item Handler
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getItemHandler } from "../handlers/get-item/index.js";
import type { APIGatewayProxyEvent } from "aws-lambda";
import type { ExamItem } from "../types/item.js";

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

describe("Get Item Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockItem: ExamItem = {
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

  describe("Local server mode (direct ID string)", () => {
    it("should retrieve an item successfully", async () => {
      mockStorage.getItem.mockResolvedValue(mockItem);

      const result = await getItemHandler("test-id-123");

      expect(result.statusCode).toBe(200);
      if ("body" in result && typeof result.body === "object" && result.body !== null) {
        expect(result.body).toHaveProperty("id", "test-id-123");
        if ("subject" in result.body) {
          expect(result.body.subject).toBe("AP Biology");
        }
      }
      expect(mockStorage.getItem).toHaveBeenCalledWith("test-id-123");
    });

    it("should return 404 when item is not found", async () => {
      mockStorage.getItem.mockResolvedValue(null);

      const result = await getItemHandler("non-existent-id");

      expect(result.statusCode).toBe(404);
      if ("body" in result && typeof result.body === "object" && result.body !== null && "error" in result.body) {
        expect(result.body.error).toBe("Item not found");
      }
      expect(mockStorage.getItem).toHaveBeenCalledWith("non-existent-id");
    });

    it("should return 400 when ID is empty string", async () => {
      const result = await getItemHandler("");

      expect(result.statusCode).toBe(400);
      if ("body" in result && typeof result.body === "object" && result.body !== null) {
        expect("error" in result.body).toBeDefined();
      }
      expect(mockStorage.getItem).not.toHaveBeenCalled();
    });

    it("should return 404 when ID is only whitespace (trimmed to empty)", async () => {
      mockStorage.getItem.mockResolvedValue(null);
      const result = await getItemHandler("   ");

      expect(result.statusCode).toBe(404);
      if ("body" in result && typeof result.body === "object" && result.body !== null && "error" in result.body) {
        expect(result.body.error).toBe("Item not found");
      }
      expect(mockStorage.getItem).toHaveBeenCalledWith("");
    });

    it("should return 500 when storage throws an error", async () => {
      mockStorage.getItem.mockRejectedValue(new Error("Storage error"));

      const result = await getItemHandler("test-id-123");

      expect(result.statusCode).toBe(500);
      if ("body" in result && typeof result.body === "object" && result.body !== null) {
        expect("error" in result.body).toBeDefined();
      }
    });
  });

  describe("API Gateway mode", () => {
    const createApiGatewayEvent = (id: string | null): APIGatewayProxyEvent => ({
      httpMethod: "GET",
      path: "/api/items/test-id-123",
      pathParameters: id ? { id } : null,
      queryStringParameters: null,
      headers: {},
      multiValueHeaders: {},
      body: null,
      isBase64Encoded: false,
      requestContext: {} as any,
      resource: "",
      stageVariables: null,
      multiValueQueryStringParameters: null,
    });

    it("should retrieve an item successfully via API Gateway", async () => {
      mockStorage.getItem.mockResolvedValue(mockItem);

      const event = createApiGatewayEvent("test-id-123");
      const result = await getItemHandler(event);

      expect(result.statusCode).toBe(200);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody).toHaveProperty("id", "test-id-123");
      expect(mockStorage.getItem).toHaveBeenCalledWith("test-id-123");
    });

    it("should return 400 when ID is missing in path parameters", async () => {
      const event = createApiGatewayEvent(null);
      const result = await getItemHandler(event);

      expect(result.statusCode).toBe(400);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Item ID is required");
    });

    it("should return 404 when item is not found via API Gateway", async () => {
      mockStorage.getItem.mockResolvedValue(null);

      const event = createApiGatewayEvent("non-existent-id");
      const result = await getItemHandler(event);

      expect(result.statusCode).toBe(404);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Item not found");
    });
  });
});


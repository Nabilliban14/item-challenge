/**
 * Unit tests for Create Version Handler
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVersionHandler } from "../handlers/create-version/index.js";
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

describe("Create Version Handler", () => {
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

  const newVersion: ExamItem = {
    ...existingItem,
    metadata: {
      ...existingItem.metadata,
      version: 2,
      lastModified: Date.now(),
    },
  };

  describe("Local server mode (direct ID string)", () => {
    it("should create a new version successfully", async () => {
      mockStorage.createVersion.mockResolvedValue(newVersion);

      const result = await createVersionHandler("test-id-123");

      expect(result.statusCode).toBe(201);
      if ("body" in result && typeof result.body === "object" && result.body !== null) {
        expect(result.body).toHaveProperty("id", "test-id-123");
        if ("metadata" in result.body) {
          expect(result.body.metadata.version).toBe(2);
        }
      }
      expect(mockStorage.createVersion).toHaveBeenCalledWith("test-id-123");
    });

    it("should return 404 when item is not found", async () => {
      mockStorage.createVersion.mockResolvedValue(null);

      const result = await createVersionHandler("non-existent-id");

      expect(result.statusCode).toBe(404);
      if ("body" in result && typeof result.body === "object" && result.body !== null && "error" in result.body) {
        expect(result.body.error).toBe("Item not found");
      }
      expect(mockStorage.createVersion).toHaveBeenCalledWith("non-existent-id");
    });

    it("should return 400 when ID is empty string", async () => {
      const result = await createVersionHandler("");

      expect(result.statusCode).toBe(400);
      if ("body" in result && typeof result.body === "object" && result.body !== null) {
        expect("error" in result.body).toBeDefined();
      }
      expect(mockStorage.createVersion).not.toHaveBeenCalled();
    });

    it("should return 404 when ID is only whitespace (trimmed to empty)", async () => {
      mockStorage.createVersion.mockResolvedValue(null);
      const result = await createVersionHandler("   ");

      expect(result.statusCode).toBe(404);
      if ("body" in result && typeof result.body === "object" && result.body !== null && "error" in result.body) {
        expect(result.body.error).toBe("Item not found");
      }
      expect(mockStorage.createVersion).toHaveBeenCalledWith("");
    });

    it("should return 500 when storage throws an error", async () => {
      mockStorage.createVersion.mockRejectedValue(new Error("Storage error"));

      const result = await createVersionHandler("test-id-123");

      expect(result.statusCode).toBe(500);
      if ("body" in result && typeof result.body === "object" && result.body !== null) {
        expect("error" in result.body).toBeDefined();
      }
    });
  });

  describe("API Gateway mode", () => {
    const createApiGatewayEvent = (id: string | null): APIGatewayProxyEvent => ({
      httpMethod: "POST",
      path: "/api/items/test-id-123/versions",
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

    it("should create a new version successfully via API Gateway", async () => {
      mockStorage.createVersion.mockResolvedValue(newVersion);

      const event = createApiGatewayEvent("test-id-123");
      const result = await createVersionHandler(event);

      expect(result.statusCode).toBe(201);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody).toHaveProperty("id", "test-id-123");
      expect(parsedBody.metadata.version).toBe(2);
      expect(mockStorage.createVersion).toHaveBeenCalledWith("test-id-123");
    });

    it("should return 400 when ID is missing in path parameters", async () => {
      const event = createApiGatewayEvent(null);
      const result = await createVersionHandler(event);

      expect(result.statusCode).toBe(400);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Item ID is required");
    });

    it("should return 404 when item is not found via API Gateway", async () => {
      mockStorage.createVersion.mockResolvedValue(null);

      const event = createApiGatewayEvent("non-existent-id");
      const result = await createVersionHandler(event);

      expect(result.statusCode).toBe(404);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Item not found");
    });

    it("should return 500 when storage throws an error via API Gateway", async () => {
      mockStorage.createVersion.mockRejectedValue(new Error("Storage error"));

      const event = createApiGatewayEvent("test-id-123");
      const result = await createVersionHandler(event);

      expect(result.statusCode).toBe(500);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody).toHaveProperty("error");
    });
  });
});


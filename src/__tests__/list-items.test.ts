/**
 * Unit tests for List Items Handler
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { listItemsHandler } from "../handlers/list-items/index.js";
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

describe("List Items Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockItems: ExamItem[] = [
    {
      id: "item-1",
      subject: "AP Biology",
      itemType: "multiple-choice",
      difficulty: 3,
      content: {
        question: "Question 1",
        correctAnswer: "A",
        explanation: "Explanation 1",
      },
      metadata: {
        author: "author-1",
        status: "draft",
        tags: [],
        created: Date.now(),
        lastModified: Date.now(),
        version: 1,
      },
      securityLevel: "standard",
    },
    {
      id: "item-2",
      subject: "AP Calculus",
      itemType: "free-response",
      difficulty: 4,
      content: {
        question: "Question 2",
        correctAnswer: "B",
        explanation: "Explanation 2",
      },
      metadata: {
        author: "author-2",
        status: "approved",
        tags: [],
        created: Date.now(),
        lastModified: Date.now(),
        version: 1,
      },
      securityLevel: "secure",
    },
  ];

  describe("Local server mode (direct query object)", () => {
    it("should list items successfully with no filters", async () => {
      mockStorage.listItems.mockResolvedValue({
        items: mockItems,
        total: 2,
      });

      const result = await listItemsHandler({});

      expect(result.statusCode).toBe(200);
      expect("body" in result && result.body).toHaveProperty("items");
      expect("body" in result && result.body).toHaveProperty("total", 2);
      expect("body" in result && "items" in result.body && result.body.items).toHaveLength(2);
      expect(mockStorage.listItems).toHaveBeenCalledWith({});
    });

    it("should list items with subject filter", async () => {
      const filteredItems = [mockItems[0]];
      mockStorage.listItems.mockResolvedValue({
        items: filteredItems,
        total: 1,
      });

      const result = await listItemsHandler({ subject: "AP Biology" });

      expect(result.statusCode).toBe(200);
      expect("body" in result && "items" in result.body && result.body.items).toHaveLength(1);
      expect(mockStorage.listItems).toHaveBeenCalledWith({ subject: "AP Biology" });
    });

    it("should list items with status filter", async () => {
      const filteredItems = [mockItems[1]];
      mockStorage.listItems.mockResolvedValue({
        items: filteredItems,
        total: 1,
      });

      const result = await listItemsHandler({ status: "approved" });

      expect(result.statusCode).toBe(200);
      expect("body" in result && "items" in result.body && result.body.items).toHaveLength(1);
      expect(mockStorage.listItems).toHaveBeenCalledWith({ status: "approved" });
    });

    it("should list items with pagination", async () => {
      mockStorage.listItems.mockResolvedValue({
        items: [mockItems[0]],
        total: 2,
      });

      const result = await listItemsHandler({ limit: 1, offset: 0 });

      expect(result.statusCode).toBe(200);
      expect("body" in result && "items" in result.body && result.body.items).toHaveLength(1);
      expect(mockStorage.listItems).toHaveBeenCalledWith({ limit: 1, offset: 0 });
    });

    it("should return 400 for invalid limit (too high)", async () => {
      const result = await listItemsHandler({ limit: 200 });

      expect(result.statusCode).toBe(400);
      expect("body" in result && "error" in result.body && result.body.error).toBe("Invalid query parameters");
      expect(mockStorage.listItems).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid limit (too low)", async () => {
      const result = await listItemsHandler({ limit: 0 });

      expect(result.statusCode).toBe(400);
      expect("body" in result && "error" in result.body && result.body.error).toBe("Invalid query parameters");
      expect(mockStorage.listItems).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid offset (negative)", async () => {
      const result = await listItemsHandler({ offset: -1 });

      expect(result.statusCode).toBe(400);
      expect("body" in result && "error" in result.body && result.body.error).toBe("Invalid query parameters");
      expect(mockStorage.listItems).not.toHaveBeenCalled();
    });

    it("should return 400 for invalid status", async () => {
      const result = await listItemsHandler({ status: "invalid-status" as any });

      expect(result.statusCode).toBe(400);
      expect("body" in result && "error" in result.body && result.body.error).toBe("Invalid query parameters");
      expect(mockStorage.listItems).not.toHaveBeenCalled();
    });

    it("should return 500 when storage throws an error", async () => {
      mockStorage.listItems.mockRejectedValue(new Error("Storage error"));

      const result = await listItemsHandler({});

      expect(result.statusCode).toBe(500);
      expect("body" in result && "error" in result.body).toBeDefined();
    });
  });

  describe("API Gateway mode", () => {
    const createApiGatewayEvent = (queryParams: Record<string, string | undefined> | null): APIGatewayProxyEvent => ({
      httpMethod: "GET",
      path: "/api/items",
      pathParameters: null,
      queryStringParameters: queryParams,
      headers: {},
      multiValueHeaders: {},
      body: null,
      isBase64Encoded: false,
      requestContext: {} as any,
      resource: "",
      stageVariables: null,
      multiValueQueryStringParameters: null,
    });

    it("should list items successfully via API Gateway", async () => {
      mockStorage.listItems.mockResolvedValue({
        items: mockItems,
        total: 2,
      });

      const event = createApiGatewayEvent({});
      const result = await listItemsHandler(event);

      expect(result.statusCode).toBe(200);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody).toHaveProperty("items");
      expect(parsedBody).toHaveProperty("total", 2);
    });

    it("should handle query parameters via API Gateway", async () => {
      mockStorage.listItems.mockResolvedValue({
        items: [mockItems[0]],
        total: 1,
      });

      const event = createApiGatewayEvent({
        subject: "AP Biology",
        limit: "10",
        offset: "0",
      });
      const result = await listItemsHandler(event);

      expect(result.statusCode).toBe(200);
      expect(mockStorage.listItems).toHaveBeenCalledWith({
        subject: "AP Biology",
        limit: 10,
        offset: 0,
      });
    });

    it("should return 400 for invalid query parameters via API Gateway", async () => {
      const event = createApiGatewayEvent({
        limit: "200", // Too high
      });
      const result = await listItemsHandler(event);

      expect(result.statusCode).toBe(400);
      expect("body" in result && typeof result.body === "string").toBe(true);
      const parsedBody = JSON.parse(result.body as string);
      expect(parsedBody.error).toBe("Invalid query parameters");
    });
  });
});


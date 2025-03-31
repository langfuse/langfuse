/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  makeZodVerifiedAPICall,
  makeAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import {
  GetAnnotationQueuesResponse,
  GetAnnotationQueueByIdResponse,
  GetAnnotationQueueItemsResponse,
  GetAnnotationQueueItemByIdResponse,
  CreateAnnotationQueueItemResponse,
  UpdateAnnotationQueueItemResponse,
  DeleteAnnotationQueueItemResponse,
} from "@/src/features/public-api/types/annotation-queues";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
} from "@langfuse/shared";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";

describe("Annotation Queues API Endpoints", () => {
  let auth: string;
  let projectId: string;
  let queueId: string;
  let queueItemId: string;
  const TOTAL_TEST_QUEUES = 15; // Create enough queues to test pagination
  const TOTAL_TEST_QUEUE_ITEMS = 20; // Create enough queue items to test pagination

  beforeAll(async () => {
    // Create organization, project, and API key for testing
    const { auth: newAuth, projectId: newProjectId } =
      await createOrgProjectAndApiKey();
    auth = newAuth;
    projectId = newProjectId;

    // Create multiple test annotation queues
    const queuePromises = [];
    for (let i = 0; i < TOTAL_TEST_QUEUES; i++) {
      queuePromises.push(
        prisma.annotationQueue.create({
          data: {
            name: `Test Queue ${i + 1}`,
            description: `Test Queue Description ${i + 1}`,
            scoreConfigIds: [],
            projectId,
          },
        }),
      );
    }

    const queues = await Promise.all(queuePromises);
    queueId = queues[0].id; // Use the first queue for specific tests

    // Create multiple test annotation queue items
    const queueItemPromises = [];
    for (let i = 0; i < TOTAL_TEST_QUEUE_ITEMS; i++) {
      // Distribute items across the first 3 queues to test filtering
      const targetQueueId = queues[i % 3].id;

      // Alternate between PENDING and COMPLETED status
      const status =
        i % 2 === 0
          ? AnnotationQueueStatus.PENDING
          : AnnotationQueueStatus.COMPLETED;

      // Set completedAt for COMPLETED items
      const completedAt =
        status === AnnotationQueueStatus.COMPLETED ? new Date() : null;

      queueItemPromises.push(
        prisma.annotationQueueItem.create({
          data: {
            queueId: targetQueueId,
            objectId: uuidv4(),
            objectType: AnnotationQueueObjectType.TRACE,
            status,
            completedAt,
            projectId,
          },
        }),
      );
    }

    const queueItems = await Promise.all(queueItemPromises);
    queueItemId = queueItems[0].id; // Use the first queue item for specific tests
  });

  afterAll(async () => {
    await pruneDatabase();
  });

  describe("GET /annotation-queues", () => {
    it("should get all annotation queues", async () => {
      const response = await makeZodVerifiedAPICall(
        GetAnnotationQueuesResponse,
        "GET",
        "/api/public/annotation-queues",
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty("id");
      expect(response.body.data[0]).toHaveProperty("name");
      expect(response.body.meta).toHaveProperty("totalItems");
      expect(response.body.meta.totalItems).toBe(TOTAL_TEST_QUEUES);
    });

    it("should support pagination with correct limits", async () => {
      const limit = 5;
      const response = await makeZodVerifiedAPICall(
        GetAnnotationQueuesResponse,
        "GET",
        `/api/public/annotation-queues?page=1&limit=${limit}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(limit);
      expect(response.body.data.length).toBe(limit);
      expect(response.body.meta.totalItems).toBe(TOTAL_TEST_QUEUES);
      expect(response.body.meta.totalPages).toBe(
        Math.ceil(TOTAL_TEST_QUEUES / limit),
      );
    });

    it("should return different results for different pages", async () => {
      const limit = 5;

      // Get first page
      const firstPageResponse = await makeZodVerifiedAPICall(
        GetAnnotationQueuesResponse,
        "GET",
        `/api/public/annotation-queues?page=1&limit=${limit}`,
        undefined,
        auth,
      );

      // Get second page
      const secondPageResponse = await makeZodVerifiedAPICall(
        GetAnnotationQueuesResponse,
        "GET",
        `/api/public/annotation-queues?page=2&limit=${limit}`,
        undefined,
        auth,
      );

      expect(firstPageResponse.status).toBe(200);
      expect(secondPageResponse.status).toBe(200);

      // Check that we got different items on each page
      const firstPageIds = firstPageResponse.body.data.map((queue) => queue.id);
      const secondPageIds = secondPageResponse.body.data.map(
        (queue) => queue.id,
      );

      // No IDs should be in both pages
      const intersection = firstPageIds.filter((id) =>
        secondPageIds.includes(id),
      );
      expect(intersection.length).toBe(0);

      // Both pages should have the expected number of items
      expect(firstPageResponse.body.data.length).toBe(limit);
      expect(secondPageResponse.body.data.length).toBe(limit);
    });
  });

  describe("GET /annotation-queues/:queueId", () => {
    it("should get a specific annotation queue", async () => {
      const response = await makeZodVerifiedAPICall(
        GetAnnotationQueueByIdResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(queueId);
      expect(response.body.name).toBe("Test Queue 1");
      expect(response.body.description).toBe("Test Queue Description 1");
    });

    it("should return 404 for non-existent queue", async () => {
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "GET",
        `/api/public/annotation-queues/${nonExistentId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("GET /annotation-queues/:queueId/items", () => {
    it("should get all items for a specific queue", async () => {
      const response = await makeZodVerifiedAPICall(
        GetAnnotationQueueItemsResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}/items`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty("id");
      expect(response.body.data[0]).toHaveProperty("queueId");
      expect(response.body.meta).toHaveProperty("totalItems");
      expect(response.body.data.every((item) => item.queueId === queueId)).toBe(
        true,
      );
    });

    it("should support pagination with correct limits for queue items", async () => {
      const limit = 7;
      const response = await makeZodVerifiedAPICall(
        GetAnnotationQueueItemsResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}/items?page=1&limit=${limit}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.meta.page).toBe(1);
      expect(response.body.meta.limit).toBe(limit);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data.every((item) => item.queueId === queueId)).toBe(
        true,
      );
    });

    it("should return different results for different pages of queue items", async () => {
      // First, create enough items to ensure we have multiple pages
      const itemsToCreate = 15;
      const createPromises = [];

      for (let i = 0; i < itemsToCreate; i++) {
        createPromises.push(
          makeZodVerifiedAPICall(
            CreateAnnotationQueueItemResponse,
            "POST",
            `/api/public/annotation-queues/${queueId}/items`,
            {
              objectId: uuidv4(),
              objectType: AnnotationQueueObjectType.TRACE,
            },
            auth,
          ),
        );
      }

      await Promise.all(createPromises);

      const limit = 7;

      // Get first page
      const firstPageResponse = await makeZodVerifiedAPICall(
        GetAnnotationQueueItemsResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}/items?page=1&limit=${limit}`,
        undefined,
        auth,
      );

      // Get second page
      const secondPageResponse = await makeZodVerifiedAPICall(
        GetAnnotationQueueItemsResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}/items?page=2&limit=${limit}`,
        undefined,
        auth,
      );

      expect(firstPageResponse.status).toBe(200);
      expect(secondPageResponse.status).toBe(200);

      // Check that we got different items on each page
      const firstPageIds = firstPageResponse.body.data.map((item) => item.id);
      const secondPageIds = secondPageResponse.body.data.map((item) => item.id);

      // No IDs should be in both pages
      const intersection = firstPageIds.filter((id) =>
        secondPageIds.includes(id),
      );
      expect(intersection.length).toBe(0);

      // Both pages should have items
      expect(firstPageResponse.body.data.length).toBe(limit);
      expect(secondPageResponse.body.data.length).toBeGreaterThan(0);
    });

    it("should filter by status", async () => {
      const response = await makeZodVerifiedAPICall(
        GetAnnotationQueueItemsResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}/items?status=PENDING`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(
        response.body.data.every(
          (item) =>
            item.queueId === queueId &&
            item.status === AnnotationQueueStatus.PENDING,
        ),
      ).toBe(true);
    });

    it("should return 404 for non-existent queue", async () => {
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "GET",
        `/api/public/annotation-queues/${nonExistentId}/items`,
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("GET /annotation-queues/:queueId/items/:itemId", () => {
    it("should get a specific annotation queue item", async () => {
      // First, get an item that belongs to the queue
      const itemsResponse = await makeZodVerifiedAPICall(
        GetAnnotationQueueItemsResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}/items?limit=1`,
        undefined,
        auth,
      );

      expect(itemsResponse.status).toBe(200);
      expect(itemsResponse.body.data.length).toBeGreaterThan(0);

      const itemId = itemsResponse.body.data[0].id;

      const response = await makeZodVerifiedAPICall(
        GetAnnotationQueueItemByIdResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}/items/${itemId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(itemId);
      expect(response.body.queueId).toBe(queueId);
    });

    it("should return 404 for non-existent queue item", async () => {
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "GET",
        `/api/public/annotation-queues/${queueId}/items/${nonExistentId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-existent queue", async () => {
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "GET",
        `/api/public/annotation-queues/${nonExistentId}/items/${queueItemId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /annotation-queues/:queueId/items", () => {
    it("should create a new annotation queue item", async () => {
      const objectId = uuidv4();
      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueItemResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/items`,
        {
          objectId,
          objectType: AnnotationQueueObjectType.TRACE,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.queueId).toBe(queueId);
      expect(response.body.objectId).toBe(objectId);
      expect(response.body.objectType).toBe(AnnotationQueueObjectType.TRACE);
      expect(response.body.status).toBe(AnnotationQueueStatus.PENDING);
    });

    it("should create queue items with different object types and statuses", async () => {
      // Create a queue item with TRACE object type
      const traceObjectId = uuidv4();
      const traceResponse = await makeZodVerifiedAPICall(
        CreateAnnotationQueueItemResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/items`,
        {
          objectId: traceObjectId,
          objectType: AnnotationQueueObjectType.TRACE,
          status: AnnotationQueueStatus.COMPLETED,
        },
        auth,
      );

      expect(traceResponse.status).toBe(200);
      expect(traceResponse.body.objectType).toBe(
        AnnotationQueueObjectType.TRACE,
      );

      // Create a queue item with OBSERVATION object type
      const observationObjectId = uuidv4();
      const observationResponse = await makeZodVerifiedAPICall(
        CreateAnnotationQueueItemResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/items`,
        {
          objectId: observationObjectId,
          objectType: AnnotationQueueObjectType.OBSERVATION,
          status: AnnotationQueueStatus.PENDING,
        },
        auth,
      );

      expect(observationResponse.status).toBe(200);
      expect(observationResponse.body.objectType).toBe(
        AnnotationQueueObjectType.OBSERVATION,
      );

      // Verify we can retrieve items with different object types
      const itemsResponse = await makeZodVerifiedAPICall(
        GetAnnotationQueueItemsResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}/items`,
        undefined,
        auth,
      );

      expect(itemsResponse.status).toBe(200);

      // Find our created items in the response
      const traceItem = itemsResponse.body.data.find(
        (item) => item.objectId === traceObjectId,
      );
      const observationItem = itemsResponse.body.data.find(
        (item) => item.objectId === observationObjectId,
      );

      expect(traceItem).toBeDefined();
      expect(traceItem?.objectType).toBe(AnnotationQueueObjectType.TRACE);
      expect(traceItem?.status).toBe(AnnotationQueueStatus.COMPLETED);
      expect(observationItem).toBeDefined();
      expect(observationItem?.objectType).toBe(
        AnnotationQueueObjectType.OBSERVATION,
      );
      expect(observationItem?.status).toBe(AnnotationQueueStatus.PENDING);
    });

    it("should return 404 for non-existent queue", async () => {
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/${nonExistentId}/items`,
        {
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /annotation-queues/:queueId/items/:itemId", () => {
    it("should update an annotation queue item to COMPLETED", async () => {
      // Create a new item to update
      const createResponse = await makeZodVerifiedAPICall(
        CreateAnnotationQueueItemResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/items`,
        {
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
        },
        auth,
      );

      const newItemId = createResponse.body.id;

      const response = await makeZodVerifiedAPICall(
        UpdateAnnotationQueueItemResponse,
        "PATCH",
        `/api/public/annotation-queues/${queueId}/items/${newItemId}`,
        {
          status: AnnotationQueueStatus.COMPLETED,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(newItemId);
      expect(response.body.status).toBe(AnnotationQueueStatus.COMPLETED);
      expect(response.body.completedAt).not.toBeNull();
    });

    it("should update an annotation queue item from COMPLETED to PENDING", async () => {
      // Create a new item with COMPLETED status
      const createResponse = await makeZodVerifiedAPICall(
        CreateAnnotationQueueItemResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/items`,
        {
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
          status: AnnotationQueueStatus.COMPLETED,
        },
        auth,
      );

      const newItemId = createResponse.body.id;

      // Verify it was created with COMPLETED status
      expect(createResponse.body.status).toBe(AnnotationQueueStatus.COMPLETED);
      expect(createResponse.body.completedAt).not.toBeNull();

      // Update it to PENDING
      const response = await makeZodVerifiedAPICall(
        UpdateAnnotationQueueItemResponse,
        "PATCH",
        `/api/public/annotation-queues/${queueId}/items/${newItemId}`,
        {
          status: AnnotationQueueStatus.PENDING,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(newItemId);
      expect(response.body.status).toBe(AnnotationQueueStatus.PENDING);
      expect(response.body.completedAt).not.toBeNull(); // is not reset by moving to PENDING
    });

    it("should return 404 for non-existent queue item", async () => {
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "PATCH",
        `/api/public/annotation-queues/${queueId}/items/${nonExistentId}`,
        {
          status: AnnotationQueueStatus.COMPLETED,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-existent queue", async () => {
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "PATCH",
        `/api/public/annotation-queues/${nonExistentId}/items/${queueItemId}`,
        {
          status: AnnotationQueueStatus.COMPLETED,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /annotation-queues/:queueId/items/:itemId", () => {
    it("should delete an annotation queue item", async () => {
      // Create a new item to delete
      const createResponse = await makeZodVerifiedAPICall(
        CreateAnnotationQueueItemResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/items`,
        {
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
        },
        auth,
      );

      const newItemId = createResponse.body.id;

      const response = await makeZodVerifiedAPICall(
        DeleteAnnotationQueueItemResponse,
        "DELETE",
        `/api/public/annotation-queues/${queueId}/items/${newItemId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the item is deleted
      const getResponse = await makeAPICall(
        "GET",
        `/api/public/annotation-queues/${queueId}/items/${newItemId}`,
        undefined,
        auth,
      );

      expect(getResponse.status).toBe(404);
    });

    it("should return 404 for non-existent queue item", async () => {
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "DELETE",
        `/api/public/annotation-queues/${queueId}/items/${nonExistentId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-existent queue", async () => {
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "DELETE",
        `/api/public/annotation-queues/${nonExistentId}/items/${queueItemId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
    });
  });
});

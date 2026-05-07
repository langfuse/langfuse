import { prisma } from "@langfuse/shared/src/db";
import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import {
  GetAnnotationQueuesResponse,
  GetAnnotationQueueByIdResponse,
  GetAnnotationQueueItemsResponse,
  GetAnnotationQueueItemByIdResponse,
  CreateAnnotationQueueItemResponse,
  UpdateAnnotationQueueItemResponse,
  DeleteAnnotationQueueItemResponse,
  CreateAnnotationQueueResponse,
} from "@/src/features/public-api/types/annotation-queues";
import {
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
} from "@langfuse/shared";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";

const TOTAL_TEST_QUEUES = 10; // Create enough queues to test pagination
const TOTAL_TEST_QUEUE_ITEMS = 6; // Create enough queue items to test filtering

describe("Annotation Queues API Endpoints", () => {
  let auth: string;
  let projectId: string;

  const createQueue = (overrides: Partial<{ name: string }> = {}) =>
    prisma.annotationQueue.create({
      data: {
        name: overrides.name ?? "Test Queue 1",
        description: "Test Queue Description 1",
        scoreConfigIds: [],
        projectId,
      },
    });

  const createQueues = async (count = TOTAL_TEST_QUEUES) =>
    Promise.all(
      Array.from({ length: count }, (_, i) =>
        prisma.annotationQueue.create({
          data: {
            name: `Test Queue ${i + 1}`,
            description: `Test Queue Description ${i + 1}`,
            scoreConfigIds: [],
            projectId,
          },
        }),
      ),
    );

  const createQueueItems = async (queueIds: string[]) =>
    Promise.all(
      Array.from({ length: TOTAL_TEST_QUEUE_ITEMS }, (_, i) => {
        // Distribute items across the provided queues to test filtering
        const targetQueueId = queueIds[i % queueIds.length];

        // Alternate between PENDING and COMPLETED status
        const status =
          i % 2 === 0
            ? AnnotationQueueStatus.PENDING
            : AnnotationQueueStatus.COMPLETED;

        // Set completedAt for COMPLETED items
        const completedAt =
          status === AnnotationQueueStatus.COMPLETED ? new Date() : null;

        return prisma.annotationQueueItem.create({
          data: {
            queueId: targetQueueId,
            objectId: uuidv4(),
            objectType: AnnotationQueueObjectType.TRACE,
            status,
            completedAt,
            projectId,
          },
        });
      }),
    );

  const createScoreConfig = (name = "Test Score Config") =>
    prisma.scoreConfig.create({
      data: {
        name,
        description: "Test Score Config Description",
        projectId,
        dataType: "NUMERIC",
      },
    });

  beforeEach(async () => {
    // Create organization, project, and API key for testing
    const { auth: newAuth, projectId: newProjectId } =
      await createOrgProjectAndApiKey();
    auth = newAuth;
    projectId = newProjectId;
  });

  describe("GET /annotation-queues", () => {
    beforeEach(async () => {
      await createQueues();
    });

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

      const [firstPageResponse, secondPageResponse] = await Promise.all([
        makeZodVerifiedAPICall(
          GetAnnotationQueuesResponse,
          "GET",
          `/api/public/annotation-queues?page=1&limit=${limit}`,
          undefined,
          auth,
        ),
        makeZodVerifiedAPICall(
          GetAnnotationQueuesResponse,
          "GET",
          `/api/public/annotation-queues?page=2&limit=${limit}`,
          undefined,
          auth,
        ),
      ]);

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

  describe("POST /annotation-queues", () => {
    it("should create a new annotation queue", async () => {
      const scoreConfig = await createScoreConfig();

      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueResponse,
        "POST",
        "/api/public/annotation-queues",
        {
          name: "Test Queue",
          description: "Test Queue Description",
          scoreConfigIds: [scoreConfig.id],
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe("Test Queue");
      expect(response.body.description).toBe("Test Queue Description");
      expect(response.body.scoreConfigIds).toEqual([scoreConfig.id]);
    });

    it("should create a queue with description set to null", async () => {
      const scoreConfig = await createScoreConfig("Score Config for Null Desc");

      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueResponse,
        "POST",
        "/api/public/annotation-queues",
        {
          name: `Null Desc Queue ${uuidv4()}`,
          description: null,
          scoreConfigIds: [scoreConfig.id],
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.description).toBeNull();
    });

    it("should create a queue with description omitted", async () => {
      const scoreConfig = await createScoreConfig("Score Config for No Desc");

      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueResponse,
        "POST",
        "/api/public/annotation-queues",
        {
          name: `No Desc Queue ${uuidv4()}`,
          scoreConfigIds: [scoreConfig.id],
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.description).toBeNull();
    });

    it("should return 400 if the queue name already exists", async () => {
      await createQueue({ name: "Test Queue" });

      const response = await makeAPICall(
        "POST",
        "/api/public/annotation-queues",
        {
          name: "Test Queue",
          description: "Test Queue Description",
          scoreConfigIds: [],
        },
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("should return 400 if no score config IDs are provided", async () => {
      const response = await makeAPICall(
        "POST",
        "/api/public/annotation-queues",
        {
          name: "No configs queue",
          description: "Test Queue Description",
          scoreConfigIds: [],
        },
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("should return 400 if the score config IDs are invalid", async () => {
      const response = await makeAPICall(
        "POST",
        "/api/public/annotation-queues",
        {
          name: "Invalid configs queue",
          description: "Test Queue Description",
          scoreConfigIds: ["invalid-score-config-id"],
        },
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("should return 405 if the user is on the Hobby plan and has reached the maximum number of annotation queues", async () => {
      const { auth: hobbyPlanAuth, projectId: hobbyProjectId } =
        await createOrgProjectAndApiKey({
          plan: "Hobby",
        });

      const config = await prisma.scoreConfig.create({
        data: {
          name: "Test Score Config",
          description: "Test Score Config Description",
          projectId: hobbyProjectId,
          dataType: "NUMERIC",
        },
      });

      await prisma.annotationQueue.create({
        data: {
          name: "First queue",
          description: "First queue description",
          scoreConfigIds: [config.id],
          projectId: hobbyProjectId,
        },
      });

      const response = await makeAPICall(
        "POST",
        "/api/public/annotation-queues",
        {
          name: "Hobby plan queue",
          description: "Test Queue Description",
          scoreConfigIds: [config.id],
        },
        hobbyPlanAuth,
      );

      expect(response.status).toBe(405);
    });
  });

  describe("GET /annotation-queues/:queueId", () => {
    let queueId: string;

    beforeEach(async () => {
      const queue = await createQueue();
      queueId = queue.id;
    });

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
    let queueId: string;

    beforeEach(async () => {
      const queues = await createQueues(3);
      queueId = queues[0].id;
      await createQueueItems(queues.map((queue) => queue.id));
    });

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

      await Promise.all(
        Array.from({ length: itemsToCreate }, () =>
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
        ),
      );

      const limit = 7;

      const [firstPageResponse, secondPageResponse] = await Promise.all([
        makeZodVerifiedAPICall(
          GetAnnotationQueueItemsResponse,
          "GET",
          `/api/public/annotation-queues/${queueId}/items?page=1&limit=${limit}`,
          undefined,
          auth,
        ),
        makeZodVerifiedAPICall(
          GetAnnotationQueueItemsResponse,
          "GET",
          `/api/public/annotation-queues/${queueId}/items?page=2&limit=${limit}`,
          undefined,
          auth,
        ),
      ]);

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
    let queueId: string;
    let queueItemId: string;

    beforeEach(async () => {
      const queue = await createQueue();
      queueId = queue.id;
      const queueItem = await prisma.annotationQueueItem.create({
        data: {
          queueId,
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
          status: AnnotationQueueStatus.PENDING,
          projectId,
        },
      });
      queueItemId = queueItem.id;
    });

    it("should get a specific annotation queue item", async () => {
      const response = await makeZodVerifiedAPICall(
        GetAnnotationQueueItemByIdResponse,
        "GET",
        `/api/public/annotation-queues/${queueId}/items/${queueItemId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(queueItemId);
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
    let queueId: string;

    beforeEach(async () => {
      const queue = await createQueue();
      queueId = queue.id;
    });

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
      const traceObjectId = uuidv4();
      const observationObjectId = uuidv4();

      const [traceResponse, observationResponse] = await Promise.all([
        makeZodVerifiedAPICall(
          CreateAnnotationQueueItemResponse,
          "POST",
          `/api/public/annotation-queues/${queueId}/items`,
          {
            objectId: traceObjectId,
            objectType: AnnotationQueueObjectType.TRACE,
            status: AnnotationQueueStatus.COMPLETED,
          },
          auth,
        ),
        makeZodVerifiedAPICall(
          CreateAnnotationQueueItemResponse,
          "POST",
          `/api/public/annotation-queues/${queueId}/items`,
          {
            objectId: observationObjectId,
            objectType: AnnotationQueueObjectType.OBSERVATION,
            status: AnnotationQueueStatus.PENDING,
          },
          auth,
        ),
      ]);

      expect(traceResponse.status).toBe(200);
      expect(traceResponse.body.objectType).toBe(
        AnnotationQueueObjectType.TRACE,
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
    let queueId: string;

    beforeEach(async () => {
      const queue = await createQueue();
      queueId = queue.id;
    });

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
      const queueItem = await prisma.annotationQueueItem.create({
        data: {
          queueId,
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
          status: AnnotationQueueStatus.PENDING,
          projectId,
        },
      });
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "PATCH",
        `/api/public/annotation-queues/${nonExistentId}/items/${queueItem.id}`,
        {
          status: AnnotationQueueStatus.COMPLETED,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /annotation-queues/:queueId/items/:itemId", () => {
    let queueId: string;

    beforeEach(async () => {
      const queue = await createQueue();
      queueId = queue.id;
    });

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
      const queueItem = await prisma.annotationQueueItem.create({
        data: {
          queueId,
          objectId: uuidv4(),
          objectType: AnnotationQueueObjectType.TRACE,
          status: AnnotationQueueStatus.PENDING,
          projectId,
        },
      });
      const nonExistentId = uuidv4();
      const response = await makeAPICall(
        "DELETE",
        `/api/public/annotation-queues/${nonExistentId}/items/${queueItem.id}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
    });
  });
});

import {
  createObservation,
  createScore,
  createScoresCh,
  createTrace,
  getTraceById,
} from "@langfuse/shared/src/server";
import {
  createObservationsCh,
  createTracesCh,
} from "@langfuse/shared/src/server";
import {
  makeZodVerifiedAPICall,
  makeZodVerifiedAPICallSilent,
} from "@/src/__tests__/test-utils";
import {
  DeleteTracesV1Response,
  DeleteTraceV1Response,
  DeleteTraceTagV1Response,
  GetTracesV1Response,
  GetTraceV1Response,
  PatchTraceV1Response,
  PostTraceTagsV1Response,
} from "@/src/features/public-api/types/traces";
import { randomUUID } from "crypto";
import { snakeCase } from "lodash";
import waitForExpect from "wait-for-expect";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/traces API Endpoint", () => {
  describe("GET /api/public/traces/{traceId}", () => {
    it("should get a single trace by ID with observations", async () => {
      const createdTrace = createTrace({
        name: "trace-name",
        user_id: "user-1",
        project_id: projectId,
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      });

      const observations = [
        createObservation({
          trace_id: createdTrace.id,
          project_id: createdTrace.project_id,
          name: "observation-name",
          end_time: new Date().getTime(),
          start_time: new Date().getTime() - 1000,
          input: "input",
          output: "output",
        }),
        createObservation({
          trace_id: createdTrace.id,
          project_id: createdTrace.project_id,
          name: "observation-name-2",
          end_time: new Date().getTime(),
          start_time: new Date().getTime() - 100000,
          input: "input-2",
          output: "output-2",
        }),
      ];

      await createTracesCh([createdTrace]);
      await createObservationsCh(observations);

      const trace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        "/api/public/traces/" + createdTrace.id,
      );

      expect(trace.body.name).toBe("trace-name");
      expect(trace.body.release).toBe("1.0.0");
      expect(trace.body.externalId).toBeNull();
      expect(trace.body.version).toBe("2.0.0");
      expect(trace.body.projectId).toBe(projectId);
      expect(trace.body.latency).toBeCloseTo(100, 2);
      expect(trace.body.observations.length).toBe(2);
      expect(trace.body.scores.length).toBe(0);
      expect(trace.body.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "observation-name-2",
            input: "input-2",
            output: "output-2",
          }),
          expect.objectContaining({
            name: "observation-name",
            input: "input",
            output: "output",
          }),
        ]),
      );
    });

    it("should handle unescaped metadata in single trace endpoint (LFE-3699)", async () => {
      const traceId = randomUUID();
      const trace = createTrace({
        id: traceId,
        name: "trace-name1",
        project_id: projectId,
        metadata: { key: JSON.stringify({ foo: "bar" }) },
        input: JSON.stringify({
          args: [
            {
              foo: "bar",
            },
          ],
        }),
      });

      await createTracesCh([trace]);

      const traceResponse = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${traceId}`,
      );

      expect(traceResponse.body.name).toBe("trace-name1");
      expect(traceResponse.body.metadata).toEqual({ key: { foo: "bar" } });
      expect(traceResponse.body.input).toEqual({
        args: [
          {
            foo: "bar",
          },
        ],
      });
    });
  });

  describe("GET /api/public/traces", () => {
    it("should fetch all traces", async () => {
      const timestamp = new Date();
      const createdTrace = createTrace({
        name: "trace-name",
        user_id: "user-1",
        timestamp: timestamp.getTime(),
        project_id: projectId,
        metadata: { key: "value", jsonKey: JSON.stringify({ foo: "bar" }) },
        release: "1.0.0",
        version: "2.0.0",
      });

      const observations = [
        createObservation({
          trace_id: createdTrace.id,
          project_id: createdTrace.project_id,
          name: "observation-name",
          end_time: timestamp.getTime(),
          start_time: timestamp.getTime() - 1000,
          input: "input",
          output: "output",
        }),
        createObservation({
          trace_id: createdTrace.id,
          project_id: createdTrace.project_id,
          name: "observation-name-2",
          end_time: timestamp.getTime(),
          start_time: timestamp.getTime() - 100000,
          input: "input-2",
          output: "output-2",
        }),
      ];

      await createTracesCh([createdTrace]);
      await createObservationsCh(observations);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces",
      );

      expect(traces.body.meta.totalItems).toBeGreaterThanOrEqual(1);
      expect(traces.body.data.length).toBeGreaterThanOrEqual(1);
      const trace = traces.body.data.find((t) => t.id === createdTrace.id);
      expect(trace).toBeTruthy();
      if (!trace) {
        return; // to satisfy TypeScript
      }
      expect(trace.name).toBe("trace-name");
      expect(trace.release).toBe("1.0.0");
      expect(trace.metadata.key).toBe("value");
      expect(trace.metadata.jsonKey).toEqual({ foo: "bar" });
      expect(trace.externalId).toBeNull();
      expect(trace.version).toBe("2.0.0");
      expect(trace.projectId).toBe(projectId);
      expect(trace.latency).toBe(100);
      expect(trace.observations.length).toBe(2);
      expect(trace.scores.length).toBe(0);
      expect(trace.timestamp).toBe(timestamp.toISOString());
    });

    it.each([
      ["userId", randomUUID()],
      ["sessionId", randomUUID()],
      ["release", randomUUID()],
      ["version", randomUUID()],
      ["name", randomUUID()],
      ["environment", randomUUID()],
    ])(
      "should filter traces by a value (%s, %s)",
      async (prop: string, value: string) => {
        const createdTrace = createTrace({
          [snakeCase(prop)]: value,
          project_id: projectId,
          metadata: { key: "value" },
        });

        // Create a trace in the project that should not be returned
        const dummyTrace = createTrace({
          project_id: projectId,
          metadata: { key: "value" },
        });

        await createTracesCh([createdTrace, dummyTrace]);

        const traces = await makeZodVerifiedAPICall(
          GetTracesV1Response,
          "GET",
          `/api/public/traces?${prop}=${value}`,
        );

        expect(traces.body.meta.totalItems).toBe(1);
        expect(traces.body.data.length).toBe(1);
        const trace = traces.body.data[0];
        expect(trace.projectId).toBe(projectId);
        expect((trace as any)[prop]).toBe(value);
      },
    );

    it("should filter traces, observations, and scores by environment", async () => {
      const environment = randomUUID();
      const traceId = randomUUID();
      const createdTrace = createTrace({
        id: traceId,
        name: "trace-name",
        project_id: projectId,
        metadata: { key: "value" },
        environment,
      });

      await createTracesCh([createdTrace]);

      await createObservationsCh([
        createObservation({
          trace_id: traceId,
          environment,
          project_id: projectId,
        }),
        // Create one that does not belong to the same environment
        createObservation({
          trace_id: traceId,
          environment: "default",
          project_id: projectId,
        }),
      ]);

      await createScoresCh([
        createScore({
          trace_id: traceId,
          environment,
          project_id: projectId,
        }),
        // Create one that does not belong to the same environment
        createScore({
          trace_id: traceId,
          environment: "default",
          project_id: projectId,
        }),
      ]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        `/api/public/traces?environment=${environment}`,
      );

      expect(traces.body.meta.totalItems).toBe(1);
      expect(traces.body.data.length).toBe(1);
      const trace = traces.body.data[0];
      expect(trace.projectId).toBe(projectId);
      expect(trace.observations.length).toBe(1);
      expect(trace.scores.length).toBe(1);
    });

    it("should filter traces by tag", async () => {
      const tag = randomUUID();
      const createdTrace = createTrace({
        name: "trace-name",
        project_id: projectId,
        metadata: { key: "value" },
        tags: [tag],
      });

      await createTracesCh([createdTrace]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        `/api/public/traces?tags=${[tag]}`,
      );

      expect(traces.body.meta.totalItems).toBe(1);
      expect(traces.body.data.length).toBe(1);
      const trace = traces.body.data[0];
      expect(trace.projectId).toBe(projectId);
    });

    it("should implement pagination for traces", async () => {
      const tag = randomUUID();
      const createdTrace1 = createTrace({
        name: "trace-name",
        project_id: projectId,
        metadata: { key: "value" },
        tags: [tag],
      });
      const createdTrace2 = createTrace({
        name: "trace-name",
        project_id: projectId,
        metadata: { key: "value" },
        tags: [tag],
      });
      const createdTrace3 = createTrace({
        name: "trace-name",
        project_id: projectId,
        metadata: { key: "value" },
        tags: [tag],
      });

      await createTracesCh([createdTrace1, createdTrace2, createdTrace3]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        `/api/public/traces?tags=${[tag]}&limit=1&offset=1`,
      );

      expect(traces.body.meta.totalItems).toBe(3);
      expect(traces.body.data.length).toBe(1);
      expect(traces.body.meta.totalPages).toBe(3);
      const trace = traces.body.data[0];
      expect(trace.projectId).toBe(projectId);
    });

    it("should sort traces with custom order", async () => {
      const tag = randomUUID();
      const createdTrace1 = createTrace({
        name: "trace-name1",
        project_id: projectId,
        metadata: { key: "value" },
        tags: [tag],
      });
      const createdTrace2 = createTrace({
        name: "trace-name2",
        project_id: projectId,
        metadata: { key: "value" },
        tags: [tag],
      });

      await createTracesCh([createdTrace1, createdTrace2]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        `/api/public/traces?tags=${[tag]}&orderBy=name.desc`,
      );

      expect(traces.body.meta.totalItems).toBe(2);
      expect(traces.body.data.length).toBe(2);
      const trace1 = traces.body.data[0];
      expect(trace1.name).toBe("trace-name2");
      const trace2 = traces.body.data[1];
      expect(trace2.name).toBe("trace-name1");
    });

    it("should return 400 error when page=0", async () => {
      const response = await makeZodVerifiedAPICallSilent(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?page=0&limit=10",
      );

      expect(response.status).toBe(400);
    });

    it("should handle unescaped metadata in traces list (LFE-3699)", async () => {
      const traceId = randomUUID();
      const trace = createTrace({
        id: traceId,
        name: "trace-name1",
        project_id: projectId,
        metadata: { key: JSON.stringify({ foo: "bar" }) },
        input: JSON.stringify({
          args: [
            {
              foo: "bar",
            },
          ],
        }),
      });

      await createTracesCh([trace]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        `/api/public/traces`,
      );

      const traceResponse = traces.body.data.find((t) => t.id === traceId);
      expect(traceResponse).toBeDefined();
      expect(traceResponse!.name).toBe("trace-name1");
      expect(traceResponse!.metadata).toEqual({ key: { foo: "bar" } });
      expect(traceResponse!.input).toEqual({
        args: [
          {
            foo: "bar",
          },
        ],
      });
    });
  });

  describe("DELETE /api/public/traces/{traceId}", () => {
    it("should delete a single trace", async () => {
      // Setup
      const createdTrace = createTrace({
        name: "trace-to-delete",
        project_id: projectId,
      });
      await createTracesCh([createdTrace]);

      // When
      const deleteResponse = await makeZodVerifiedAPICall(
        DeleteTraceV1Response,
        "DELETE",
        `/api/public/traces/${createdTrace.id}`,
      );

      // Then
      expect(deleteResponse.status).toBe(200);
      await waitForExpect(async () => {
        const trace = await getTraceById(createdTrace.id, projectId);
        expect(trace).toBeUndefined();
      }, 10_000);
    }, 10_000);
  });

  describe("DELETE /api/public/traces", () => {
    it("should delete multiple traces", async () => {
      // Setup
      const createdTrace1 = createTrace({
        name: "trace-to-delete-1",
        project_id: projectId,
      });
      const createdTrace2 = createTrace({
        name: "trace-to-delete-2",
        project_id: projectId,
      });
      await createTracesCh([createdTrace1, createdTrace2]);

      // When
      const deleteResponse = await makeZodVerifiedAPICall(
        DeleteTracesV1Response,
        "DELETE",
        `/api/public/traces`,
        {
          traceIds: [createdTrace1.id, createdTrace2.id],
        },
      );

      // Then
      expect(deleteResponse.status).toBe(200);
      await waitForExpect(async () => {
        const trace1 = await getTraceById(createdTrace1.id, projectId);
        expect(trace1).toBeUndefined();
        const trace2 = await getTraceById(createdTrace2.id, projectId);
        expect(trace2).toBeUndefined();
      }, 25_000);
    }, 30_000);
  });

  describe("PATCH /api/public/traces/{traceId}", () => {
    it("should update all properties of a trace", async () => {
      // Setup
      const initialTags = ["initial-tag-1", "initial-tag-2"];
      const createdTrace = createTrace({
        name: "trace-to-update",
        project_id: projectId,
        bookmarked: false,
        public: false,
        tags: initialTags,
      });
      await createTracesCh([createdTrace]);

      // First verify the initial state
      const initialTrace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${createdTrace.id}`,
      );
      expect(initialTrace.body.bookmarked).toBe(false);
      expect(initialTrace.body.public).toBe(false);
      expect(initialTrace.body.tags).toEqual(initialTags);

      // When - update all three properties
      const newTags = ["new-tag-1", "new-tag-2", "new-tag-3"];
      const updateResponse = await makeZodVerifiedAPICall(
        PatchTraceV1Response,
        "PATCH",
        `/api/public/traces/${createdTrace.id}`,
        {
          bookmarked: true,
          public: true,
          tags: newTags,
        },
        undefined,
        202,
      );

      // Then
      expect(updateResponse.status).toBe(202);
      expect(updateResponse.body.id).toBe(createdTrace.id);

      // Verify through a separate GET request
      const updatedTrace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${createdTrace.id}`,
      );
      expect(updatedTrace.body.bookmarked).toBe(true);
      expect(updatedTrace.body.public).toBe(true);
      expect(updatedTrace.body.tags).toEqual(newTags);
    });

    it("should partially update a trace", async () => {
      // Setup
      const initialTags = ["partial-tag-1", "partial-tag-2"];
      const createdTrace = createTrace({
        name: "trace-to-partially-update",
        project_id: projectId,
        bookmarked: false,
        public: false,
        tags: initialTags,
      });
      await createTracesCh([createdTrace]);

      // When - update only bookmarked property
      const updateResponse = await makeZodVerifiedAPICall(
        PatchTraceV1Response,
        "PATCH",
        `/api/public/traces/${createdTrace.id}`,
        {
          bookmarked: true,
        },
        undefined,
        202,
      );

      // Then
      expect(updateResponse.status).toBe(202);
      expect(updateResponse.body.id).toBe(createdTrace.id);

      // Verify through a separate GET request
      const updatedTrace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${createdTrace.id}`,
      );
      expect(updatedTrace.body.bookmarked).toBe(true);
      expect(updatedTrace.body.public).toBe(false);
      expect(updatedTrace.body.tags).toEqual(initialTags);
    });

    it("should return a 400 error when request body is empty", async () => {
      // Setup
      const createdTrace = createTrace({
        name: "trace-for-empty-patch",
        project_id: projectId,
      });
      await createTracesCh([createdTrace]);

      // When - send an empty update object
      const response = await makeZodVerifiedAPICallSilent(
        PatchTraceV1Response,
        "PATCH",
        `/api/public/traces/${createdTrace.id}`,
        {},
      );

      // Then
      expect(response.status).toBe(400);
    });

    it("should return a 404 error for non-existent trace", async () => {
      const nonExistentTraceId = "non-existent-trace-id";

      // When - try to update a non-existent trace
      const response = await makeZodVerifiedAPICallSilent(
        PatchTraceV1Response,
        "PATCH",
        `/api/public/traces/${nonExistentTraceId}`,
        {
          bookmarked: true,
        },
      );

      // Then
      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/public/traces/{traceId}/tags", () => {
    it("should add a new tag to a trace", async () => {
      // Setup
      const initialTags = ["existing-tag-1", "existing-tag-2"];
      const createdTrace = createTrace({
        name: "trace-to-add-tag",
        project_id: projectId,
        tags: initialTags,
      });
      await createTracesCh([createdTrace]);

      // First verify the initial state
      const initialTrace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${createdTrace.id}`,
      );
      expect(initialTrace.body.tags).toEqual(initialTags);

      // When - add a new tag
      const newTag = "new-single-tag";
      const addTagResponse = await makeZodVerifiedAPICall(
        PostTraceTagsV1Response,
        "POST",
        `/api/public/traces/${createdTrace.id}/tags`,
        {
          tag: newTag,
        },
        undefined,
        202,
      );

      // Then
      expect(addTagResponse.status).toBe(202); // Expecting 202 Accepted for background processing
      expect(addTagResponse.body.id).toBe(createdTrace.id);

      // Verify the tag was added
      const updatedTrace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${createdTrace.id}`,
      );

      const expectedTags = [...initialTags, newTag];
      expect(updatedTrace.body.tags).toEqual(
        expect.arrayContaining(expectedTags),
      );
      expect(updatedTrace.body.tags.length).toBe(expectedTags.length);
    });

    it("should not add a duplicate tag", async () => {
      // Setup
      const initialTags = ["duplicate-tag", "other-tag"];
      const createdTrace = createTrace({
        name: "trace-for-duplicate-tag",
        project_id: projectId,
        tags: initialTags,
      });
      await createTracesCh([createdTrace]);

      // When - try to add a tag that already exists
      const addTagResponse = await makeZodVerifiedAPICall(
        PostTraceTagsV1Response,
        "POST",
        `/api/public/traces/${createdTrace.id}/tags`,
        {
          tag: "duplicate-tag",
        },
        undefined,
        202,
      );

      // Then
      expect(addTagResponse.status).toBe(202);

      // Verify the tags remain unchanged
      const updatedTrace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${createdTrace.id}`,
      );
      expect(updatedTrace.body.tags).toEqual(initialTags);
      expect(updatedTrace.body.tags.length).toBe(initialTags.length);
    });

    it("should return a 404 error for non-existent trace", async () => {
      const nonExistentTraceId = "non-existent-trace-id";

      // When - try to add a tag to a non-existent trace
      const response = await makeZodVerifiedAPICallSilent(
        PostTraceTagsV1Response,
        "POST",
        `/api/public/traces/${nonExistentTraceId}/tags`,
        {
          tag: "tag-for-non-existent-trace",
        },
      );

      // Then
      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/public/traces/{traceId}/tags/{tagId}", () => {
    it("should remove a tag from a trace", async () => {
      // Setup
      const tagToRemove = "tag-to-remove";
      const initialTags = ["keep-tag-1", tagToRemove, "keep-tag-2"];
      const createdTrace = createTrace({
        name: "trace-to-remove-tag",
        project_id: projectId,
        tags: initialTags,
      });
      await createTracesCh([createdTrace]);

      // First verify the initial state
      const initialTrace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${createdTrace.id}`,
      );
      expect(initialTrace.body.tags).toEqual(initialTags);

      // When - remove a tag
      const removeTagResponse = await makeZodVerifiedAPICall(
        DeleteTraceTagV1Response,
        "DELETE",
        `/api/public/traces/${createdTrace.id}/tags/${tagToRemove}`,
        undefined,
        undefined,
        202,
      );

      // Then
      expect(removeTagResponse.status).toBe(202); // Expecting 202 Accepted for background processing
      expect(removeTagResponse.body.id).toBe(createdTrace.id);

      // Verify the tag was removed
      const updatedTrace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${createdTrace.id}`,
      );

      const expectedTags = initialTags.filter((tag) => tag !== tagToRemove);
      expect(updatedTrace.body.tags).toEqual(expectedTags);
      expect(updatedTrace.body.tags.length).toBe(expectedTags.length);
    });

    it("should be a no-op when removing a non-existent tag", async () => {
      // Setup
      const initialTags = ["tag-1", "tag-2"];
      const createdTrace = createTrace({
        name: "trace-for-non-existent-tag",
        project_id: projectId,
        tags: initialTags,
      });
      await createTracesCh([createdTrace]);

      // When - try to remove a tag that doesn't exist
      const removeTagResponse = await makeZodVerifiedAPICall(
        DeleteTraceTagV1Response,
        "DELETE",
        `/api/public/traces/${createdTrace.id}/tags/non-existent-tag`,
        undefined,
        undefined,
        202,
      );

      // Then
      expect(removeTagResponse.status).toBe(202);

      // Verify the tags remain unchanged
      const updatedTrace = await makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${createdTrace.id}`,
      );
      expect(updatedTrace.body.tags).toEqual(initialTags);
    });

    it("should return a 404 error for non-existent trace", async () => {
      const nonExistentTraceId = "non-existent-trace-id";

      // When - try to remove a tag from a non-existent trace
      const response = await makeZodVerifiedAPICallSilent(
        DeleteTraceTagV1Response,
        "DELETE",
        `/api/public/traces/${nonExistentTraceId}/tags/some-tag`,
      );

      // Then
      expect(response.status).toBe(404);
    });
  });
});

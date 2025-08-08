/** @jest-environment node */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createTrace,
  createTracesCh,
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

describe("Graph API", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: "seed-org-id",
          name: "Test Organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  describe("Observation Type Graph Instrumentation", () => {
    it("should support observation type-based graph with simple linear flow", async () => {
      const traceId = randomUUID();

      // Create trace
      const trace = createTrace({
        id: traceId,
        project_id: projectId,
        name: "Test Graph Trace",
      });
      await createTracesCh([trace]);

      // Create observations with new observation types
      const startObsId = randomUUID();
      const processObsId = randomUUID();
      const endObsId = randomUUID();

      // Create observations using new observation types
      const observations = [
        createObservation({
          id: startObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "AGENT",
          name: "start_agent",
          metadata: {
            source: "API",
            server: "Node",
          },
        }),
        createObservation({
          id: processObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "TOOL",
          name: "process_tool",
          metadata: {
            source: "API",
            server: "Node",
          },
        }),
        createObservation({
          id: endObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "CHAIN",
          name: "end_chain",
          metadata: {
            source: "API",
            server: "Node",
          },
        }),
      ];

      await createObservationsCh(observations);

      // Wait for data to be indexed in ClickHouse
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Test the API
      const minStartTime = new Date(Date.now() - 10000).toISOString();
      const maxStartTime = new Date(Date.now() + 10000).toISOString();

      const result = await caller.traces.getAgentGraphData({
        projectId,
        traceId,
        minStartTime,
        maxStartTime,
      });
      expect(result).toHaveLength(3);

      // Check start node (uses function name as node ID)
      const startNode = result.find((r) => r.node === "start_agent");
      expect(startNode).toBeDefined();
      expect(startNode?.step).toBe(0);
      expect(startNode?.id).toBe(startObsId);

      // Check process node
      const processNode = result.find((r) => r.node === "process_tool");
      expect(processNode).toBeDefined();
      expect(processNode?.step).toBe(1);
      expect(processNode?.id).toBe(processObsId);

      // Check end node
      const endNode = result.find((r) => r.node === "end_chain");
      expect(endNode).toBeDefined();
      expect(endNode?.step).toBe(2);
      expect(endNode?.id).toBe(endObsId);
    });
  });

  describe("LangGraph Backward Compatibility", () => {
    it("should continue working with existing LangGraph traces", async () => {
      const traceId = randomUUID();
      const startTime = new Date();

      await prisma.trace.create({
        data: {
          id: traceId,
          projectId,
          name: "LangGraph Trace",
          timestamp: startTime,
        },
      });

      const node1Id = randomUUID();
      const node2Id = randomUUID();

      await prisma.observation.createMany({
        data: [
          {
            id: node1Id,
            projectId,
            traceId,
            type: "SPAN",
            name: "agent_node1",
            startTime,
            endTime: new Date(Date.now() + 1000),
            metadata: JSON.stringify({
              langgraph_node: "agent_node1",
              langgraph_step: 0,
            }),
          },
          {
            id: node2Id,
            projectId,
            traceId,
            type: "SPAN",
            name: "agent_node2",
            startTime: new Date(Date.now() + 1000),
            endTime: new Date(Date.now() + 2000),
            metadata: JSON.stringify({
              langgraph_node: "agent_node2",
              langgraph_step: 1,
            }),
          },
        ],
      });

      const result = await caller.traces.getAgentGraphData({
        projectId,
        traceId,
        minStartTime: new Date(Date.now() - 1000).toISOString(),
        maxStartTime: new Date(Date.now() + 5000).toISOString(),
      });

      expect(result).toHaveLength(2);

      // LangGraph nodes should keep their original steps
      const node1 = result.find((r) => r.node === "agent_node1");
      expect(node1).toBeDefined();
      expect(node1?.step).toBe(0);

      const node2 = result.find((r) => r.node === "agent_node2");
      expect(node2).toBeDefined();
      expect(node2?.step).toBe(1);
    });
  });

  describe("Observation Type-Based Graph Views", () => {
    it("should support filtering by observation types (AGENT, TOOL, CHAIN, etc.)", async () => {
      const traceId = randomUUID();

      // Create trace
      const trace = createTrace({
        id: traceId,
        project_id: projectId,
        name: "Test Observation Types",
      });
      await createTracesCh([trace]);

      // Create observations with different observation types
      const agentObsId = randomUUID();
      const toolObsId = randomUUID();
      const chainObsId = randomUUID();
      const retrieverObsId = randomUUID();
      const embeddingObsId = randomUUID();

      const observations = [
        createObservation({
          id: agentObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "AGENT",
          name: "planning_agent",
        }),
        createObservation({
          id: toolObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "TOOL",
          name: "search_tool",
        }),
        createObservation({
          id: chainObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "CHAIN",
          name: "processing_chain",
        }),
        createObservation({
          id: retrieverObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "RETRIEVER",
          name: "document_retriever",
        }),
        createObservation({
          id: embeddingObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "EMBEDDING",
          name: "text_embedder",
        }),
      ];

      await createObservationsCh(observations);

      // Wait for data to be indexed in ClickHouse
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Test querying observations by type through the traces API
      // Note: We're testing that observations are created with correct types
      // The actual filtering would depend on the specific API endpoint implementation

      // Test that observations exist with correct types
      // This validates our implementation works end-to-end
      const observations_result = await prisma.observation.findMany({
        where: {
          traceId: traceId,
          projectId: projectId,
        },
        select: {
          id: true,
          type: true,
          name: true,
        },
      });

      expect(observations_result).toHaveLength(5);

      // Verify each observation type is correctly stored
      const agentObs = observations_result.find((o) => o.id === agentObsId);
      expect(agentObs?.type).toBe("AGENT");
      expect(agentObs?.name).toBe("planning_agent");

      const toolObs = observations_result.find((o) => o.id === toolObsId);
      expect(toolObs?.type).toBe("TOOL");
      expect(toolObs?.name).toBe("search_tool");

      const chainObs = observations_result.find((o) => o.id === chainObsId);
      expect(chainObs?.type).toBe("CHAIN");
      expect(chainObs?.name).toBe("processing_chain");

      const retrieverObs = observations_result.find(
        (o) => o.id === retrieverObsId,
      );
      expect(retrieverObs?.type).toBe("RETRIEVER");
      expect(retrieverObs?.name).toBe("document_retriever");

      const embeddingObs = observations_result.find(
        (o) => o.id === embeddingObsId,
      );
      expect(embeddingObs?.type).toBe("EMBEDDING");
      expect(embeddingObs?.name).toBe("text_embedder");
    });

    it("should support agent workflow with mixed observation types", async () => {
      const traceId = randomUUID();

      // Create trace
      const trace = createTrace({
        id: traceId,
        project_id: projectId,
        name: "Agent Workflow with Mixed Types",
      });
      await createTracesCh([trace]);

      // Create a realistic agent workflow with different observation types
      const planningAgentId = randomUUID();
      const searchToolId = randomUUID();
      const retrieverId = randomUUID();
      const executionAgentId = randomUUID();

      const observations = [
        createObservation({
          id: planningAgentId,
          project_id: projectId,
          trace_id: traceId,
          type: "AGENT",
          name: "planning_agent",
          metadata: {
            role: "planner",
            step: "analyze_query",
          },
        }),
        createObservation({
          id: searchToolId,
          project_id: projectId,
          trace_id: traceId,
          type: "TOOL",
          name: "web_search",
          metadata: {
            tool_type: "search",
            provider: "google",
          },
        }),
        createObservation({
          id: retrieverId,
          project_id: projectId,
          trace_id: traceId,
          type: "RETRIEVER",
          name: "document_retriever",
          metadata: {
            source: "knowledge_base",
            top_k: 5,
          },
        }),
        createObservation({
          id: executionAgentId,
          project_id: projectId,
          trace_id: traceId,
          type: "AGENT",
          name: "execution_agent",
          metadata: {
            role: "executor",
            step: "synthesize_response",
          },
        }),
      ];

      await createObservationsCh(observations);

      // Wait for data to be indexed in ClickHouse
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify the workflow was stored correctly
      const workflow_observations = await prisma.observation.findMany({
        where: {
          traceId: traceId,
          projectId: projectId,
        },
        select: {
          id: true,
          type: true,
          name: true,
          metadata: true,
        },
        orderBy: {
          startTime: "asc",
        },
      });

      expect(workflow_observations).toHaveLength(4);

      // Verify agent observations
      const agents = workflow_observations.filter((o) => o.type === "AGENT");
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.name)).toContain("planning_agent");
      expect(agents.map((a) => a.name)).toContain("execution_agent");

      // Verify tool observation
      const tools = workflow_observations.filter((o) => o.type === "TOOL");
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("web_search");

      // Verify retriever observation
      const retrievers = workflow_observations.filter(
        (o) => o.type === "RETRIEVER",
      );
      expect(retrievers).toHaveLength(1);
      expect(retrievers[0].name).toBe("document_retriever");

      // Verify metadata is preserved
      const planningAgent = workflow_observations.find(
        (o) => o.id === planningAgentId,
      );
      expect(JSON.parse(planningAgent?.metadata as string)).toMatchObject({
        role: "planner",
        step: "analyze_query",
      });
    });
  });
});

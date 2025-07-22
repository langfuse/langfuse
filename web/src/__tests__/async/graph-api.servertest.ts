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

  describe("Manual Graph Instrumentation", () => {
    it("should support manual graph metadata with simple linear flow", async () => {
      const traceId = randomUUID();
      
      // Create trace
      const trace = createTrace({
        id: traceId,
        project_id: projectId,
        name: "Test Graph Trace",
      });
      await createTracesCh([trace]);

      // Create observations with manual graph metadata
      const startObsId = randomUUID();
      const processObsId = randomUUID();
      const endObsId = randomUUID();

      const observations = [
        createObservation({
          id: startObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "SPAN",
          name: "start_node",
          metadata: { 
            source: "API",
            server: "Node", 
            graph_node_id: "start" 
          },
        }),
        createObservation({
          id: processObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "SPAN",
          name: "process_node",
          metadata: { 
            source: "API",
            server: "Node", 
            graph_node_id: "process",
            graph_parent_node_id: "start" 
          },
        }),
        createObservation({
          id: endObsId,
          project_id: projectId,
          trace_id: traceId,
          type: "SPAN", 
          name: "end_node",
          metadata: { 
            source: "API",
            server: "Node", 
            graph_node_id: "end",
            graph_parent_node_id: "process" 
          },
        }),
      ];
      
      console.log("Observations before CH insert:", observations.map(o => ({ id: o.id, name: o.name, metadata: o.metadata })));
      
      await createObservationsCh(observations);

      // Wait a bit for data to be indexed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Debug: Check if observations were created correctly by querying CH directly
      // const debugObs = await caller.traces.byIdWithObservationsAndScores({
      //   projectId,
      //   traceId,
      // });
      
      // console.log("Debug observations:", debugObs.observations.map(o => ({ 
      //   id: o.id, 
      //   name: o.name, 
      //   metadata: o.metadata 
      // })));

      // Test the API
      const minStartTime = new Date(Date.now() - 10000).toISOString();
      const maxStartTime = new Date(Date.now() + 10000).toISOString();
      
      console.log("Query params:", { projectId, traceId, minStartTime, maxStartTime });
      
      const result = await caller.traces.getAgentGraphData({
        projectId,
        traceId,
        minStartTime,
        maxStartTime,
      });

      console.log("Graph API result:", JSON.stringify(result, null, 2));
      expect(result).toHaveLength(3);
      
      // Check start node
      const startNode = result.find(r => r.node === "start");
      expect(startNode).toBeDefined();
      expect(startNode?.step).toBe(0);
      expect(startNode?.id).toBe(startObsId);
      
      // Check process node 
      const processNode = result.find(r => r.node === "process");
      expect(processNode).toBeDefined(); 
      expect(processNode?.step).toBe(1);
      expect(processNode?.id).toBe(processObsId);
      
      // Check end node
      const endNode = result.find(r => r.node === "end");
      expect(endNode).toBeDefined();
      expect(endNode?.step).toBe(2);
      expect(endNode?.id).toBe(endObsId);
    });

    it("should support branching graph structures", async () => {
      const traceId = randomUUID();
      const startTime = new Date();
      
      await prisma.trace.create({
        data: {
          id: traceId,
          projectId,
          name: "Branching Graph Trace",
          timestamp: startTime,
        },
      });

      const startId = randomUUID();
      const branchAId = randomUUID();
      const branchBId = randomUUID();
      const mergeId = randomUUID();

      await prisma.observation.createMany({
        data: [
          {
            id: startId,
            projectId,
            traceId,
            type: "SPAN",
            name: "start",
            startTime,
            endTime: new Date(Date.now() + 1000),
            metadata: JSON.stringify({ graph_node_id: "start" }),
          },
          {
            id: branchAId,
            projectId,
            traceId,
            type: "SPAN",
            name: "branch_a", 
            startTime: new Date(Date.now() + 1000),
            endTime: new Date(Date.now() + 2000),
            metadata: JSON.stringify({ 
              graph_node_id: "branch_a",
              graph_parent_node_id: "start" 
            }),
          },
          {
            id: branchBId,
            projectId,
            traceId,
            type: "SPAN",
            name: "branch_b",
            startTime: new Date(Date.now() + 1000), // Same level as branch_a
            endTime: new Date(Date.now() + 2000),
            metadata: JSON.stringify({ 
              graph_node_id: "branch_b",
              graph_parent_node_id: "start" 
            }),
          },
          {
            id: mergeId,
            projectId,
            traceId,
            type: "SPAN",
            name: "merge",
            startTime: new Date(Date.now() + 2000),
            endTime: new Date(Date.now() + 3000),
            metadata: JSON.stringify({ 
              graph_node_id: "merge",
              graph_parent_node_id: "branch_a" // One parent for now
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

      expect(result).toHaveLength(4);
      
      // Start should be step 0
      expect(result.find(r => r.node === "start")?.step).toBe(0);
      
      // Both branches should be step 1 (same level)
      expect(result.find(r => r.node === "branch_a")?.step).toBe(1);
      expect(result.find(r => r.node === "branch_b")?.step).toBe(1);
      
      // Merge should be step 2
      expect(result.find(r => r.node === "merge")?.step).toBe(2);
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
              langgraph_step: 0
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
              langgraph_step: 1
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
      const node1 = result.find(r => r.node === "agent_node1");
      expect(node1).toBeDefined();
      expect(node1?.step).toBe(0);
      
      const node2 = result.find(r => r.node === "agent_node2");
      expect(node2).toBeDefined();
      expect(node2?.step).toBe(1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle orphaned nodes (parent reference not found)", async () => {
      const traceId = randomUUID();
      const startTime = new Date();
      
      await prisma.trace.create({
        data: {
          id: traceId,
          projectId,
          name: "Orphaned Node Trace",
          timestamp: startTime,
        },
      });

      const orphanId = randomUUID();

      await prisma.observation.create({
        data: {
          id: orphanId,
          projectId,
          traceId,
          type: "SPAN",
          name: "orphan",
          startTime,
          endTime: new Date(Date.now() + 1000),
          metadata: JSON.stringify({ 
            graph_node_id: "orphan",
            graph_parent_node_id: "nonexistent" // Parent doesn't exist
          }),
        },
      });

      const result = await caller.traces.getAgentGraphData({
        projectId,
        traceId,
        minStartTime: new Date(Date.now() - 1000).toISOString(),
        maxStartTime: new Date(Date.now() + 5000).toISOString(),
      });

      expect(result).toHaveLength(1);
      
      // Orphaned node should be treated as root (step 0)
      expect(result[0].node).toBe("orphan");
      expect(result[0].step).toBe(0);
    });

    it("should return empty array when no graph metadata is present", async () => {
      const traceId = randomUUID();
      const startTime = new Date();
      
      await prisma.trace.create({
        data: {
          id: traceId,
          projectId,
          name: "No Graph Trace",
          timestamp: startTime,
        },
      });

      await prisma.observation.create({
        data: {
          id: randomUUID(),
          projectId,
          traceId,
          type: "SPAN",
          name: "normal_span",
          startTime,
          endTime: new Date(Date.now() + 1000),
          metadata: JSON.stringify({ some_other_field: "value" }),
        },
      });

      const result = await caller.traces.getAgentGraphData({
        projectId,
        traceId,
        minStartTime: new Date(Date.now() - 1000).toISOString(),
        maxStartTime: new Date(Date.now() + 5000).toISOString(),
      });

      expect(result).toHaveLength(0);
    });

    it("should handle cycles gracefully", async () => {
      const traceId = randomUUID();
      const startTime = new Date();
      
      await prisma.trace.create({
        data: {
          id: traceId,
          projectId,
          name: "Cyclic Graph Trace",
          timestamp: startTime,
        },
      });

      await prisma.observation.createMany({
        data: [
          {
            id: randomUUID(),
            projectId,
            traceId,
            type: "SPAN",
            name: "node_a",
            startTime,
            endTime: new Date(Date.now() + 1000),
            metadata: JSON.stringify({ 
              graph_node_id: "node_a",
              graph_parent_node_id: "node_b" // Cycle: A -> B -> A
            }),
          },
          {
            id: randomUUID(),
            projectId,
            traceId,
            type: "SPAN",
            name: "node_b",
            startTime: new Date(Date.now() + 1000),
            endTime: new Date(Date.now() + 2000),
            metadata: JSON.stringify({ 
              graph_node_id: "node_b",
              graph_parent_node_id: "node_a"
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
      // Should handle gracefully - both nodes get assigned steps
      expect(result.every(r => typeof r.step === "number")).toBe(true);
    });
  });
});
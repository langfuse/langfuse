import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

function makeTrace(projectId: string, args: string) {
  const trace = createTrace({ project_id: projectId });
  const root = createObservation({
    trace_id: trace.id,
    project_id: projectId,
    name: "root",
    metadata: { requestId: randomUUID(), customer_id: "cus_1" },
  });
  const tool = createObservation({
    trace_id: trace.id,
    project_id: projectId,
    parent_observation_id: root.id,
    type: "TOOL",
    name: "lookup",
    start_time: new Date("2026-01-01T00:00:01.000Z"),
    output: JSON.stringify({
      tool_calls: [
        {
          id: randomUUID(),
          type: "function",
          function: { name: "lookup", arguments: args },
        },
      ],
    }),
    tool_call_names: ["lookup"],
  });
  return { trace, observations: [root, tool] };
}

describe("traces.diffById", () => {
  const orgId = randomUUID();
  const projectId = randomUUID();
  const session = createSession({
    organizations: [
      {
        id: orgId,
        role: "OWNER",
        plan: "cloud:enterprise",
        accessAuditLogEnabled: true,
        projects: [{ id: projectId, role: "ADMIN", hasTraces: true }],
      },
    ],
  });
  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  it("treats volatile identities as identical while locating changed arguments", async () => {
    const left = makeTrace(projectId, "pwd");
    const right = makeTrace(projectId, "ls");
    const same = makeTrace(projectId, "pwd");
    await createTracesCh([left.trace, right.trace, same.trace]);
    await createObservationsCh([
      ...left.observations,
      ...right.observations,
      ...same.observations,
    ]);

    const identical = await caller.traces.diffById({
      projectId,
      leftTraceId: left.trace.id,
      rightTraceId: same.trace.id,
    });
    expect(identical.status).toBe("identical");

    const report = await caller.traces.diffById({
      projectId,
      leftTraceId: left.trace.id,
      rightTraceId: right.trace.id,
    });
    expect(report.status).toBe("different");
    expect(report.firstDivergence).toMatchObject({
      index: 1,
      reason: "payload",
    });
    expect(report.firstDivergence?.leftPreview).toContain("pwd");
    expect(report.firstDivergence?.rightPreview).toContain("ls");
  });

  it("records both traces and all compared observations in the access audit", async () => {
    const left = makeTrace(projectId, "pwd");
    const right = makeTrace(projectId, "pwd");
    await createTracesCh([left.trace, right.trace]);
    await createObservationsCh([...left.observations, ...right.observations]);

    await caller.traces.diffById({
      projectId,
      leftTraceId: left.trace.id,
      rightTraceId: right.trace.id,
    });

    const rows = await prisma.auditLogStaging.findMany({
      where: {
        AND: [
          { payload: { path: ["orgId"], equals: orgId } },
          { payload: { path: ["kind"], equals: "access" } },
        ],
      },
    });
    const events = rows.map((row) => row.payload as Record<string, unknown>);
    const event = events.find(
      (candidate) =>
        candidate.route === "traces.diffById" &&
        candidate.resourceId === left.trace.id,
    );
    expect(event).toMatchObject({
      resourceType: "trace",
      resourceId: left.trace.id,
      action: "read",
      resultCount: 4,
    });
    expect(event?.resourceRefs).toEqual(
      expect.arrayContaining([
        `trace:${left.trace.id}`,
        `trace:${right.trace.id}`,
        ...[...left.observations, ...right.observations].map(
          (observation) => `observation:${observation.id}`,
        ),
      ]),
    );
  });

  it("rejects comparing a trace with itself", async () => {
    const { trace, observations } = makeTrace(projectId, "pwd");
    await createTracesCh([trace]);
    await createObservationsCh(observations);
    await expect(
      caller.traces.diffById({
        projectId,
        leftTraceId: trace.id,
        rightTraceId: trace.id,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns NOT_FOUND when either trace is missing", async () => {
    const { trace, observations } = makeTrace(projectId, "pwd");
    await createTracesCh([trace]);
    await createObservationsCh(observations);
    await expect(
      caller.traces.diffById({
        projectId,
        leftTraceId: trace.id,
        rightTraceId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

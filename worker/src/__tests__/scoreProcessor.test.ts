import { beforeEach, describe, expect, it } from "vitest";
import { v4 } from "uuid";
import {
  ActionExecutionStatus,
  JobConfigState,
  TriggerEventSource,
  type FilterState,
} from "@langfuse/shared";
import {
  createOrgProjectAndApiKey,
  type EntityChangeEventType,
} from "@langfuse/shared/src/server";
import { ActionType, prisma } from "@langfuse/shared/src/db";
import { scoreProcessor } from "../features/entityChange/scoreProcessor";

describe("scoreProcessor", () => {
  let projectId: string;

  beforeEach(async () => {
    const result = await createOrgProjectAndApiKey();
    projectId = result.projectId;
  });

  it("adds a matching observation to every queue exactly once", async () => {
    const queues = await Promise.all(
      ["Review", "Escalation"].map((name) =>
        prisma.annotationQueue.create({ data: { projectId, name } }),
      ),
    );
    const filter: FilterState = [
      { column: "name", type: "string", operator: "=", value: "quality" },
      {
        column: "dataType",
        type: "string",
        operator: "=",
        value: "BOOLEAN",
      },
      { column: "value", type: "number", operator: "=", value: 1 },
    ];
    const trigger = await prisma.trigger.create({
      data: {
        projectId,
        eventSource: TriggerEventSource.Score,
        eventActions: ["created", "updated"],
        filter,
        status: JobConfigState.ACTIVE,
      },
    });
    const action = await prisma.action.create({
      data: {
        projectId,
        type: ActionType.ANNOTATION_QUEUE,
        config: {
          type: "ANNOTATION_QUEUE",
          queueIds: queues.map((queue) => queue.id),
        },
      },
    });
    const automation = await prisma.automation.create({
      data: {
        projectId,
        name: "Review low quality",
        triggerId: trigger.id,
        actionId: action.id,
      },
    });
    const observationId = v4();
    const event: Extract<EntityChangeEventType, { entityType: "score" }> = {
      entityType: "score",
      projectId,
      eventId: `${v4()}:2026-10-05T12:00:00.000Z`,
      action: "created",
      score: {
        id: v4(),
        name: "quality",
        dataType: "BOOLEAN",
        value: 1,
        stringValue: "True",
        longStringValue: "",
        observationId,
      },
    };

    await scoreProcessor(event);
    await scoreProcessor(event);

    const [items, executions] = await Promise.all([
      prisma.annotationQueueItem.findMany({
        where: { projectId, objectId: observationId },
      }),
      prisma.automationExecution.findMany({
        where: { projectId, automationId: automation.id },
      }),
    ]);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.queueId))).toEqual(
      new Set(queues.map((queue) => queue.id)),
    );
    expect(executions).toHaveLength(1);
    expect(executions[0].status).toBe(ActionExecutionStatus.COMPLETED);
  });

  it("ignores non-matching and non-observation scores", async () => {
    const queue = await prisma.annotationQueue.create({
      data: { projectId, name: "Review" },
    });
    const trigger = await prisma.trigger.create({
      data: {
        projectId,
        eventSource: TriggerEventSource.Score,
        eventActions: ["created"],
        filter: [
          { column: "name", type: "string", operator: "=", value: "quality" },
          {
            column: "dataType",
            type: "string",
            operator: "=",
            value: "NUMERIC",
          },
        ],
        status: JobConfigState.ACTIVE,
      },
    });
    const action = await prisma.action.create({
      data: {
        projectId,
        type: ActionType.ANNOTATION_QUEUE,
        config: { type: "ANNOTATION_QUEUE", queueIds: [queue.id] },
      },
    });
    await prisma.automation.create({
      data: {
        projectId,
        name: "Review quality",
        triggerId: trigger.id,
        actionId: action.id,
      },
    });

    await scoreProcessor({
      entityType: "score",
      projectId,
      eventId: v4(),
      action: "created",
      score: {
        id: v4(),
        name: "different",
        dataType: "NUMERIC",
        value: 0,
        stringValue: null,
        longStringValue: "",
        observationId: v4(),
      },
    });
    await scoreProcessor({
      entityType: "score",
      projectId,
      eventId: v4(),
      action: "created",
      score: {
        id: v4(),
        name: "quality",
        dataType: "NUMERIC",
        value: 0,
        stringValue: null,
        longStringValue: "",
        observationId: null,
      },
    });

    expect(
      await prisma.annotationQueueItem.count({ where: { projectId } }),
    ).toBe(0);
  });
});

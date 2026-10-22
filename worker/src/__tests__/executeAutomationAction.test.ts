import { beforeEach, describe, expect, it } from "vitest";
import { UnrecoverableError } from "bullmq";
import { v4 } from "uuid";
import {
  ActionExecutionStatus,
  JobConfigState,
  TriggerEventSource,
} from "@langfuse/shared";
import { ActionType, prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  type AutomationExecutionQueueEventType,
} from "@langfuse/shared/src/server";
import { executeAutomationAction } from "../features/automations/executeAutomationAction";

describe("executeAutomationAction", () => {
  let projectId: string;

  beforeEach(async () => {
    const result = await createOrgProjectAndApiKey();
    projectId = result.projectId;
  });

  it("retries an annotation queue action without duplicating queue items or executions", async () => {
    const queues = await Promise.all(
      ["Review", "Escalation"].map((name) =>
        prisma.annotationQueue.create({ data: { projectId, name } }),
      ),
    );
    const trigger = await prisma.trigger.create({
      data: {
        projectId,
        eventSource: TriggerEventSource.Score,
        eventActions: ["created"],
        filter: [],
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
        name: "Review quality",
        triggerId: trigger.id,
        actionId: action.id,
      },
    });
    const observationId = v4();
    const event: AutomationExecutionQueueEventType = {
      executionId: v4(),
      projectId,
      automationId: automation.id,
      triggerId: trigger.id,
      actionId: action.id,
      sourceId: v4(),
      input: {
        type: "score",
        action: "created",
        score: {
          id: v4(),
          name: "quality",
          dataType: "BOOLEAN",
          value: 0,
          stringValue: "False",
          longStringValue: "",
          observationId,
        },
      },
    };

    await executeAutomationAction(event);
    await executeAutomationAction(event);

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
    expect(executions[0].id).toBe(event.executionId);
    expect(
      executions.every(
        (execution) =>
          execution.status === ActionExecutionStatus.COMPLETED &&
          execution.sourceId === event.sourceId,
      ),
    ).toBe(true);
  });

  it("skips deleted queues and stops retrying when no destinations remain", async () => {
    const queues = await Promise.all(
      ["Review", "Escalation"].map((name) =>
        prisma.annotationQueue.create({ data: { projectId, name } }),
      ),
    );
    const trigger = await prisma.trigger.create({
      data: {
        projectId,
        eventSource: TriggerEventSource.Score,
        eventActions: ["created"],
        filter: [],
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
        name: "Review quality",
        triggerId: trigger.id,
        actionId: action.id,
      },
    });
    const observationId = v4();
    const event: AutomationExecutionQueueEventType = {
      executionId: v4(),
      projectId,
      automationId: automation.id,
      triggerId: trigger.id,
      actionId: action.id,
      sourceId: v4(),
      input: {
        type: "score",
        action: "created",
        score: {
          id: v4(),
          name: "quality",
          dataType: "BOOLEAN",
          value: 0,
          stringValue: "False",
          longStringValue: "",
          observationId,
        },
      },
    };

    await prisma.annotationQueue.delete({ where: { id: queues[0].id } });
    await executeAutomationAction(event);

    expect(
      await prisma.annotationQueueItem.findMany({
        where: { projectId, objectId: observationId },
        select: { queueId: true },
      }),
    ).toEqual([{ queueId: queues[1].id }]);
    await expect(
      prisma.automationExecution.findUniqueOrThrow({
        where: { id: event.executionId },
      }),
    ).resolves.toMatchObject({
      status: ActionExecutionStatus.COMPLETED,
      output: {
        queueIds: [queues[1].id],
        missingQueueIds: [queues[0].id],
        observationId,
      },
    });

    await prisma.annotationQueue.delete({ where: { id: queues[1].id } });
    const noDestinationsEvent = { ...event, executionId: v4() };

    await expect(
      executeAutomationAction(noDestinationsEvent),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(
      prisma.automationExecution.findUniqueOrThrow({
        where: { id: noDestinationsEvent.executionId },
      }),
    ).resolves.toMatchObject({ status: ActionExecutionStatus.ERROR });
  });

  it("does not duplicate queue items when distinct score events execute concurrently", async () => {
    const queue = await prisma.annotationQueue.create({
      data: { projectId, name: "Review" },
    });
    const trigger = await prisma.trigger.create({
      data: {
        projectId,
        eventSource: TriggerEventSource.Score,
        eventActions: ["created", "updated"],
        filter: [],
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
    const automation = await prisma.automation.create({
      data: {
        projectId,
        name: "Review quality",
        triggerId: trigger.id,
        actionId: action.id,
      },
    });
    const observationId = v4();
    const baseEvent: AutomationExecutionQueueEventType = {
      executionId: v4(),
      projectId,
      automationId: automation.id,
      triggerId: trigger.id,
      actionId: action.id,
      sourceId: v4(),
      input: {
        type: "score",
        action: "updated",
        score: {
          id: v4(),
          name: "quality",
          dataType: "BOOLEAN",
          value: 0,
          stringValue: "False",
          longStringValue: "",
          observationId,
        },
      },
    };

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        executeAutomationAction({
          ...baseEvent,
          executionId: `${baseEvent.executionId}-${index}`,
          sourceId: `${baseEvent.sourceId}-${index}`,
        }),
      ),
    );

    expect(
      await prisma.annotationQueueItem.count({
        where: { projectId, queueId: queue.id, objectId: observationId },
      }),
    ).toBe(1);
  });
});

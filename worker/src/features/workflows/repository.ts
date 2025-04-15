import { prisma, Workflow } from "@langfuse/shared/src/db";
import { SourceEventTypes, SourceEvent } from "./types";
import z from "zod";
import { Activity, ActivityStatus, singleFilter, Task } from "@langfuse/shared";
import { v4 as uuidv4 } from "uuid";

export async function findWorkFlowForProjectId(p: {
  projectId: string;
  sourceEventType: SourceEventTypes;
}) {
  const { projectId, sourceEventType } = p;
  const workflows = await prisma.workflow.findMany({
    where: {
      projectId,
      sourceEventType,
    },
  });
  return workflows.map(convertWorkflowToWorkflowDomain);
}

const convertWorkflowToWorkflowDomain = (workflow: Workflow) => {
  return {
    id: workflow.id,
    name: workflow.name,
    projectId: workflow.projectId,
    status: workflow.status,
    filters: z.array(singleFilter).parse(workflow.sourceEventFilter),
    delay: workflow.delay,
    timeoutDuration: workflow.timeoutDuration,
    sourceEventType: workflow.sourceEventType as SourceEventTypes,
  };
};

export type WorkflowDomain = Awaited<
  ReturnType<typeof convertWorkflowToWorkflowDomain>
>;

export async function findWorkflowForSourceEvent(p: {
  projectId: string;
  sourceEvent: SourceEvent;
}) {
  const { projectId, sourceEvent } = p;
  const workflow = await prisma.workflowExecution.findFirst({
    where: {
      projectId,
      workflow: {
        sourceEventType: sourceEvent.type,
      },
      parameters: {
        equals: sourceEvent,
      },
    },
  });
  return workflow;
}

export async function cancelAllActivitiesForWorkflow(
  workflowExecutionId: string,
  projectId: string,
) {
  await prisma.activity.updateMany({
    where: { workflowExecutionId, projectId },
    data: { status: ActivityStatus.CANCELLED },
  });
}

export async function createWorkflowExecutionAndActivity(p: {
  workflow: WorkflowDomain;
  projectId: string;
  event: SourceEvent;
  task: TaskDomain;
}) {
  const { workflow, projectId, task, event } = p;
  const executionId = uuidv4();
  const activityId = uuidv4();
  await prisma.workflowExecution.create({
    data: {
      executionId,
      workflowId: workflow.id,
      projectId,
      parameters: event,
    },
  });
  const activity = await prisma.activity.create({
    data: {
      id: activityId,
      workflowExecutionId: executionId,
      projectId,
      taskId: task.id,
      taskTypeId: task.taskTypeId,
      name: task.name,
      status: ActivityStatus.PENDING,
      parameters: event,
    },
  });
  return activity;
}

export async function findFirstTaskToExecuteForWorkflow(p: {
  projectId: string;
  workflowId: string;
}) {
  const { projectId, workflowId } = p;
  const task = await prisma.task.findFirst({
    where: {
      projectId,
      workflowId,
      predecessorTaskIds: {
        isEmpty: true,
      },
    },
  });
  return task ? convertTaskToTaskDomain(task) : null;
}

export const convertTaskToTaskDomain = (task: Task) => {
  return {
    id: task.id,
    name: task.name,
    projectId: task.projectId,
    taskTypeId: task.taskTypeId,
    predecessorTaskIds: task.predecessorTaskIds,
    mappings: task.mappings,
    version: task.version,
    timeoutDuration: task.timeoutDuration,
    workflowId: task.workflowId,
  };
};

export type TaskDomain = Awaited<ReturnType<typeof convertTaskToTaskDomain>>;

export async function findActivityById(p: {
  activityId: string;
  projectId: string;
}) {
  const { activityId, projectId } = p;
  const activity = await prisma.activity.findUnique({
    where: { id: activityId, projectId },
    include: {
      task: true,
    },
  });
  return activity ? convertActivityToActivityDomain(activity) : null;
}

export const convertActivityToActivityDomain = (
  activity: Activity & { task: Task },
) => {
  return {
    id: activity.id,
    name: activity.name,
    status: activity.status,
    parameters: activity.parameters,
    taskId: activity.taskId,
    taskTypeId: activity.taskTypeId,
    workflowExecutionId: activity.workflowExecutionId,
    projectId: activity.projectId,
  };
};

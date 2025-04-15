import { WorkflowStatus } from "@prisma/client";
import {
  cancelAllActivitiesForWorkflow,
  createWorkflowExecutionAndActivity,
  findActivityById,
  findFirstTaskToExecuteForWorkflow,
  findWorkFlowForProjectId,
  findWorkflowForSourceEvent,
  WorkflowDomain,
} from "./repository";
import { SourceEvent } from "./types";
import { TracesWorkflowSourceFilter } from "./WorkflowSourceFilter";
import {
  getQueue,
  logger,
  QueueJobs,
  QueueName,
} from "@langfuse/shared/src/server";

export class WorkflowEngine {
  private readonly projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  async launchWorkflowsForEvent(event: SourceEvent) {
    const workflows = await findWorkFlowForProjectId({
      projectId: this.projectId,
      sourceEventType: event.type,
    });

    for (const workflow of workflows) {
      if (workflow.status === WorkflowStatus.INACTIVE) {
        logger.info(`Workflow ${workflow.id} is inactive, skipping execution`);
        continue;
      }

      if (workflow.sourceEventType === "trace_upsert") {
        const filterExec = new TracesWorkflowSourceFilter();
        const traceExists = await filterExec.filter(event, workflow.filters);

        const existingWorkflow = await findWorkflowForSourceEvent({
          projectId: this.projectId,
          sourceEvent: event,
        });

        if (!traceExists && existingWorkflow) {
          logger.info(
            `Workflow ${workflow.id} already exists but does not match the filter anymore. Cancel the existing workflow.`,
          );
          await this.cancelWorkflow(existingWorkflow.id);
          return;
        }

        if (!traceExists) {
          logger.info(
            `Workflow ${workflow.id} does not match the filter, skipping execution`,
          );
          continue;
        }

        if (traceExists && !existingWorkflow) {
          logger.info(`Workflow ${workflow.id} matches the filter, executing`);
          await this.scheduleNextActivity({ workflow, event });
        }
      }
    }
    return workflows;
  }

  async executeActivity(activityId: string) {
    const activity = await findActivityById({
      activityId,
      projectId: this.projectId,
    });

    if (!activity) {
      logger.error(`Activity ${activityId} not found`);
      throw new Error(`Activity ${activityId} not found`);
    }
  }

  private async cancelWorkflow(workflowId: string) {
    return await cancelAllActivitiesForWorkflow(workflowId, this.projectId);
  }

  private async scheduleNextActivity(p: {
    workflow: WorkflowDomain;
    event: SourceEvent;
  }) {
    const { workflow, event } = p;
    const firstTaskToExecute = await findFirstTaskToExecuteForWorkflow({
      projectId: this.projectId,
      workflowId: workflow.id,
    });

    if (!firstTaskToExecute) {
      logger.error(
        `Workflow ${workflow.id} has no tasks to execute, skipping execution`,
      );
      throw new Error(
        `Workflow ${workflow.id} has no tasks to execute, skipping execution`,
      );
    }

    const activity = await createWorkflowExecutionAndActivity({
      workflow,
      event,
      projectId: this.projectId,
      task: firstTaskToExecute,
    });

    const queue = getQueue(QueueName.WorkflowActivityQueue);
    if (!queue) {
      logger.error("WorkflowActivityQueue not found");
      throw new Error("WorkflowActivityQueue not found");
    }
    queue.add(QueueJobs.WorkflowActivityJob, {
      activityId: activity.id,
      projectId: this.projectId,
    });
  }
}

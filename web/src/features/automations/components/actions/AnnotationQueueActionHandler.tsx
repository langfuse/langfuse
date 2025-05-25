import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type ActiveAutomation } from "@langfuse/shared/src/server";
import { type BaseActionHandler } from "./BaseActionHandler";
import { AnnotationQueueActionForm } from "./AnnotationQueueActionForm";

export class AnnotationQueueActionHandler implements BaseActionHandler {
  actionType = "ANNOTATION_QUEUE" as const;

  getDefaultValues(automation?: ActiveAutomation) {
    return {
      annotationQueue: {
        queueId:
          (automation?.action?.type === "ANNOTATION_QUEUE" &&
            automation?.action?.config &&
            "queueId" in automation.action.config &&
            automation.action.config.queueId) ||
          "",
      },
    };
  }

  validateFormData(formData: any): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];

    const queueId = formData.annotationQueue?.queueId;

    // Check if queueId is missing, empty, or one of our placeholder values
    if (!queueId || queueId === "__loading__" || queueId === "__no_queues__") {
      errors.push("Annotation Queue ID is required");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: any) {
    return {
      version: "1.0",
      queueId: formData.annotationQueue?.queueId,
    };
  }

  renderForm(props: {
    form: UseFormReturn<any>;
    disabled: boolean;
    projectId: string;
  }) {
    return (
      <AnnotationQueueActionForm
        form={props.form}
        disabled={props.disabled}
        projectId={props.projectId}
      />
    );
  }
}

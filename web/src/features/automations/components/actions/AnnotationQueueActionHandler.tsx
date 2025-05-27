import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type ActiveAutomation } from "@langfuse/shared/src/server";
import { type BaseActionHandler } from "./BaseActionHandler";
import {
  AnnotationQueueActionForm,
  type AnnotationQueueFormValues,
} from "./AnnotationQueueActionForm";
import { type AnnotationQueueActionConfig } from "@langfuse/shared";
import { z } from "zod";

// Define the form schema for annotation queue actions
const AnnotationQueueActionFormSchema = z.object({
  annotationQueue: z.object({
    queueId: z.string().min(1, "Annotation Queue is required"),
  }),
});

type AnnotationQueueActionFormData = z.infer<
  typeof AnnotationQueueActionFormSchema
>;

export class AnnotationQueueActionHandler
  implements BaseActionHandler<AnnotationQueueActionFormData>
{
  actionType = "ANNOTATION_QUEUE" as const;

  getDefaultValues(
    automation?: ActiveAutomation,
  ): AnnotationQueueActionFormData {
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

  validateFormData(formData: AnnotationQueueActionFormData): {
    isValid: boolean;
    errors?: string[];
  } {
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

  buildActionConfig(
    formData: AnnotationQueueActionFormData,
  ): AnnotationQueueActionConfig {
    return {
      type: "ANNOTATION_QUEUE",
      queueId: formData.annotationQueue?.queueId || "",
    };
  }

  renderForm(props: {
    form: UseFormReturn<AnnotationQueueActionFormData>;
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

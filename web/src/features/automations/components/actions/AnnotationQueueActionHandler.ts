import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  type ActionCreate,
  type ActionDomain,
  type AnnotationQueueActionConfig,
  type AutomationDomain,
} from "@langfuse/shared";
import { type BaseActionHandler } from "./BaseActionHandler";
import { AnnotationQueueActionForm } from "./AnnotationQueueActionForm";

const AnnotationQueueActionFormSchema = z.object({
  annotationQueue: z.object({
    queueIds: z.array(z.string()).min(1),
  }),
});

type AnnotationQueueActionFormData = z.infer<
  typeof AnnotationQueueActionFormSchema
>;

export class AnnotationQueueActionHandler implements BaseActionHandler<AnnotationQueueActionFormData> {
  actionType = "ANNOTATION_QUEUE" as const;

  getDefaultValues(
    automation?: AutomationDomain,
  ): AnnotationQueueActionFormData {
    const config =
      automation?.action.type === "ANNOTATION_QUEUE"
        ? (automation.action.config as AnnotationQueueActionConfig)
        : undefined;

    return {
      annotationQueue: {
        queueIds: config?.queueIds ?? [],
      },
    };
  }

  validateFormData(formData: AnnotationQueueActionFormData) {
    const isValid = (formData.annotationQueue?.queueIds.length ?? 0) > 0;
    return {
      isValid,
      errors: isValid
        ? undefined
        : ["At least one annotation queue is required"],
    };
  }

  buildActionConfig(formData: AnnotationQueueActionFormData): ActionCreate {
    return {
      type: "ANNOTATION_QUEUE",
      queueIds: formData.annotationQueue.queueIds,
    };
  }

  renderForm(props: {
    form: UseFormReturn<AnnotationQueueActionFormData>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }) {
    return React.createElement(AnnotationQueueActionForm, props);
  }
}

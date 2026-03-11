import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type BaseActionHandler } from "./BaseActionHandler";
import { JiraActionForm } from "./JiraActionForm";
import {
  type AutomationDomain,
  type ActionCreate,
  type ActionDomain,
} from "@langfuse/shared";
import { z } from "zod/v4";

export const JiraActionFormSchema = z.object({
  jira: z.object({
    jiraBaseUrl: z.string().url("Invalid URL"),
    projectKey: z.string().min(1, "Project key is required"),
    issueType: z.string().min(1, "Issue type is required"),
    apiToken: z.string(),
    displayApiToken: z.string().optional(),
    email: z.string().email("Invalid email"),
    labels: z.array(z.string()).optional(),
    assigneeAccountId: z.string().optional(),
  }),
});

type JiraActionFormData = z.infer<typeof JiraActionFormSchema>;

export class JiraActionHandler
  implements BaseActionHandler<JiraActionFormData>
{
  actionType = "JIRA" as const;

  getDefaultValues(automation?: AutomationDomain): JiraActionFormData {
    const config =
      automation?.action?.config?.type === "JIRA"
        ? automation.action.config
        : null;
    return {
      jira: {
        jiraBaseUrl: config?.jiraBaseUrl ?? "",
        projectKey: config?.projectKey ?? "",
        issueType: config?.issueType ?? "Bug",
        apiToken: "",
        displayApiToken: config?.displayApiToken ?? undefined,
        email: config?.email ?? "",
        labels: config?.labels ?? [],
        assigneeAccountId: config?.assigneeAccountId ?? "",
      },
    };
  }

  validateFormData(formData: JiraActionFormData): {
    isValid: boolean;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!formData.jira?.jiraBaseUrl) {
      errors.push("Jira base URL is required");
    }
    if (!formData.jira?.projectKey) {
      errors.push("Project key is required");
    }
    if (!formData.jira?.email) {
      errors.push("Email is required");
    }
    if (!formData.jira?.apiToken && !formData.jira?.displayApiToken) {
      errors.push("API token is required");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: JiraActionFormData): ActionCreate {
    return {
      type: "JIRA",
      ...(formData.jira?.jiraBaseUrl
        ? { jiraBaseUrl: formData.jira.jiraBaseUrl }
        : {}),
      ...(formData.jira?.projectKey
        ? { projectKey: formData.jira.projectKey }
        : {}),
      ...(formData.jira?.issueType
        ? { issueType: formData.jira.issueType }
        : {}),
      ...(formData.jira?.apiToken ? { apiToken: formData.jira.apiToken } : {}),
      ...(formData.jira?.email ? { email: formData.jira.email } : {}),
      ...(formData.jira?.labels?.length
        ? { labels: formData.jira.labels }
        : {}),
      ...(formData.jira?.assigneeAccountId
        ? { assigneeAccountId: formData.jira.assigneeAccountId }
        : {}),
    };
  }

  renderForm(props: {
    form: UseFormReturn<JiraActionFormData>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }) {
    return (
      <JiraActionForm
        form={props.form}
        disabled={props.disabled}
        projectId={props.projectId}
        action={props.action}
      />
    );
  }
}

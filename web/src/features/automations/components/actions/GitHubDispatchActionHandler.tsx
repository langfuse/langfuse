import React from "react";
import { type UseFormReturn } from "react-hook-form";
import {
  type ActionValidationError,
  type BaseActionHandler,
} from "./BaseActionHandler";
import { GitHubDispatchActionForm } from "./GitHubDispatchActionForm";
import {
  type AutomationDomain,
  type ActionCreate,
  type ActionDomain,
} from "@langfuse/shared";
import { areGitHubDispatchUrlsEquivalent } from "../../githubDispatchUrl";

type GitHubDispatchActionFormData = {
  githubDispatch: {
    url: string;
    eventType: string;
    githubToken: string;
    displayGitHubToken?: string;
    originalUrl?: string;
  };
};

export class GitHubDispatchActionHandler implements BaseActionHandler<GitHubDispatchActionFormData> {
  actionType = "GITHUB_DISPATCH" as const;

  getDefaultValues(
    automation?: AutomationDomain,
  ): GitHubDispatchActionFormData {
    return {
      githubDispatch: {
        url:
          (automation?.action?.type === "GITHUB_DISPATCH" &&
            automation?.action?.config &&
            "url" in automation.action.config &&
            automation.action.config.url) ||
          "",
        eventType:
          (automation?.action?.type === "GITHUB_DISPATCH" &&
            automation?.action?.config &&
            "eventType" in automation.action.config &&
            automation.action.config.eventType) ||
          "",
        githubToken: "", // Never populate with existing token for security
        displayGitHubToken:
          automation?.action?.type === "GITHUB_DISPATCH" &&
          automation?.action?.config &&
          "displayGitHubToken" in automation.action.config
            ? automation.action.config.displayGitHubToken
            : undefined,
        originalUrl:
          automation?.action?.type === "GITHUB_DISPATCH" &&
          automation?.action?.config &&
          "url" in automation.action.config
            ? automation.action.config.url
            : undefined,
      },
    };
  }

  validateFormData(formData: GitHubDispatchActionFormData): {
    isValid: boolean;
    errors?: ActionValidationError[];
  } {
    const errors: ActionValidationError[] = [];

    if (!formData.githubDispatch?.url) {
      errors.push({ code: "githubDispatchUrlRequired" });
    }

    if (!formData.githubDispatch?.eventType) {
      errors.push({ code: "eventTypeRequired" });
    } else if (formData.githubDispatch.eventType.length > 100) {
      errors.push({ code: "eventTypeTooLong" });
    }

    const existingUrl = formData.githubDispatch?.originalUrl;
    const isUrlChanged =
      existingUrl !== undefined &&
      !areGitHubDispatchUrlsEquivalent(
        formData.githubDispatch.url,
        existingUrl,
      );

    if (isUrlChanged && !formData.githubDispatch?.githubToken.trim()) {
      errors.push({ code: "githubTokenRequiredForUrlChange" });
    } else if (
      !formData.githubDispatch?.githubToken.trim() &&
      !formData.githubDispatch?.displayGitHubToken
    ) {
      errors.push({ code: "githubTokenRequired" });
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: GitHubDispatchActionFormData): ActionCreate {
    return {
      type: "GITHUB_DISPATCH",
      // Only include fields if they have values (for updates)
      ...(formData.githubDispatch?.url
        ? { url: formData.githubDispatch.url }
        : {}),
      ...(formData.githubDispatch?.eventType
        ? { eventType: formData.githubDispatch.eventType }
        : {}),
      ...(formData.githubDispatch?.githubToken
        ? { githubToken: formData.githubDispatch.githubToken }
        : {}),
    };
  }

  renderForm(props: {
    form: UseFormReturn<GitHubDispatchActionFormData>;
    disabled: boolean;
    projectId: string;
    action?: ActionDomain;
  }) {
    return (
      <GitHubDispatchActionForm
        form={props.form}
        disabled={props.disabled}
        projectId={props.projectId}
        action={props.action}
      />
    );
  }
}

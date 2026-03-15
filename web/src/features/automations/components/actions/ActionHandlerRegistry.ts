import { type ActionType } from "@langfuse/shared";
import { type FieldValues } from "react-hook-form";
import { type BaseActionHandler } from "./BaseActionHandler";
import { WebhookActionHandler } from "./WebhookActionHandler";
import { SlackActionHandler } from "./SlackActionHandler";
import { GitHubDispatchActionHandler } from "./GitHubDispatchActionHandler";
import { PagerDutyActionHandler } from "./PagerDutyActionHandler";
import { MicrosoftTeamsActionHandler } from "./MicrosoftTeamsActionHandler";
import { JiraActionHandler } from "./JiraActionHandler";

export class ActionHandlerRegistry {
  private static handlers: Map<ActionType, BaseActionHandler<FieldValues>> =
    new Map();

  static {
    // Initialize handlers in static block
    this.handlers.set("WEBHOOK", new WebhookActionHandler());
    this.handlers.set("SLACK", new SlackActionHandler());
    this.handlers.set("GITHUB_DISPATCH", new GitHubDispatchActionHandler());
    this.handlers.set("PAGERDUTY", new PagerDutyActionHandler());
    this.handlers.set("MICROSOFT_TEAMS", new MicrosoftTeamsActionHandler());
    this.handlers.set("JIRA", new JiraActionHandler());
  }

  static getHandler<T extends FieldValues = FieldValues>(
    actionType: ActionType,
  ): BaseActionHandler<T> {
    const handler = this.handlers.get(actionType);
    if (!handler) {
      throw new Error(`No handler registered for action type: ${actionType}`);
    }
    return handler as BaseActionHandler<T>;
  }

  static getAllActionTypes(): ActionType[] {
    return Array.from(this.handlers.keys());
  }

  static registerHandler<T extends FieldValues>(
    actionType: ActionType,
    handler: BaseActionHandler<T>,
  ) {
    this.handlers.set(actionType, handler as BaseActionHandler<FieldValues>);
  }

  static hasHandler(actionType: ActionType): boolean {
    return this.handlers.has(actionType);
  }
}

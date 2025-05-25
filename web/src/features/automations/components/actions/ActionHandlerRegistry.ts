import { type ActionType } from "@langfuse/shared";
import { type BaseActionHandler } from "./BaseActionHandler";
import { WebhookActionHandler } from "./WebhookActionHandler";
import { AnnotationQueueActionHandler } from "./AnnotationQueueActionHandler";

export class ActionHandlerRegistry {
  private static handlers: Map<ActionType, BaseActionHandler> = new Map();

  static {
    // Initialize handlers in static block
    this.handlers.set("WEBHOOK", new WebhookActionHandler());
    this.handlers.set("ANNOTATION_QUEUE", new AnnotationQueueActionHandler());
  }

  static getHandler(actionType: ActionType): BaseActionHandler {
    const handler = this.handlers.get(actionType);
    if (!handler) {
      throw new Error(`No handler registered for action type: ${actionType}`);
    }
    return handler;
  }

  static getAllActionTypes(): ActionType[] {
    return Array.from(this.handlers.keys());
  }

  static registerHandler(actionType: ActionType, handler: BaseActionHandler) {
    this.handlers.set(actionType, handler);
  }

  static hasHandler(actionType: ActionType): boolean {
    return this.handlers.has(actionType);
  }
}

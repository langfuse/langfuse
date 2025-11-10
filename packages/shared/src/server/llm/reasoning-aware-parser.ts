import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  MessageContentComplex,
  MessageContentImageUrl,
  MessageContentText,
} from "@langchain/core/messages";
import { logger } from "../logger";

/**
 * A custom StringOutputParser that handles reasoning_content from Claude models
 * with extended thinking capability (e.g., Claude on Bedrock with reasoning).
 *
 * This parser filters out reasoning_content blocks and only returns text content,
 * preventing errors when Bedrock models with reasoning produce multi-part responses.
 */
export class ReasoningAwareStringParser extends StringOutputParser {
  protected _messageContentComplexToString(
    content: MessageContentComplex,
  ): string {
    // Handle string content directly
    if (typeof content === "string") {
      return content;
    }

    // Content is a complex object, safely access its type
    const contentObj = content as Record<string, unknown>;
    const type = contentObj.type as string | undefined;

    switch (type) {
      case "text":
      case "text_delta":
        // Type narrowing: check if the property exists before accessing
        if ("text" in content) {
          return this._textContentToString(content as MessageContentText);
        }
        break;
      case "image_url":
        // Type narrowing: check if the property exists before accessing
        if ("image_url" in content) {
          return this._imageUrlContentToString(
            content as MessageContentImageUrl,
          );
        }
        break;
      case "reasoning_content":
        // Skip reasoning content from extended thinking models
        // fixes https://github.com/langfuse/langfuse/issues/10232
        // This prevents "cannot coerce reasoning_content into a string" errors
        return "";
      default:
        // Instead of throwing error, return empty string and log warning
        logger.warn(`Skipping unsupported content type: ${type}`);
        return "";
    }

    return "";
  }
}

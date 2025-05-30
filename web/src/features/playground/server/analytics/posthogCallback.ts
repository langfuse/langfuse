import type { ValidatedChatCompletionBody } from "@/src/features/playground/server/validateChatCompletionBody";
import { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import type { LLMResult } from "@langchain/core/outputs";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";

import type { ChatMessage, ModelParams } from "@langfuse/shared";

export class PosthogCallbackHandler extends BaseCallbackHandler {
  public name = "PosthogCallbackHandler";
  private messages: ChatMessage[];
  private modelParams: ModelParams;
  private posthog: ServerPosthog;

  constructor(
    public eventPrefix: string,
    public body: ValidatedChatCompletionBody,
    private userId: string,
  ) {
    super();
    this.posthog = new ServerPosthog();
    this.messages = body.messages;
    this.modelParams = body.modelParams;
  }

  async handleLLMEnd(output: LLMResult) {
    const generation = output.generations[0][0];

    if (generation) {
      const outputString = output.generations[0][0].text;
      const properties = this.getEventProperties(outputString);

      this.captureEvent(properties);
      await this.posthog.flush();
    }
  }

  private getInputLength() {
    return this.messages.reduce(
      (acc, message) => acc + message.content.length,
      0,
    );
  }

  private getEventProperties(output: string): ChatCompletionEventProperties {
    return {
      outputLength: output.length,
      inputLength: this.getInputLength(),
      modelProvider: this.modelParams.provider,
      modelName: this.modelParams.model,
    };
  }

  private captureEvent(properties: ChatCompletionEventProperties) {
    this.posthog.capture({
      event: this.eventPrefix + "_chat_completion",
      distinctId: this.userId,
      properties,
    });
  }

  public async flushAsync() {
    await this.posthog.flush();
  }
}

type ChatCompletionEventProperties = {
  outputLength: number;
  inputLength: number;
  modelProvider: string;
  modelName: string;
};

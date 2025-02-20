import { setupServer } from "msw/node";
import { HttpResponse, http, passthrough } from "msw";
import { logger } from "@langfuse/shared/src/server";

const DEFAULT_RESPONSE = {
  id: "chatcmpl-9MhZ73aGSmhfAtjU9DwoL4om73hJ7",
  object: "chat.completion",
  created: 1715197709,
  model: "gpt-3.5-turbo-0125",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            function: {
              name: "extract",
              arguments: JSON.stringify({
                score: 0,
                reasoning:
                  "The provided text is a harmless play on words that poses no risk of harm or offense. It is a lighthearted joke that uses wordplay to create humor without targeting or derogating any group of people.",
              }),
              type: "tool_call",
              id: "call_cJ6HLI1gZSIRJVOrFsChO1SI",
            },
          },
        ],
      },
      logprobs: null,
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 72,
    completion_tokens: 42,
    total_tokens: 114,
  },
  system_fingerprint: null,
};

function CompletionHandler(response: HttpResponse) {
  return http.post("https://api.openai.com/v1/chat/completions", async () => {
    logger.info("openai handler");
    return response;
  });
}

function JsonCompletionHandler(data: object) {
  return CompletionHandler(HttpResponse.json(data));
}

function MinioCompletionHandler() {
  return http.all("http://localhost:9090*", async (request) => {
    logger.info("minio handler");
    if ((request.params[0] as string).startsWith("/langfuse/events/")) {
      return new HttpResponse("Success");
    }
    throw new Error("Unexpected path");
  });
}

function ClickHouseCompletionHandler() {
  return http.all("http://localhost:8123*", async () => {
    logger.info("clickhouse handler");
    return passthrough();
  });
}

function AzuriteCompletionHandler() {
  return http.all("http://localhost:10000*", async () => {
    logger.info("handle azurite");
    return passthrough();
  });
}

function ErrorCompletionHandler(status: number, statusText: string) {
  return CompletionHandler(
    new HttpResponse(null, {
      status,
      statusText,
    }),
  );
}

function NetworkErrorCompletionHandler() {
  return CompletionHandler(HttpResponse.error());
}

export class OpenAIServer {
  private internalServer;
  private hasActiveKey;
  constructor({
    hasActiveKey = false,
    useDefaultResponse = false,
  }: {
    hasActiveKey?: boolean;
    useDefaultResponse?: boolean;
  }) {
    logger.info("openai", { hasActiveKey, useDefaultResponse });

    this.hasActiveKey = hasActiveKey;
    this.internalServer = setupServer(
      ...(useDefaultResponse ? [JsonCompletionHandler(DEFAULT_RESPONSE)] : []),
    );
    if (hasActiveKey) {
      this.internalServer.events.on("response:bypass", async ({ response }) => {
        logger.info(response);
      });
    }

    this.setup = this.setup.bind(this);
    this.respondWithData = this.respondWithData.bind(this);
    this.respondWithNetworkError = this.respondWithNetworkError.bind(this);
    this.reset = this.reset.bind(this);
    this.teardown = this.teardown.bind(this);
  }

  setup() {
    this.internalServer.listen({
      onUnhandledRequest: this.hasActiveKey ? "bypass" : "error",
    });
  }

  respondWithData(data: object) {
    this.internalServer.use(
      JsonCompletionHandler(data),
      MinioCompletionHandler(),
      ClickHouseCompletionHandler(),
      AzuriteCompletionHandler(),
    );
  }

  respondWithDefault() {
    this.respondWithData(DEFAULT_RESPONSE);
  }

  respondWithError(status: number, statusText: string) {
    this.internalServer.use(ErrorCompletionHandler(status, statusText));
  }

  respondWithNetworkError() {
    this.internalServer.use(NetworkErrorCompletionHandler());
  }

  reset() {
    this.internalServer.resetHandlers();
  }

  teardown() {
    this.internalServer.close();
  }
}

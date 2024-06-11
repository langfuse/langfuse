import { setupServer } from "msw/node";
import { HttpResponse, http } from "msw";

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
        function_call: {
          name: "evaluate",
          arguments:
            '{"score":0.2,"reasoning":"The language used in the conversation was respectful and there were no personal attacks. However, there were some sarcastic comments which could be perceived as slightly negative."}',
        },
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
    console.log("handler");
    return response;
  });
}

function JsonCompletionHandler(data: object) {
  return CompletionHandler(HttpResponse.json(data));
}

function ErrorCompletionHandler(status: number, statusText: string) {
  return CompletionHandler(
    new HttpResponse(null, {
      status,
      statusText,
    })
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
    console.log("openai", { hasActiveKey, useDefaultResponse });

    this.hasActiveKey = hasActiveKey;
    this.internalServer = setupServer(
      ...(useDefaultResponse ? [JsonCompletionHandler(DEFAULT_RESPONSE)] : [])
    );
    if (hasActiveKey) {
      this.internalServer.events.on("response:bypass", async ({ response }) => {
        console.log(response);
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
    this.internalServer.use(JsonCompletionHandler(data));
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

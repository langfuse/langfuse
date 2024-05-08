import { setupServer } from "msw/node";
import { HttpResponse, http } from "msw";

const OpenAIServer = setupServer(
  http.post("https://api.openai.com/v1/chat/completions", async () => {
    return HttpResponse.json({
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
    });
  })
);

OpenAIServer.events.on("response:bypass", async ({ request, response }) => {
  console.log(response);
});

export function OpenAISetup() {
  OpenAIServer.listen({ onUnhandledRequest: "error" });
}
export function OpenAIReset() {
  OpenAIServer.resetHandlers();
}

export function OpenAITeardown() {
  OpenAIServer.close();
}

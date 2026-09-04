import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

const port = readPort(process.env.PORT, 8081);
const streamPlanCache = new Map();

const stats = {
  startedAt: Date.now(),
  requests: 0,
  activeRequests: 0,
  requestBytes: 0,
  responses: 0,
  responseBytes: 0,
  aborted: 0,
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://benchmark.local");

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/metrics") {
    sendJson(response, 200, {
      ...stats,
      uptimeMs: Date.now() - stats.startedAt,
    });
    return;
  }

  const protocol =
    request.method === "POST" && url.pathname === "/openai/v1/chat/completions"
      ? "openai"
      : request.method === "POST" && url.pathname === "/anthropic/v1/messages"
        ? "anthropic"
        : null;

  if (protocol === null) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  let config;
  try {
    config = {
      chunks: readHeaderInteger(request, "x-benchmark-chunks", 20, 1, 100_000),
      chunkDelayMs: readHeaderInteger(
        request,
        "x-benchmark-chunk-delay-ms",
        10,
        0,
        60_000,
      ),
      chunkBytes: readHeaderInteger(
        request,
        "x-benchmark-chunk-bytes",
        128,
        1,
        1_000_000,
      ),
      streamProfile: readHeaderEnum(
        request,
        "x-benchmark-stream-profile",
        "text",
        ["text", "coding-agent"],
      ),
    };
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  stats.requests += 1;
  stats.activeRequests += 1;

  try {
    for await (const chunk of request) {
      stats.requestBytes += chunk.length;
    }

    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    response.flushHeaders();

    if (protocol === "openai") {
      await streamOpenAi(response, config);
    } else {
      await streamAnthropic(response, config);
    }

    if (!response.destroyed) {
      response.end();
      stats.responses += 1;
    }
  } catch (error) {
    if (!response.destroyed) {
      response.destroy(error);
    }
  } finally {
    if (request.aborted || response.destroyed) {
      stats.aborted += 1;
    }
    stats.activeRequests -= 1;
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

server.listen(port, "0.0.0.0", () => {
  console.log(`mock-upstream listening on :${port}`);
});

async function streamOpenAi(response, config) {
  const plan = streamPlan("openai", config);
  for (const frame of plan.prefix) {
    await writeRaw(response, frame);
  }
  for (const frame of plan.content) {
    if (config.chunkDelayMs > 0) {
      await sleep(config.chunkDelayMs);
    }
    await writeRaw(response, frame);
  }
  for (const frame of plan.suffix) {
    await writeRaw(response, frame);
  }
}

async function streamAnthropic(response, config) {
  const plan = streamPlan("anthropic", config);
  for (const frame of plan.prefix) {
    await writeRaw(response, frame);
  }
  for (const frame of plan.content) {
    if (config.chunkDelayMs > 0) {
      await sleep(config.chunkDelayMs);
    }
    await writeRaw(response, frame);
  }
  for (const frame of plan.suffix) {
    await writeRaw(response, frame);
  }
}

function streamPlan(protocol, config) {
  const key = `${protocol}:${config.streamProfile}:${config.chunks}:${config.chunkBytes}`;
  const cached = streamPlanCache.get(key);
  if (cached) return cached;

  const completionTokens =
    config.chunks * Math.max(1, Math.ceil(config.chunkBytes / 4));
  const plan =
    protocol === "openai"
      ? openAiStreamPlan(config, completionTokens)
      : anthropicStreamPlan(config, completionTokens);

  streamPlanCache.set(key, plan);
  return plan;
}

function openAiStreamPlan(config, completionTokens) {
  const content =
    config.streamProfile === "coding-agent"
      ? codingAgentOpenAiChunks(config)
      : Array.from({ length: config.chunks }, (_, index) =>
          sseData({
            id: "chatcmpl-benchmark",
            object: "chat.completion.chunk",
            created: 0,
            model: "benchmark-model",
            choices: [
              {
                index: 0,
                delta: { content: deterministicText(index, config.chunkBytes) },
                finish_reason: null,
              },
            ],
          }),
        );

  return {
          prefix: [
            sseData({
              id: "chatcmpl-benchmark",
              object: "chat.completion.chunk",
              created: 0,
              model: "benchmark-model",
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant" },
                  finish_reason: null,
                },
              ],
            }),
          ],
          content,
          suffix: [
            sseData({
              id: "chatcmpl-benchmark",
              object: "chat.completion.chunk",
              created: 0,
              model: "benchmark-model",
              choices: [{
                index: 0,
                delta: {},
                finish_reason:
                  config.streamProfile === "coding-agent" ? "tool_calls" : "stop",
              }],
            }),
            sseData({
              id: "chatcmpl-benchmark",
              object: "chat.completion.chunk",
              created: 0,
              model: "benchmark-model",
              choices: [],
              usage: {
                prompt_tokens: 16,
                completion_tokens: completionTokens,
                total_tokens: 16 + completionTokens,
              },
            }),
            Buffer.from("data: [DONE]\n\n"),
          ],
        };
}

function anthropicStreamPlan(config, completionTokens) {
  if (config.streamProfile === "coding-agent") {
    return codingAgentAnthropicPlan(config, completionTokens);
  }

  return {
          prefix: [
            sseEvent("message_start", {
              type: "message_start",
              message: {
                id: "msg_benchmark",
                type: "message",
                role: "assistant",
                model: "benchmark-model",
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 16, output_tokens: 0 },
              },
            }),
            sseEvent("content_block_start", {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            }),
          ],
          content: Array.from({ length: config.chunks }, (_, index) =>
            sseEvent("content_block_delta", {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "text_delta",
                text: deterministicText(index, config.chunkBytes),
              },
            }),
          ),
          suffix: [
            sseEvent("content_block_stop", {
              type: "content_block_stop",
              index: 0,
            }),
            sseEvent("message_delta", {
              type: "message_delta",
              delta: { stop_reason: "end_turn", stop_sequence: null },
              usage: { output_tokens: completionTokens },
            }),
            sseEvent("message_stop", { type: "message_stop" }),
          ],
        };
}

function codingAgentOpenAiChunks(config) {
  const textChunks = Math.max(1, Math.floor(config.chunks / 2));
  const toolChunks = config.chunks - textChunks;
  const argumentParts = toolArgumentParts(toolChunks, config.chunkBytes);

  return Array.from({ length: config.chunks }, (_, index) => {
    const delta =
      index < textChunks
        ? { content: deterministicText(index, config.chunkBytes) }
        : {
            tool_calls: [
              {
                index: 0,
                ...(index === textChunks
                  ? {
                      id: "call_benchmark",
                      type: "function",
                      function: {
                        name: "apply_repository_patch",
                        arguments: argumentParts[index - textChunks],
                      },
                    }
                  : {
                      function: {
                        arguments: argumentParts[index - textChunks],
                      },
                    }),
              },
            ],
          };
    return sseData({
      id: "chatcmpl-benchmark",
      object: "chat.completion.chunk",
      created: 0,
      model: "benchmark-model",
      choices: [{ index: 0, delta, finish_reason: null }],
    });
  });
}

function codingAgentAnthropicPlan(config, completionTokens) {
  const textChunks = Math.max(1, Math.floor(config.chunks / 2));
  const toolChunks = config.chunks - textChunks;
  const argumentParts = toolArgumentParts(toolChunks, config.chunkBytes);

  return {
    prefix: [
      sseEvent("message_start", {
        type: "message_start",
        message: {
          id: "msg_benchmark",
          type: "message",
          role: "assistant",
          model: "benchmark-model",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 16, output_tokens: 0 },
        },
      }),
      sseEvent("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      }),
    ],
    content: [
      ...Array.from({ length: textChunks }, (_, index) =>
        sseEvent("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "text_delta",
            text: deterministicText(index, config.chunkBytes),
          },
        }),
      ),
      ...(toolChunks > 0
        ? [
            sseEvent("content_block_stop", {
              type: "content_block_stop",
              index: 0,
            }),
            sseEvent("content_block_start", {
              type: "content_block_start",
              index: 1,
              content_block: {
                type: "tool_use",
                id: "toolu_benchmark",
                name: "apply_repository_patch",
                input: {},
              },
            }),
            ...argumentParts.map((partialJson) =>
              sseEvent("content_block_delta", {
                type: "content_block_delta",
                index: 1,
                delta: { type: "input_json_delta", partial_json: partialJson },
              }),
            ),
          ]
        : []),
    ],
    suffix: [
      sseEvent("content_block_stop", {
        type: "content_block_stop",
        index: toolChunks > 0 ? 1 : 0,
      }),
      sseEvent("message_delta", {
        type: "message_delta",
        delta: {
          stop_reason: toolChunks > 0 ? "tool_use" : "end_turn",
          stop_sequence: null,
        },
        usage: { output_tokens: completionTokens },
      }),
      sseEvent("message_stop", { type: "message_stop" }),
    ],
  };
}

function toolArgumentParts(chunkCount, chunkBytes) {
  if (chunkCount === 0) return [];
  const totalBytes = chunkCount * chunkBytes;
  const prefix = '{"patch":"';
  const suffix = '"}';
  const value =
    totalBytes >= prefix.length + suffix.length
      ? `${prefix}${"p".repeat(totalBytes - prefix.length - suffix.length)}${suffix}`
      : "p".repeat(totalBytes);
  return Array.from({ length: chunkCount }, (_, index) =>
    value.slice(index * chunkBytes, (index + 1) * chunkBytes),
  );
}

function deterministicText(index, byteLength) {
  return String.fromCharCode(97 + (index % 26)).repeat(byteLength);
}

function sseData(payload) {
  return Buffer.from(`data: ${JSON.stringify(payload)}\n\n`);
}

function sseEvent(event, payload) {
  return Buffer.from(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function writeRaw(response, value) {
  if (response.destroyed || response.writableEnded) {
    throw new Error("downstream_disconnected");
  }

  stats.responseBytes += Buffer.isBuffer(value)
    ? value.length
    : Buffer.byteLength(value);
  if (!response.write(value)) {
    await waitForDrain(response);
  }
}

async function waitForDrain(response) {
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      response.off("drain", onDrain);
      response.off("close", onClose);
      response.off("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error("downstream_disconnected"));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };

    response.once("drain", onDrain);
    response.once("close", onClose);
    response.once("error", onError);
  });
}

function readHeaderInteger(request, name, fallback, minimum, maximum) {
  const rawValue = request.headers[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function readHeaderEnum(request, name, fallback, allowed) {
  const rawValue = request.headers[name];
  if (rawValue === undefined) return fallback;
  if (typeof rawValue !== "string" || !allowed.includes(rawValue)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return rawValue;
}

function readPort(rawValue, fallback) {
  if (rawValue === undefined) {
    return fallback;
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return value;
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { createBridge, createLangfuseClient } from "./bridge.mjs";

function fixture(overrides = {}) {
  const state = { threads: {}, events: {} };
  const calls = {
    starts: [],
    replies: [],
    notices: [],
    statuses: [],
    cancellations: [],
    connections: [],
    reads: [],
    errors: [],
    reactions: [],
  };
  const langfuse = {
    async connect(input) {
      calls.connections.push(input);
      return {
        connectionId: `connection-${input.externalUserId}`,
        userId: `langfuse-${input.externalUserId}`,
        linkUrl: null,
      };
    },
    async start(input) {
      calls.starts.push(input);
      return {
        runId: `run-${calls.starts.length}`,
        conversationId: "conversation-1",
      };
    },
    async get(runId, connectionId) {
      calls.reads.push({ runId, connectionId });
      return { status: "SUCCEEDED", text: "Found **two** traces. <!channel>" };
    },
    async cancel(runId, connectionId) {
      calls.cancellations.push({ runId, connectionId });
    },
    ...overrides,
  };
  const bridge = createBridge({
    slack: {
      reactions: {
        async add(input) {
          calls.reactions.push({
            method: "add",
            ...input,
            replyCount: calls.replies.length,
          });
        },
        async remove(input) {
          calls.reactions.push({
            method: "remove",
            ...input,
            replyCount: calls.replies.length,
          });
        },
      },
      async apiCall(_method, input) {
        calls.statuses.push(input.status);
      },
      chat: {
        async postMessage(input) {
          assert.fail(`Agent output must be private: ${input.text}`);
        },
        async postEphemeral(input) {
          if (input.text.startsWith("I'm still working"))
            calls.notices.push(input);
          else calls.replies.push(input);
        },
      },
    },
    langfuse,
    teamId: "TDEMO",
    channelId: "CDEMO",
    state,
    save: async () => {},
    wait: async () => {},
    reportError: (error) => calls.errors.push(error),
  });
  const mention = (eventId, text, extra = {}) =>
    bridge.mention({
      eventId,
      eventTeamId: "TDEMO",
      botUserId: "UBOT",
      event: {
        channel: "CDEMO",
        ts: "123.001",
        user: "UPERSON",
        text: `<@UBOT> ${text}`,
        ...extra,
      },
    });
  return { bridge, state, calls, mention };
}

test("delivers Markdown tables as native Slack blocks in private answers", async () => {
  const f = fixture({
    get: async () => ({
      status: "SUCCEEDED",
      text: "Results\n\n| Name | Count |\n| --- | ---: |\n| Trace | 2 |\n\nDone.",
    }),
  });
  await f.mention("EvTable", "Show a table");
  const tableReply = f.calls.replies.find(
    (reply) => reply.blocks?.[0]?.type === "table",
  );
  assert.ok(tableReply);
  assert.equal(tableReply.user, "UPERSON");
  assert.equal(tableReply.blocks[0].rows[1][0].text, "Trace");
  assert.equal(f.calls.replies[0].text.trim(), "Results");
  assert.equal(f.calls.replies.at(-1).text.trim(), "Done.");
});

test("formats agent Markdown only when delivering a Slack answer", async () => {
  const answer = Object.freeze({
    status: "SUCCEEDED",
    text: "# Results\n\n```js\nconst label = '**literal**';\n```",
  });
  const f = fixture({ get: async () => answer });
  await f.mention("EvMarkdown", "Explain **this**");
  const delivered = f.calls.replies.map((reply) => reply.text).join("\n");
  assert.match(delivered, /^\*Results\*/);
  assert.ok(delivered.includes("const label = '**literal**';"));
  assert.ok(!delivered.includes("```js"));
  assert.equal(
    answer.text,
    "# Results\n\n```js\nconst label = '**literal**';\n```",
  );
  assert.equal(f.calls.starts[0].message, "Explain **this**");
});

test("delivers one answer per event, preserves thread context, and escapes output mentions", async () => {
  const f = fixture();
  await Promise.all([
    f.mention("Ev1", "Find errors"),
    f.mention("Ev1", "Find errors"),
  ]);
  await f.mention("Ev1", "Find errors");
  await f.mention("Ev2", "Explain the second one", {
    thread_ts: "123.001",
    ts: "123.002",
  });
  assert.equal(f.calls.starts.length, 2);
  assert.equal(f.calls.starts[0].message, "Find errors");
  assert.equal(f.calls.starts[0].connectionId, "connection-UPERSON");
  assert.deepEqual(f.state.events.Ev1.context, {
    userId: "langfuse-UPERSON",
    connectionId: "connection-UPERSON",
  });
  assert.equal(f.calls.reads[0].connectionId, "connection-UPERSON");
  assert.equal(f.calls.starts[1].conversationId, "conversation-1");
  assert.deepEqual(
    f.calls.starts.map((c) => c.idempotencyKey),
    ["Ev1", "Ev2"],
  );
  assert.equal(f.calls.replies.length, 2);
  assert.equal(f.calls.replies[1].thread_ts, "123.001");
  assert.equal(f.calls.replies[1].user, "UPERSON");
  assert.equal(f.calls.replies[0].text, "Found *two* traces. &lt;!channel&gt;");
  assert.deepEqual(f.calls.statuses, [
    "processing",
    "active",
    "processing",
    "active",
  ]);
});

test("does not run or reply outside the allowed workspace/channel or to bot messages", async () => {
  const f = fixture();
  await f.mention("Ev1", "Hello", { channel: "COTHER" });
  await f.mention("Ev2", "Hello", { bot_id: "BOTHER" });
  await f.bridge.mention({
    eventId: "Ev3",
    eventTeamId: "TOTHER",
    botUserId: "UBOT",
    event: {
      channel: "CDEMO",
      ts: "123.001",
      user: "UPERSON",
      text: "<@UBOT> Hello",
    },
  });
  assert.equal(f.calls.starts.length, 0);
  assert.equal(f.calls.replies.length, 0);
  assert.equal(f.calls.statuses.length, 0);
});

test("a stop request during submission cancels the accepted run and clears the status", async () => {
  let accept;
  let started;
  const submitting = new Promise((resolve) => {
    started = resolve;
  });
  const f = fixture({
    start: async () => {
      started();
      return await new Promise((resolve) => {
        accept = resolve;
      });
    },
    get: async () => ({ status: "CANCELLED", text: null }),
  });
  const turn = f.mention("Ev1", "Find errors");
  await submitting;
  await f.mention("Ev2", "Another question", { thread_ts: "123.001" });
  assert.equal(f.calls.notices.length, 1);
  assert.equal(f.calls.notices[0].user, "UPERSON");
  assert.equal(f.state.events.Ev2, undefined);
  await f.bridge.stop({
    eventTeamId: "TDEMO",
    event: { channel: "CDEMO", thread_ts: "123.001", user: "UPERSON" },
  });
  accept({ runId: "run-1", conversationId: "conversation-1" });
  await turn;
  assert.deepEqual(f.calls.cancellations, [
    { runId: "run-1", connectionId: "connection-UPERSON" },
  ]);
  assert.equal(f.calls.replies[0].text, "Stopped.");
  assert.deepEqual(f.calls.statuses, ["processing", "active"]);
});

test("resumes a persisted run without submitting it again and clears failed loading state", async () => {
  const f = fixture({
    get: async () => ({ status: "FAILED", errorCode: "worker_failed" }),
  });
  f.state.events.Ev1 = {
    eventId: "Ev1",
    threadKey: "TDEMO:CDEMO:123.001:UPERSON",
    channel: "CDEMO",
    threadTs: "123.001",
    runId: "run-before-restart",
    slackUserId: "UPERSON",
    context: { userId: "langfuse-UPERSON", connectionId: "connection-UPERSON" },
    done: false,
  };
  await f.bridge.resume();
  assert.equal(f.calls.starts.length, 0);
  assert.equal(f.state.events.Ev1.done, true);
  assert.deepEqual(f.calls.reactions, []);
  assert.deepEqual(f.calls.cancellations, [
    { runId: "run-before-restart", connectionId: "connection-UPERSON" },
  ]);
  assert.deepEqual(f.calls.statuses, ["processing", "active"]);
  assert.equal(
    f.calls.replies[0].text,
    "I couldn't finish that request. Please try again.",
  );
});

test("refuses insecure remote API destinations before sending credentials", () => {
  for (const baseUrl of [
    "http://example.com",
    "file:///tmp/demo",
    "https://user:password@example.com",
  ]) {
    assert.throws(
      () =>
        createLangfuseClient({ baseUrl, publicKey: "test", secretKey: "test" }),
      /must use HTTPS/,
    );
  }
});

test("prompts an unlinked sender privately without starting an agent run", async () => {
  const f = fixture({
    connect: async () => ({
      connectionId: "pending",
      userId: null,
      linkUrl: "https://langfuse.example/agent/connect?token=secret",
    }),
  });
  await f.mention("Ev1", "Find errors");
  assert.equal(f.calls.starts.length, 0);
  assert.equal(f.calls.statuses.length, 0);
  assert.equal(f.calls.replies[0].user, "UPERSON");
  assert.equal(
    f.calls.replies[0].thread_ts,
    undefined,
    "Slack hides ephemeral replies to a mention without an active thread",
  );
  assert.match(f.calls.replies[0].text, /link your Langfuse account/);
  assert.equal(JSON.stringify(f.state).includes("secret"), false);
  assert.deepEqual(f.calls.reactions, []);
});

test("different senders in the same Slack thread get separate conversations", async () => {
  const f = fixture();
  await f.mention("Ev1", "My traces");
  await f.mention("Ev2", "My traces too", {
    user: "UOTHER",
    thread_ts: "123.001",
  });
  assert.equal(f.calls.starts[1].conversationId, undefined);
  assert.equal(f.calls.starts[1].connectionId, "connection-UOTHER");
  assert.equal(f.calls.replies[1].user, "UOTHER");
});

test("another sender cannot stop an active request", async () => {
  let accept;
  let started;
  const submitting = new Promise((resolve) => {
    started = resolve;
  });
  const f = fixture({
    start: async () => {
      started();
      return new Promise((resolve) => {
        accept = resolve;
      });
    },
  });
  const turn = f.mention("Ev1", "Find errors");
  await submitting;
  await f.bridge.stop({
    eventTeamId: "TDEMO",
    event: { channel: "CDEMO", thread_ts: "123.001", user: "UOTHER" },
  });
  accept({ runId: "run-1", conversationId: "conversation-1" });
  await turn;
  assert.deepEqual(f.calls.cancellations, []);
});

test("does not resume legacy shared-identity runs", async () => {
  const f = fixture();
  f.state.events.old = {
    threadKey: "TDEMO:CDEMO:123.001",
    channel: "CDEMO",
    runId: "shared-run",
    done: false,
  };
  await f.bridge.resume();
  assert.equal(f.calls.reads.length, 0);
  assert.equal(f.calls.starts.length, 0);
  assert.equal(f.calls.replies.length, 0);
});

test("sends the verified connection on create, read, and cancel requests", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: new URL(url), ...options });
    return new Response(JSON.stringify({}), { status: 200 });
  });
  const client = createLangfuseClient({
    baseUrl: "https://example.com/langfuse/",
    publicKey: "test-public",
    secretKey: "test-secret",
  });
  await client.connect({
    provider: "slack",
    workspaceId: "TDEMO",
    externalUserId: "UPERSON",
  });
  await client.start({
    connectionId: "connection-1",
    message: "Hello",
    idempotencyKey: "Ev1",
  });
  await client.get("run-1", "connection-1");
  await client.cancel("run-1", "connection-1");
  assert.equal(
    requests[0].url.pathname,
    "/langfuse/api/public/agent/connections",
  );
  assert.equal(JSON.parse(requests[1].body).connectionId, "connection-1");
  for (const request of requests.slice(2)) {
    assert.equal(request.url.searchParams.get("connectionId"), "connection-1");
    assert.equal(request.redirect, "error");
  }
  assert.equal(requests[3].method, "POST");
});

test("keeps the shared thread working status until every user's run finishes", async () => {
  const firstPoll = Promise.withResolvers();
  const secondPoll = Promise.withResolvers();
  const firstResult = Promise.withResolvers();
  const secondResult = Promise.withResolvers();
  const f = fixture({
    get: async (runId) => {
      if (runId === "run-1") {
        firstPoll.resolve();
        return firstResult.promise;
      }
      secondPoll.resolve();
      return secondResult.promise;
    },
  });

  const firstRun = f.mention("Ev1", "First person's question");
  await firstPoll.promise;
  const secondRun = f.mention("Ev2", "Second person's question", {
    user: "UOTHER",
    thread_ts: "123.001",
  });
  await secondPoll.promise;

  firstResult.resolve({ status: "SUCCEEDED", text: "First answer" });
  await firstRun;
  const statusesWhileSecondRuns = [...f.calls.statuses];
  secondResult.resolve({ status: "SUCCEEDED", text: "Second answer" });
  await secondRun;

  assert.deepEqual(statusesWhileSecondRuns, ["processing", "processing"]);
  assert.deepEqual(f.calls.statuses, ["processing", "processing", "active"]);
  assert.deepEqual(
    f.calls.replies.map((reply) => reply.user),
    ["UPERSON", "UOTHER"],
  );
});

test("reacts to the shared-mode question rather than its thread root, after delivering the answer", async () => {
  const f = fixture();
  await f.mention("reaction", "Find errors", {
    thread_ts: "123.001",
    ts: "123.002",
  });
  await f.mention("reaction", "Find errors", {
    thread_ts: "123.001",
    ts: "123.002",
  });
  assert.deepEqual(f.calls.reactions, [
    {
      method: "add",
      channel: "CDEMO",
      timestamp: "123.002",
      name: "halo-looking-into-it",
      replyCount: 0,
    },
    {
      method: "remove",
      channel: "CDEMO",
      timestamp: "123.002",
      name: "halo-looking-into-it",
      replyCount: 1,
    },
    {
      method: "remove",
      channel: "CDEMO",
      timestamp: "123.002",
      name: "eyes",
      replyCount: 1,
    },
    {
      method: "add",
      channel: "CDEMO",
      timestamp: "123.002",
      name: "halo-done-sitting-check",
      replyCount: 1,
    },
  ]);
  assert.equal(f.state.events.reaction.messageTs, "123.002");
});

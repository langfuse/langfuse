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
    errors: [],
  };
  const langfuse = {
    async start(input) {
      calls.starts.push(input);
      return {
        runId: `run-${calls.starts.length}`,
        conversationId: "conversation-1",
      };
    },
    async get() {
      return { status: "SUCCEEDED", text: "Found **two** traces. <!channel>" };
    },
    async cancel(runId) {
      calls.cancellations.push(runId);
    },
    ...overrides,
  };
  const bridge = createBridge({
    slack: {
      async apiCall(_method, input) {
        calls.statuses.push(input.status);
      },
      chat: {
        async postMessage(input) {
          calls.replies.push(input);
        },
        async postEphemeral(input) {
          calls.notices.push(input);
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
  assert.equal(f.calls.starts[1].conversationId, "conversation-1");
  assert.deepEqual(
    f.calls.starts.map((c) => c.idempotencyKey),
    ["Ev1", "Ev2"],
  );
  assert.equal(f.calls.replies.length, 2);
  assert.equal(f.calls.replies[1].thread_ts, "123.001");
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
    event: { channel: "CDEMO", thread_ts: "123.001" },
  });
  accept({ runId: "run-1", conversationId: "conversation-1" });
  await turn;
  assert.deepEqual(f.calls.cancellations, ["run-1"]);
  assert.equal(f.calls.replies[0].text, "Stopped.");
  assert.deepEqual(f.calls.statuses, ["processing", "active"]);
});

test("resumes a persisted run without submitting it again and clears failed loading state", async () => {
  const f = fixture({
    get: async () => ({ status: "FAILED", errorCode: "worker_failed" }),
  });
  f.state.events.Ev1 = {
    eventId: "Ev1",
    threadKey: "TDEMO:CDEMO:123.001",
    channel: "CDEMO",
    threadTs: "123.001",
    runId: "run-before-restart",
    done: false,
  };
  await f.bridge.resume();
  assert.equal(f.calls.starts.length, 0);
  assert.equal(f.state.events.Ev1.done, true);
  assert.deepEqual(f.calls.cancellations, ["run-before-restart"]);
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

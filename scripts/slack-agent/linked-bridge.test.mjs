import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  createLinkedBridge,
  createLinkedLangfuseClient,
  PROJECT_ACTION,
} from "./linked-bridge.mjs";
import { readConfig } from "./env.mjs";

function fixture(overrides = {}) {
  const state = { threads: {}, events: {}, preferences: {} };
  const calls = {
    starts: [],
    gets: [],
    connects: [],
    connections: [],
    cancellations: [],
    replies: [],
    notices: [],
    updates: [],
    statuses: [],
    errors: [],
    reactions: [],
    saved: [],
  };
  const account = {
    linked: true,
    linkId: "link-one",
    projects: [
      { id: "project-one", name: "Production", orgName: "First organization" },
      { id: "project-two", name: "Staging", orgName: "Second organization" },
    ],
  };
  const langfuse = {
    async projects() {
      return structuredClone(account);
    },
    async connection(input) {
      calls.connections.push(input);
      return {
        linkUrl: `http://localhost:3004/slack-agent?token=${"a".repeat(64)}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      };
    },
    async connect(input) {
      calls.connects.push(input);
      return { linked: true };
    },
    async start(input) {
      calls.starts.push(input);
      return {
        runId: `run-${calls.starts.length}`,
        conversationId: `conversation-${input.projectId}`,
      };
    },
    async get(input) {
      calls.gets.push(input);
      return { status: "SUCCEEDED", text: "Found **two** traces. <!channel>" };
    },
    async cancel(input) {
      calls.cancellations.push(input);
    },
    ...overrides,
  };
  const slack = {
    reactions: {
      async add(input) {
        calls.reactions.push({ method: "add", ...input });
      },
      async remove(input) {
        calls.reactions.push({ method: "remove", ...input });
      },
    },
    async apiCall(_method, input) {
      calls.statuses.push(input);
    },
    chat: {
      async postMessage(input) {
        calls.replies.push(input);
        return { ts: `picker-${calls.replies.length}` };
      },
      async postEphemeral(input) {
        calls.notices.push(input);
      },
      async update(input) {
        calls.updates.push(input);
      },
    },
  };
  const build = () =>
    createLinkedBridge({
      slack,
      langfuse,
      state,
      teamId: "TDEMO",
      botUserId: "UBOT",
      channelId: "CPUBLIC",
      publicUrl: "https://demo.example.com",
      baseUrl: "http://localhost:3004",
      save: async () => {
        calls.saved.push(JSON.stringify(state));
      },
      wait: async () => {},
      reportError: (error) => calls.errors.push(error),
    });
  let bridge = build();
  const message = (eventId, text, extra = {}) =>
    bridge.message({
      eventId,
      eventTeamId: "TDEMO",
      event: {
        channel: "DDIRECT",
        channel_type: "im",
        user: "UOWNER",
        ts: "123.001",
        text,
        ...extra,
      },
    });
  const payload = (eventId, user = "UOWNER") => ({
    team: { id: "TDEMO" },
    user: { id: user },
    channel: { id: state.events[eventId].channel },
    message: { ts: state.events[eventId].pickerTs },
    block_id: `langfuse_project:${eventId}`,
  });
  const choose = (eventId, projectId = "project-one", user) =>
    bridge.chooseProject({
      body: payload(eventId, user),
      action: {
        action_id: PROJECT_ACTION,
        block_id: `langfuse_project:${eventId}`,
        selected_option: { value: projectId },
      },
    });
  return {
    state,
    calls,
    account,
    langfuse,
    slack,
    message,
    mention: (eventId, text, extra = {}) =>
      bridge.mention({
        eventId,
        eventTeamId: "TDEMO",
        event: {
          channel: "CPUBLIC",
          user: "UOWNER",
          ts: "123.001",
          text,
          ...extra,
        },
      }),
    choose,
    payload,
    get bridge() {
      return bridge;
    },
    restart() {
      bridge = build();
      return bridge;
    },
  };
}

test("delivers browser confirmation links only to the requesting user", async () => {
  const f = fixture();
  f.account.linked = false;
  await f.mention("unlinked-channel", "<@UBOT> Find errors");
  assert.equal(f.calls.replies.length, 0);
  assert.equal(f.calls.notices.length, 1);
  assert.equal(f.calls.notices[0].user, "UOWNER");
  assert.equal(f.calls.notices[0].thread_ts, undefined);
  assert.ok(
    f.calls.notices[0].text.includes(
      `https://demo.example.com/slack-agent?token=${"a".repeat(64)}`,
    ),
  );
  await f.message("unlinked-followup", "Try again", {
    channel: "CPUBLIC",
    channel_type: "channel",
    ts: "123.002",
    thread_ts: "123.001",
  });
  assert.equal(f.calls.notices[1].thread_ts, "123.001");
  await f.message("unlinked-dm", "Find errors");
  assert.equal(f.calls.replies.length, 1);
  assert.ok(f.calls.replies[0].text.includes(`token=${"a".repeat(64)}`));
  assert.deepEqual(
    f.calls.connections,
    Array.from({ length: 3 }, () => ({
      teamId: "TDEMO",
      slackUserId: "UOWNER",
    })),
  );
  assert.ok(f.calls.saved.every((value) => !value.includes("a".repeat(64))));
  assert.equal(f.calls.starts.length, 0);
  f.account.linked = true;
  await f.message("connected-followup", "Find errors", {
    channel: "CPUBLIC",
    channel_type: "channel",
    ts: "123.003",
    thread_ts: "123.001",
  });
  assert.equal(
    f.calls.replies.at(-1).blocks[0].accessory.type,
    "external_select",
  );
  await f.choose("connected-followup");
  assert.equal(f.calls.starts.length, 1);
});

test("keeps connection codes private and ignores unrelated messages", async () => {
  const f = fixture();
  f.account.linked = false;
  await f.message("unlinked", "Find errors");
  assert.match(
    f.calls.replies[0].text,
    /https:\/\/demo.example.com\/slack-agent/,
  );
  await f.message("connect", "connect private-code", { ts: "124.001" });
  await f.message("connect", "connect private-code", { ts: "124.001" });
  await f.message("malformed", "connect private-code please", {
    ts: "125.001",
  });
  assert.deepEqual(f.calls.connects, [
    { teamId: "TDEMO", slackUserId: "UOWNER", code: "private-code" },
  ]);
  assert.ok(f.calls.saved.every((value) => !value.includes("private-code")));
  const count = f.calls.replies.length;
  await f.message("channel", "Find errors", {
    channel: "CPUBLIC",
    channel_type: "channel",
  });
  await f.message("group", "Find errors", {
    channel: "GPRIVATE",
    channel_type: "mpim",
  });
  await f.message("bot", "Find errors", { bot_id: "BBOT" });
  await f.message("edited", "Find errors", { subtype: "message_changed" });
  await f.bridge.message({
    eventId: "team",
    eventTeamId: "TOTHER",
    event: {
      channel: "DDIRECT",
      channel_type: "im",
      user: "UOWNER",
      ts: "123.001",
      text: "Find errors",
    },
  });
  assert.equal(f.calls.replies.length, count);
  await f.bridge.mention({
    eventId: "mention",
    eventTeamId: "TDEMO",
    event: {
      channel: "CPUBLIC",
      user: "UOWNER",
      ts: "123.001",
      text: "<@UBOT> secret question",
    },
  });
  assert.equal(f.calls.notices.length, 1);
  assert.equal(f.calls.notices.at(-1).thread_ts, undefined);
  assert.match(f.calls.notices.at(-1).text, /slack-agent\?token=/);
  await f.mention("channel-code", "<@UBOT> connect public-code", {
    ts: "125.003",
  });
  assert.ok(f.calls.saved.every((value) => !value.includes("public-code")));
  assert.equal(f.calls.connects.length, 1);
  assert.equal(f.calls.starts.length, 0);
  assert.equal(
    readConfig({
      SLACK_AGENT_MODE: "linked",
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_APP_TOKEN: "xapp-test",
      SLACK_TEAM_ID: "TDEMO",
      LANGFUSE_BASE_URL: "http://localhost:3004",
      LANGFUSE_SLACK_AGENT_SECRET: "test-secret",
    }).mode,
    "linked",
  );
});

test("searches all accessible projects, persists a selected question, and keeps follow-ups on its project after restart", async () => {
  const f = fixture();
  for (let index = 0; index < 105; index++)
    f.account.projects.push({
      id: `other-${index}`,
      name: `Extra ${index}`,
      orgName: "Other",
    });
  await f.message("Ev1", "Find errors");
  await f.message("Ev1", "Find errors");
  assert.equal(f.calls.replies.length, 1);
  assert.equal(f.calls.replies[0].blocks[0].accessory.type, "external_select");
  const initial = await f.bridge.options({ body: f.payload("Ev1") });
  assert.equal(initial.options.length, 100);
  const searched = await f.bridge.options({
    body: { ...f.payload("Ev1"), value: "Extra 104" },
  });
  assert.deepEqual(
    searched.options.map((o) => o.value),
    ["other-104"],
  );
  f.restart();
  await f.choose("Ev1", "project-two");
  await f.choose("Ev1", "project-one");
  assert.equal(f.calls.starts.length, 1);
  assert.equal(f.calls.starts[0].message, "Find errors");
  assert.equal(f.calls.starts[0].projectId, "project-two");
  assert.equal(f.calls.starts[0].slackUserId, "UOWNER");
  assert.equal(f.calls.starts[0].linkId, "link-one");
  assert.equal(
    f.calls.replies.at(-1).text,
    "Found *two* traces. &lt;!channel&gt;",
  );
  f.restart();
  await f.message("Ev2", "Explain the second one", {
    ts: "123.002",
    thread_ts: "123.001",
  });
  assert.equal(f.calls.starts[1].conversationId, "conversation-project-two");
  assert.equal(f.calls.starts[1].projectId, "project-two");
  await f.message("Ev3", "Another project?", { ts: "130.001" });
  assert.equal(f.calls.starts.length, 2);
  assert.match(f.calls.replies.at(-1).blocks[1].elements[0].text, /Staging/);
  assert.deepEqual(
    f.calls.statuses.map((s) => s.status),
    ["processing", "active", "processing", "active"],
  );
});

test("rejects other actors, changed account links, and revoked project selections", async () => {
  const f = fixture();
  await f.message("Ev1", "Find errors");
  assert.deepEqual(
    await f.bridge.options({ body: f.payload("Ev1", "UOTHER") }),
    { options: [] },
  );
  await f.choose("Ev1", "project-one", "UOTHER");
  const wrongTeam = { ...f.payload("Ev1"), team: { id: "TOTHER" } };
  assert.deepEqual(await f.bridge.options({ body: wrongTeam }), {
    options: [],
  });
  const wrongChannel = { ...f.payload("Ev1"), channel: { id: "DOTHER" } };
  assert.deepEqual(await f.bridge.options({ body: wrongChannel }), {
    options: [],
  });
  f.account.projects = f.account.projects.filter((p) => p.id !== "project-one");
  await f.choose("Ev1", "project-one");
  assert.equal(f.calls.starts.length, 0);
  f.account.linkId = "replacement-link";
  assert.deepEqual(await f.bridge.options({ body: f.payload("Ev1") }), {
    options: [],
  });
  await f.choose("Ev1", "project-two");
  assert.equal(f.calls.starts.length, 0);
  assert.match(f.calls.replies.at(-1).text, /connection changed/);
  assert.equal(f.state.threads["TDEMO:DDIRECT:123.001"].projectId, undefined);
});

for (const channel of ["DDIRECT", "CPUBLIC"]) {
  test(`resumes a ${channel} run without resubmitting and permits only its owner to stop`, async () => {
    let releasePoll;
    let signalPolling;
    const polling = new Promise((resolve) => {
      signalPolling = resolve;
    });
    const f = fixture({
      get: async (input) => {
        f.calls.gets.push(input);
        signalPolling();
        await new Promise((resolve) => {
          releasePoll = resolve;
        });
        return { status: "CANCELLED" };
      },
    });
    f.state.threads[`TDEMO:${channel}:123.001`] = {
      slackUserId: "UOWNER",
      linkId: "link-one",
      projectId: "project-one",
      conversationId: "conversation-before-restart",
    };
    f.state.events.Ev1 = {
      eventId: "Ev1",
      teamId: "TDEMO",
      threadKey: `TDEMO:${channel}:123.001`,
      channel: channel,
      threadTs: "123.001",
      slackUserId: "UOWNER",
      linkId: "link-one",
      projectId: "project-one",
      runId: "existing-run",
      phase: "running",
      done: false,
    };
    const resumed = f.bridge.resume();
    await polling;
    await f.bridge.stop({
      eventTeamId: "TDEMO",
      event: { channel: channel, thread_ts: "123.001", user: "UOTHER" },
    });
    assert.equal(f.calls.cancellations.length, 0);
    await f.bridge.stop({
      eventTeamId: "TDEMO",
      event: { channel: channel, thread_ts: "123.001", user: "UOWNER" },
    });
    assert.deepEqual(f.calls.cancellations, [
      {
        teamId: "TDEMO",
        slackUserId: "UOWNER",
        linkId: "link-one",
        projectId: "project-one",
        runId: "existing-run",
      },
    ]);
    releasePoll();
    await resumed;
    assert.equal(f.calls.starts.length, 0);
    assert.equal(f.calls.replies.at(-1).text, "Stopped.");
    assert.equal(f.state.events.Ev1.done, true);
    assert.deepEqual(f.calls.reactions, []);
  });
}

test("restores a pending project picker after interruption before Slack delivery", async () => {
  const f = fixture();
  await f.message("Ev1", "Find errors");
  delete f.state.events.Ev1.pickerTs;
  f.calls.replies.length = 0;
  await f.restart().resume();
  assert.equal(f.calls.replies.length, 1);
  assert.equal(f.calls.replies[0].blocks[0].accessory.type, "external_select");
  await f.choose("Ev1");
  assert.equal(f.calls.starts[0].message, "Find errors");
});

test("answers channel mentions publicly and keeps owner followups on the selected project", async () => {
  const f = fixture();
  await f.mention("root", "<@UBOT> Find errors");
  assert.equal(f.calls.replies[0]?.thread_ts, "123.001");
  assert.equal(f.calls.replies[0]?.blocks[0].accessory.type, "external_select");
  assert.equal(f.calls.notices.length, 0);
  await f.mention("duplicate", "<@UBOT> Find errors");
  await f.message("duplicate-message", "<@UBOT> Find errors", {
    channel: "CPUBLIC",
    channel_type: "channel",
  });
  assert.equal(f.calls.replies.length, 1);
  assert.deepEqual(
    await f.bridge.options({ body: f.payload("root", "UOTHER") }),
    { options: [] },
  );
  await f.choose("root", "project-one", "UOTHER");
  assert.equal(f.calls.starts.length, 0);
  await f.message("queued", "Explain the second one", {
    channel: "CPUBLIC",
    channel_type: "channel",
    ts: "123.002",
    thread_ts: "123.001",
  });
  f.restart();
  await f.bridge.resume();
  await f.choose("root", "project-two");
  assert.deepEqual(
    f.calls.starts.map((r) => r.message),
    ["Find errors", "Explain the second one"],
  );
  assert.equal(f.calls.starts[1].conversationId, "conversation-project-two");
  f.restart();
  await f.message("followup", "What about yesterday?", {
    channel: "CPUBLIC",
    channel_type: "channel",
    ts: "123.003",
    thread_ts: "123.001",
  });
  assert.equal(f.calls.starts[2].projectId, "project-two");
  await f.message("outsider", "Tell me secrets", {
    channel: "CPUBLIC",
    channel_type: "channel",
    user: "UOTHER",
    ts: "123.004",
    thread_ts: "123.001",
  });
  await f.mention("outsider-mention", "<@UBOT> Tell me secrets", {
    user: "UOTHER",
    ts: "123.005",
    thread_ts: "123.001",
  });
  await f.mention("wrong-channel", "<@UBOT> Find errors", {
    channel: "COTHER",
  });
  await f.message("noise", "Just chatting", {
    channel: "CPUBLIC",
    channel_type: "channel",
    ts: "124.001",
  });
  assert.equal(f.calls.starts.length, 3);
  assert.equal(f.calls.replies.length, 4);
});

test("reserves channel ownership before account lookup and serializes followups during a run", async () => {
  let releaseProjects;
  const f = fixture();
  const originalProjects = f.langfuse.projects;
  f.langfuse.projects = () =>
    new Promise((resolve) => {
      releaseProjects = async () => resolve(await originalProjects());
    });
  const root = f.mention("root", "<@UBOT> First question");
  await new Promise((resolve) => setImmediate(resolve));
  await f.mention("intruder", "<@UBOT> Steal thread", {
    user: "UOTHER",
    ts: "123.002",
    thread_ts: "123.001",
  });
  assert.equal(f.state.threads["TDEMO:CPUBLIC:123.001"]?.slackUserId, "UOWNER");
  await releaseProjects();
  await root;
  f.langfuse.projects = originalProjects;
  let releaseRun;
  let signalRun;
  const running = new Promise((resolve) => {
    signalRun = resolve;
  });
  f.langfuse.get = async () => {
    signalRun();
    await new Promise((resolve) => {
      releaseRun = resolve;
    });
    return { status: "SUCCEEDED", text: "First answer" };
  };
  const choosing = f.choose("root");
  await running;
  await f.message("followup", "Second question", {
    channel: "CPUBLIC",
    channel_type: "channel",
    ts: "123.003",
    thread_ts: "123.001",
  });
  assert.equal(f.calls.starts.length, 1);
  f.langfuse.get = async () => ({ status: "SUCCEEDED", text: "Second answer" });
  releaseRun();
  await choosing;
  assert.deepEqual(
    f.calls.starts.map((r) => r.message),
    ["First question", "Second question"],
  );
  assert.equal(f.calls.starts[1].conversationId, "conversation-project-one");
  assert.ok(f.state.events.followup.done);
});

test("answers channel questions when Slack does not support the working indicator", async () => {
  const f = fixture();
  f.slack.apiCall = async () => {
    throw Object.assign(new Error("Status unsupported"), {
      code: "unsupported_channel_type",
    });
  };
  await f.mention("root", "<@UBOT> Find errors");
  await f.choose("root");
  assert.equal(f.calls.starts.length, 1);
  assert.equal(f.calls.gets.length, 1);
  assert.equal(f.calls.cancellations.length, 0);
  assert.equal(
    f.calls.replies.at(-1).text,
    "Found *two* traces. &lt;!channel&gt;",
  );
  assert.equal(f.calls.replies.at(-1).thread_ts, "123.001");
  assert.ok(f.state.events.root.done);
});

test("waits for cold project lookups, sends linked identity, and refuses redirected credentials", async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({
      url: req.url,
      authorization: req.headers.authorization,
      body: JSON.parse(body),
    });
    if (requests.length > 1) {
      res.writeHead(302, { Location: "/unexpected" });
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1900));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write(
        JSON.stringify({ linked: true, linkId: "link-one", projects: [] }),
      );
    }
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const client = createLinkedLangfuseClient({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      serviceSecret: "test-service-secret",
    });
    await client.projects({ teamId: "TDEMO", slackUserId: "UOWNER" });
    assert.deepEqual(requests[0], {
      url: "/api/slack-agent",
      authorization: "Bearer test-service-secret",
      body: { operation: "projects", teamId: "TDEMO", slackUserId: "UOWNER" },
    });
    await assert.rejects(
      client.connection({ teamId: "TDEMO", slackUserId: "UOWNER" }),
    );
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].body, {
      operation: "connection",
      teamId: "TDEMO",
      slackUserId: "UOWNER",
    });
    for (const baseUrl of [
      "http://example.com",
      "https://user:password@example.com",
      "file:///tmp/demo",
    ])
      assert.throws(
        () =>
          createLinkedLangfuseClient({
            baseUrl,
            serviceSecret: "test-service-secret",
          }),
        /must use HTTPS/,
      );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("marks each DM and channel question only while running and after its answer is delivered", async () => {
  for (const channel of ["DDIRECT", "CPUBLIC"]) {
    const f = fixture();
    const answerStarted = Promise.withResolvers();
    const allowAnswer = Promise.withResolvers();
    const post = f.slack.chat.postMessage;
    f.slack.chat.postMessage = async (input) => {
      if (!input.blocks) {
        answerStarted.resolve();
        await allowAnswer.promise;
      }
      return post(input);
    };
    if (channel === "DDIRECT") await f.message("root", "Find errors");
    else await f.mention("root", "<@UBOT> Find errors");
    assert.deepEqual(
      f.calls.reactions,
      [],
      "Project selection is not a running question",
    );
    const run = f.choose("root");
    await answerStarted.promise;
    const whilePosting = [...f.calls.reactions];
    allowAnswer.resolve();
    await run;
    assert.deepEqual(whilePosting, [
      {
        method: "add",
        channel,
        timestamp: "123.001",
        name: "halo-looking-into-it",
      },
    ]);
    assert.deepEqual(f.calls.reactions, [
      ...whilePosting,
      {
        method: "remove",
        channel,
        timestamp: "123.001",
        name: "halo-looking-into-it",
      },
      {
        method: "remove",
        channel,
        timestamp: "123.001",
        name: "eyes",
      },
      {
        method: "add",
        channel,
        timestamp: "123.001",
        name: "halo-done-sitting-check",
      },
    ]);
    f.calls.reactions.length = 0;
    await f.message("followup", "Explain more", {
      channel,
      thread_ts: "123.001",
      ts: "123.002",
    });
    await f.message("followup", "Explain more", {
      channel,
      thread_ts: "123.001",
      ts: "123.002",
    });
    assert.deepEqual(f.calls.reactions, [
      {
        method: "add",
        channel,
        timestamp: "123.002",
        name: "halo-looking-into-it",
      },
      {
        method: "remove",
        channel,
        timestamp: "123.002",
        name: "halo-looking-into-it",
      },
      {
        method: "remove",
        channel,
        timestamp: "123.002",
        name: "eyes",
      },
      {
        method: "add",
        channel,
        timestamp: "123.002",
        name: "halo-done-sitting-check",
      },
    ]);
  }
});

test("clears working without a done reaction for failed, stopped, timed-out, approval, or undelivered answers", async () => {
  for (const outcome of [
    "FAILED",
    "CANCELLED",
    "AWAITING_APPROVAL",
    "RUNNING",
    "delivery-failed",
  ]) {
    const f = fixture({
      get: async () => ({
        status: outcome === "delivery-failed" ? "SUCCEEDED" : outcome,
        text: "Answer",
      }),
    });
    await f.message("root", "Find errors");
    if (outcome === "delivery-failed")
      f.slack.chat.postMessage = async () => {
        throw new Error("Message delivery failed");
      };
    await f.choose("root");
    assert.deepEqual(
      f.calls.reactions,
      [
        {
          method: "add",
          channel: "DDIRECT",
          timestamp: "123.001",
          name: "halo-looking-into-it",
        },
        {
          method: "remove",
          channel: "DDIRECT",
          timestamp: "123.001",
          name: "halo-looking-into-it",
        },
        {
          method: "remove",
          channel: "DDIRECT",
          timestamp: "123.001",
          name: "eyes",
        },
      ],
      outcome,
    );
    assert.equal(f.state.events.root.done, true);
  }
});

test("reaction API failures never interrupt an answer and replayed reaction changes are harmless", async () => {
  for (const code of ["missing_scope", "invalid_name", "already_reacted"]) {
    const f = fixture();
    f.slack.reactions.add = async (input) => {
      f.calls.reactions.push({ method: "add", ...input });
      throw Object.assign(new Error(code), {
        code: "slack_webapi_platform_error",
        data: { error: code },
      });
    };
    f.slack.reactions.remove = async (input) => {
      f.calls.reactions.push({ method: "remove", ...input });
      throw Object.assign(new Error("no_reaction"), {
        code: "slack_webapi_platform_error",
        data: { error: "no_reaction" },
      });
    };
    await f.message("root", "Find errors");
    await f.choose("root");
    assert.equal(
      f.calls.replies.at(-1).text,
      "Found *two* traces. &lt;!channel&gt;",
    );
    assert.equal(f.calls.cancellations.length, 0);
    assert.equal(f.state.events.root.done, true);
    assert.equal(f.calls.reactions.length, code === "invalid_name" ? 6 : 4);
    assert.equal(f.calls.errors.length, code === "already_reacted" ? 0 : 2);
  }
});

function workspaceReactions(f, customEmojis) {
  const present = new Set();
  const available = new Set(["eyes", "white_check_mark", ...customEmojis]);
  for (const method of ["add", "remove"]) {
    f.slack.reactions[method] = async (input) => {
      f.calls.reactions.push({ method, ...input });
      const code = !available.has(input.name)
        ? "invalid_name"
        : method === "add" && present.has(input.name)
          ? "already_reacted"
          : method === "remove" && !present.has(input.name)
            ? "no_reaction"
            : undefined;
      if (code)
        throw Object.assign(new Error(code), {
          code: "slack_webapi_platform_error",
          data: { error: code },
        });
      if (method === "add") present.add(input.name);
      else present.delete(input.name);
    };
  }
  return present;
}

test("falls back independently for missing working and done emojis in each workspace", async () => {
  for (const customEmojis of [
    [],
    ["halo-looking-into-it"],
    ["halo-done-sitting-check"],
  ]) {
    const f = fixture();
    const present = workspaceReactions(f, customEmojis);
    const working = customEmojis.includes("halo-looking-into-it")
      ? "halo-looking-into-it"
      : "eyes";
    const done = customEmojis.includes("halo-done-sitting-check")
      ? "halo-done-sitting-check"
      : "white_check_mark";
    let whileRunning;
    f.langfuse.get = async () => {
      whileRunning = [...present];
      return { status: "SUCCEEDED", text: "Answer" };
    };
    await f.message("root", "Find errors");
    await f.choose("root");
    assert.deepEqual(whileRunning, [working]);
    assert.deepEqual([...present], [done]);
    assert.equal(f.calls.replies.at(-1).text, "Answer");
    assert.deepEqual(f.calls.errors, []);
  }
});

test("cleans up fallback eyes after restart even if custom emojis have since been installed", async () => {
  const f = fixture({ get: async () => ({ status: "CANCELLED" }) });
  const present = workspaceReactions(f, [
    "halo-looking-into-it",
    "halo-done-sitting-check",
  ]);
  present.add("eyes");
  const threadKey = "TDEMO:DDIRECT:123.001";
  f.state.threads[threadKey] = {
    slackUserId: "UOWNER",
    linkId: "link-one",
    projectId: "project-one",
    conversationId: "existing-conversation",
  };
  f.state.events.recovery = {
    eventId: "recovery",
    teamId: "TDEMO",
    threadKey,
    channel: "DDIRECT",
    threadTs: "123.001",
    messageTs: "123.002",
    slackUserId: "UOWNER",
    linkId: "link-one",
    projectId: "project-one",
    runId: "existing-run",
    phase: "running",
    done: false,
  };
  await f.restart().resume();
  assert.deepEqual([...present], []);
  assert.equal(f.calls.starts.length, 0);
  assert.equal(f.calls.replies.at(-1).text, "Stopped.");
  assert.deepEqual(f.calls.errors, []);
});

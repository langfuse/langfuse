import { setTimeout as sleep } from "node:timers/promises";
import { createMessageReactions } from "./reactions.mjs";

export const PROJECT_ACTION = "langfuse_linked_project";
const PROJECT_BLOCK = "langfuse_project:";
const isDm = (channel) => /^D[A-Z0-9]+$/.test(channel ?? "");
const escapeSlack = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Each Slack thread belongs to one linked user and one project. */
export function createLinkedBridge({
  slack,
  langfuse,
  teamId,
  botUserId,
  channelId,
  baseUrl,
  publicUrl = baseUrl,
  state,
  save,
  wait = sleep,
  reportError = (error) =>
    console.error(
      "Linked agent request failed:",
      typeof error.code === "string" ? error.code : error.name,
    ),
}) {
  state.threads ??= {};
  state.events ??= {};
  state.preferences ??= {};
  const active = new Map();
  const reactions = createMessageReactions(slack, reportError);
  const isChannel = (channel) =>
    /^[CG][A-Z0-9]+$/.test(channel ?? "") &&
    (!channelId || channel === channelId);
  const allowed = (channel) => isDm(channel) || isChannel(channel);
  const keyFor = (channel, threadTs) => `${teamId}:${channel}:${threadTs}`;
  const identity = (record) => ({ teamId, slackUserId: record.slackUserId });
  const access = (record) => ({
    ...identity(record),
    linkId: record.linkId,
    projectId: record.projectId,
  });
  const post = (record, text, extra = {}) =>
    slack.chat.postMessage({
      channel: record.channel,
      thread_ts: record.threadTs,
      text,
      unfurl_links: false,
      unfurl_media: false,
      parse: "none",
      ...extra,
    });
  const status = (record, value) =>
    slack.apiCall("agents.sessions.setStatus", {
      channel_id: record.channel,
      thread_ts: record.threadTs,
      status: value,
    });
  const finish = async (record) => {
    delete record.message;
    record.done = true;
    record.finishedAt = Date.now();
    await save();
  };
  const connectNotice = async (record) => {
    const connection = await langfuse.connection(identity(record));
    const token = new URL(connection.linkUrl, baseUrl).searchParams.get(
      "token",
    );
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new Error("Invalid account connection link");
    const link = new URL("slack-agent", `${publicUrl.replace(/\/$/, "")}/`);
    link.searchParams.set("token", token);
    const text = `First, <${link}|connect your Langfuse account>. Sign in and confirm in your browser, then send your question again in this thread.`;
    if (isDm(record.channel)) return post(record, text);
    return slack.chat.postEphemeral({
      channel: record.channel,
      user: record.slackUserId,
      thread_ts:
        record.messageTs === record.threadTs ? undefined : record.threadTs,
      text,
      unfurl_links: false,
      unfurl_media: false,
      parse: "none",
    });
  };

  async function execute(record) {
    let succeeded = false;
    try {
      await status(record, "processing").catch(reportError);
      const thread = state.threads[record.threadKey];
      if (
        !thread ||
        thread.slackUserId !== record.slackUserId ||
        thread.linkId !== record.linkId ||
        thread.projectId !== record.projectId
      )
        throw new Error("Thread binding no longer matches");
      await reactions.start(record);
      if (!record.runId) {
        const run = await langfuse.start({
          ...access(record),
          message: record.message,
          conversationId: thread.conversationId,
          idempotencyKey: record.eventId,
        });
        record.runId = run.runId;
        thread.conversationId = run.conversationId;
        delete record.message;
        await save();
      }
      if (record.cancelRequested)
        await langfuse.cancel({ ...access(record), runId: record.runId });
      for (let attempt = 0; attempt < 480; attempt++) {
        const run = await langfuse.get({
          ...access(record),
          runId: record.runId,
        });
        if (run.status === "SUCCEEDED") {
          const text =
            (run.text || "The run completed without a text response.") +
            (run.errorCode
              ? "\n\nThis answer reached an execution limit and may be incomplete."
              : "");
          const formatted = escapeSlack(text)
            .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "<$2|$1>")
            .replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
          for (let offset = 0; offset < formatted.length; offset += 3500)
            await post(record, formatted.slice(offset, offset + 3500));
          succeeded = true;
          return;
        }
        if (run.status === "CANCELLED") {
          await post(record, "Stopped.");
          return;
        }
        if (run.status === "FAILED") {
          const error = new Error("Langfuse run failed");
          error.code = run.errorCode || "run_failed";
          throw error;
        }
        if (run.status === "AWAITING_APPROVAL") {
          await langfuse.cancel({ ...access(record), runId: record.runId });
          await post(
            record,
            "Slack currently supports read-only questions. Open Langfuse to make changes.",
          );
          return;
        }
        await wait(2000);
      }
      await langfuse.cancel({ ...access(record), runId: record.runId });
      await post(
        record,
        "This request took too long. I requested cancellation; please try a smaller question.",
      );
    } catch (error) {
      reportError(error);
      if (record.runId)
        await langfuse
          .cancel({ ...access(record), runId: record.runId })
          .catch(reportError);
      await post(
        record,
        "I couldn't finish that request. If your linked account or access changed, start a new thread.",
      ).catch(reportError);
    } finally {
      await reactions.finish(record, succeeded);
      await status(record, "active").catch(reportError);
      await finish(record);
    }
  }

  async function prepareQuestion(record) {
    const projects = await langfuse.projects(identity(record));
    if (!projects.linked || !projects.linkId) {
      await connectNotice(record);
      await finish(record);
      return;
    }
    const thread = state.threads[record.threadKey];
    if (thread?.linkId) {
      if (
        thread.slackUserId !== record.slackUserId ||
        thread.linkId !== projects.linkId
      ) {
        await post(
          record,
          "This thread belongs to a previous account connection. Start a new thread.",
        );
        await finish(record);
        return;
      }
      if (!thread.projectId) {
        await post(
          record,
          "Choose a project above to continue the first question.",
        );
        await finish(record);
        return;
      }
      if (
        !projects.projects.some((project) => project.id === thread.projectId)
      ) {
        await post(
          record,
          "You no longer have access to this thread's project. Start a new thread to choose another.",
        );
        await finish(record);
        return;
      }
      Object.assign(record, {
        linkId: thread.linkId,
        projectId: thread.projectId,
        phase: "running",
      });
      await save();
      await execute(record);
      return;
    }
    if (!projects.projects.length) {
      await post(
        record,
        "No projects with agent access are available for your linked account.",
      );
      await finish(record);
      return;
    }
    record.linkId = projects.linkId;
    record.phase = "selection";
    state.threads[record.threadKey] = {
      slackUserId: record.slackUserId,
      linkId: record.linkId,
    };
    await save();
    await offerProjects(record, projects);
  }

  async function offerProjects(record, projects) {
    const preferred = state.preferences[record.slackUserId];
    const previous =
      preferred?.linkId === record.linkId &&
      projects.projects.find((project) => project.id === preferred.projectId);
    const response = await post(
      record,
      "Choose a project for this thread. Your question is saved and will run after you choose.",
      {
        blocks: [
          {
            type: "section",
            block_id: `${PROJECT_BLOCK}${record.eventId}`,
            text: {
              type: "plain_text",
              text: "Choose a project for this thread. Your question is saved and will run after you choose.",
            },
            accessory: {
              type: "external_select",
              action_id: PROJECT_ACTION,
              min_query_length: 0,
              placeholder: {
                type: "plain_text",
                text: "Search projects by name or organization",
              },
            },
          },
          ...(previous && isDm(record.channel)
            ? [
                {
                  type: "context",
                  elements: [
                    {
                      type: "plain_text",
                      text: `Last used: ${previous.orgName} / ${previous.name}`.slice(
                        0,
                        2000,
                      ),
                    },
                  ],
                },
              ]
            : []),
        ],
      },
    );
    record.pickerTs = response.ts;
    await save();
  }

  function selectionRecord(body, blockId) {
    if (
      body.team?.id !== teamId ||
      !allowed(body.channel?.id) ||
      !blockId?.startsWith(PROJECT_BLOCK)
    )
      return;
    const record = state.events[blockId.slice(PROJECT_BLOCK.length)];
    if (
      !record ||
      record.done ||
      record.phase !== "selection" ||
      record.slackUserId !== body.user?.id ||
      record.channel !== body.channel.id ||
      (record.pickerTs &&
        record.pickerTs !== (body.container?.message_ts ?? body.message?.ts)) ||
      state.threads[record.threadKey]?.projectId
    )
      return;
    return record;
  }

  async function drain(threadKey) {
    if (active.has(threadKey)) return;
    let record;
    try {
      while (
        (record = Object.values(state.events).find(
          (event) => !event.done && event.threadKey === threadKey,
        ))
      ) {
        active.set(threadKey, record);
        if (record.phase === "selection") {
          if (!record.pickerTs) {
            const projects = await langfuse.projects(identity(record));
            if (projects.linked && projects.linkId === record.linkId) {
              await offerProjects(record, projects);
            } else {
              await post(
                record,
                "Your account connection changed. Start a new thread to choose a project.",
              );
              await finish(record);
              continue;
            }
          }
          return;
        }
        if (record.phase === "running") await execute(record);
        else await prepareQuestion(record);
        if (!record.done) return;
      }
    } catch (error) {
      reportError(error);
      if (record) {
        await post(
          record,
          "I couldn't process that request. Please try again.",
        ).catch(reportError);
        await finish(record);
      }
    } finally {
      active.delete(threadKey);
    }
    if (
      Object.values(state.events).some(
        (event) => !event.done && event.threadKey === threadKey,
      )
    )
      await drain(threadKey);
  }

  async function receive({ event, eventId, eventTeamId }, mention = false) {
    if (
      eventTeamId !== teamId ||
      !allowed(event.channel) ||
      (mention && !isChannel(event.channel)) ||
      (!mention && isDm(event.channel) && event.channel_type !== "im") ||
      event.bot_id ||
      event.subtype ||
      event.user === botUserId ||
      !event.user ||
      !event.ts ||
      !eventId ||
      state.events[eventId] ||
      Object.values(state.events).some(
        (record) =>
          record.channel === event.channel && record.messageTs === event.ts,
      )
    )
      return;
    const threadKey = keyFor(event.channel, event.thread_ts || event.ts);
    const thread = state.threads[threadKey];
    if (thread && thread.slackUserId !== event.user) return;
    if (!mention && !isDm(event.channel) && (!event.thread_ts || !thread))
      return;
    const message = (event.text || "").replaceAll(`<@${botUserId}>`, "").trim();
    if (!message) return;
    const record = {
      eventId,
      threadKey,
      teamId,
      channel: event.channel,
      threadTs: event.thread_ts || event.ts,
      messageTs: event.ts,
      slackUserId: event.user,
      done: false,
    };
    state.threads[threadKey] ??= { slackUserId: event.user };
    state.events[eventId] = record;
    // Connection codes never enter persistent state or model input.
    if (/^connect(?:\s|$)/i.test(message)) {
      await finish(record);
      if (!isDm(event.channel)) {
        await connectNotice(record);
        return;
      }
      const connection = message.match(/^connect\s+(\S+)$/i);
      if (!connection) {
        await post(
          record,
          "Send only connect followed by your one-time code, with no other text.",
        );
        return;
      }
      try {
        await langfuse.connect({ ...identity(record), code: connection[1] });
        await post(
          record,
          "Your Langfuse account is connected. Send a new question in this DM or mention me in a channel to choose a project.",
        );
      } catch (error) {
        reportError(error);
        await post(
          record,
          "I couldn't connect your account. Create a new connection code and try again.",
        );
      }
      return;
    }
    record.message = message;
    record.phase = "question";
    await save();
    await drain(threadKey);
  }

  return {
    mention: (input) => receive(input, true),
    message: (input) => receive(input),

    async options({ body }) {
      const record = selectionRecord(body, body.block_id);
      if (!record) return { options: [] };
      const result = await langfuse.projects(identity(record));
      if (!result.linked || result.linkId !== record.linkId)
        return { options: [] };
      const query = (body.value || "").toLowerCase();
      const previous = state.preferences[record.slackUserId];
      return {
        options: result.projects
          .filter((project) =>
            `${project.name} ${project.orgName}`.toLowerCase().includes(query),
          )
          .sort(
            (a, b) =>
              Number(b.id === previous?.projectId) -
              Number(a.id === previous?.projectId),
          )
          .slice(0, 100)
          .map((project) => ({
            text: {
              type: "plain_text",
              text: `${project.orgName} / ${project.name}`.slice(0, 75),
            },
            value: project.id,
          })),
      };
    },

    async chooseProject({ body, action }) {
      const record = selectionRecord(body, action.block_id);
      if (!record || active.has(record.threadKey)) return;
      active.set(record.threadKey, record);
      try {
        const result = await langfuse.projects(identity(record));
        if (!result.linked || result.linkId !== record.linkId) {
          await post(
            record,
            "Your account connection changed. Start a new thread to choose a project.",
          );
          await finish(record);
          return;
        }
        const project = result.projects.find(
          (item) => item.id === action.selected_option?.value,
        );
        if (!project) {
          await post(
            record,
            "That project is no longer available. Choose another project from the menu.",
          );
          return;
        }
        const thread = state.threads[record.threadKey];
        if (record.done || thread.projectId) return;
        thread.projectId = project.id;
        record.projectId = project.id;
        record.phase = "running";
        state.preferences[record.slackUserId] = {
          linkId: record.linkId,
          projectId: project.id,
        };
        await save();
        if (record.pickerTs) {
          await slack.chat
            .update({
              channel: record.channel,
              ts: record.pickerTs,
              text: `Project: ${escapeSlack(project.orgName)} / ${escapeSlack(project.name)}. This thread will stay on this project.`,
              blocks: [],
            })
            .catch(reportError);
        }
        await execute(record);
      } catch (error) {
        reportError(error);
        await post(
          record,
          "I couldn't select that project. Please try again.",
        ).catch(reportError);
      } finally {
        active.delete(record.threadKey);
        await drain(record.threadKey);
      }
    },

    async stop({ event, eventTeamId }) {
      if (eventTeamId !== teamId || !allowed(event.channel)) return;
      const record = active.get(keyFor(event.channel, event.thread_ts));
      if (
        !record ||
        record.phase !== "running" ||
        record.slackUserId !== event.user
      )
        return;
      record.cancelRequested = true;
      await save();
      if (record.runId)
        await langfuse.cancel({ ...access(record), runId: record.runId });
    },

    async resume() {
      const threads = new Set(
        Object.values(state.events)
          .filter(
            (record) =>
              !record.done &&
              record.teamId === teamId &&
              allowed(record.channel),
          )
          .map((record) => record.threadKey),
      );
      await Promise.all([...threads].map(drain));
    },
  };
}

export function createLinkedLangfuseClient({ baseUrl, serviceSecret }) {
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const local =
    base.hostname === "localhost" ||
    base.hostname.endsWith(".localhost") ||
    base.hostname === "127.0.0.1" ||
    base.hostname === "[::1]";
  if (
    (base.protocol !== "https:" && !(base.protocol === "http:" && local)) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error(
      "LANGFUSE_BASE_URL must use HTTPS, or HTTP on localhost, without credentials, query, or fragment.",
    );
  async function request(operation, body) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(new URL("api/slack-agent", base), {
          method: "POST",
          headers: {
            authorization: `Bearer ${serviceSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...body, operation }),
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          const error = new Error(
            `Langfuse API returned HTTP ${response.status}`,
          );
          error.code = `http_${response.status}`;
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }
        return await response.json();
      } catch (error) {
        if (
          attempt >= 2 ||
          operation === "projects" ||
          operation === "connect" ||
          operation === "connection" ||
          error.retryable === false
        )
          throw error;
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  return Object.fromEntries(
    ["connection", "connect", "projects", "start", "get", "cancel"].map(
      (operation) => [operation, (body) => request(operation, body)],
    ),
  );
}

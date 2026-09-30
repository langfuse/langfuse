import { setTimeout as sleep } from "node:timers/promises";

/** The adapter keeps Slack routing separate from Langfuse's agent execution. */
export function createBridge({
  slack,
  langfuse,
  teamId,
  channelId,
  state,
  save,
  wait = sleep,
  reportError = (error) =>
    console.error("Agent request failed:", error.code ?? error.name),
}) {
  const active = new Map();
  const threadKey = (channel, threadTs) => `${teamId}:${channel}:${threadTs}`;
  const setStatus = (record, status) =>
    slack.apiCall("agents.sessions.setStatus", {
      channel_id: record.channel,
      thread_ts: record.threadTs,
      status,
    });

  async function reply(record, text) {
    // Escape Slack mentions in model output, then render ordinary Markdown links.
    const formatted = text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "<$2|$1>")
      .replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
    for (let offset = 0; offset < formatted.length; offset += 3500) {
      await slack.chat.postMessage({
        channel: record.channel,
        thread_ts: record.threadTs,
        text: formatted.slice(offset, offset + 3500),
        unfurl_links: false,
        unfurl_media: false,
        parse: "none",
      });
    }
  }

  async function execute(record) {
    try {
      await setStatus(record, "processing");
      if (!record.runId) {
        const run = await langfuse.start({
          message: record.message,
          conversationId: state.threads[record.threadKey],
          idempotencyKey: record.eventId,
        });
        record.runId = run.runId;
        state.threads[record.threadKey] = run.conversationId;
        delete record.message;
        await save();
      }
      if (record.cancelRequested) await langfuse.cancel(record.runId);

      // Bound polling even if a worker or network fails to report completion.
      for (let attempt = 0; attempt < 480; attempt++) {
        const run = await langfuse.get(record.runId);
        if (run.status === "SUCCEEDED") {
          const limitNotice = run.errorCode
            ? "\n\nThis answer reached an execution limit and may be incomplete."
            : "";
          await reply(
            record,
            (run.text || "The run completed without a text response.") +
              limitNotice,
          );
          return;
        }
        if (run.status === "CANCELLED") {
          await reply(record, "Stopped.");
          return;
        }
        if (run.status === "FAILED") {
          const error = new Error("Langfuse run failed");
          error.code = run.errorCode || "run_failed";
          throw error;
        }
        if (run.status === "AWAITING_APPROVAL") {
          await langfuse.cancel(record.runId);
          await reply(
            record,
            "This demo only supports read-only requests. Please ask a question that does not change project data.",
          );
          return;
        }
        await wait(2000);
      }
      await langfuse.cancel(record.runId);
      await reply(
        record,
        "This request took too long, so I requested cancellation. Please try a smaller question.",
      );
    } catch (error) {
      reportError(error);
      if (record.runId) {
        await langfuse.cancel(record.runId).catch(reportError);
      }
      await reply(
        record,
        "I couldn't finish that request. Please try again.",
      ).catch(reportError);
    } finally {
      await setStatus(record, "active").catch(reportError);
      record.done = true;
      record.finishedAt = Date.now();
      try {
        await save();
      } finally {
        active.delete(record.threadKey);
      }
    }
  }

  function dispatch(record) {
    // Claim synchronously, before the first asynchronous status/API operation.
    active.set(record.threadKey, record);
    return execute(record);
  }

  return {
    async mention({ event, eventId, eventTeamId, botUserId }) {
      if (
        eventTeamId !== teamId ||
        event.channel !== channelId ||
        event.bot_id ||
        event.subtype ||
        !event.user ||
        !eventId
      )
        return;
      const message = (event.text || "")
        .replaceAll(`<@${botUserId}>`, "")
        .trim();
      if (!message) return;
      const key = threadKey(event.channel, event.thread_ts || event.ts);
      const existing = state.events[eventId];
      if (existing?.done) return;
      if (active.has(key)) {
        if (active.get(key).eventId !== eventId) {
          await slack.chat.postEphemeral({
            channel: event.channel,
            thread_ts: event.thread_ts || event.ts,
            user: event.user,
            text: "I'm still working on this thread. Please mention me again once the current answer is finished.",
          });
        }
        return;
      }
      if (existing) return dispatch(existing);

      const record = {
        eventId,
        threadKey: key,
        channel: event.channel,
        threadTs: event.thread_ts || event.ts,
        message,
        done: false,
      };
      state.events[eventId] = record;
      active.set(key, record);
      try {
        await save();
      } catch (error) {
        active.delete(key);
        delete state.events[eventId];
        throw error;
      }
      return execute(record);
    },

    async stop({ event, eventTeamId }) {
      if (eventTeamId !== teamId || event.channel !== channelId) return;
      const record = active.get(threadKey(event.channel, event.thread_ts));
      if (!record) return;
      record.cancelRequested = true;
      await save();
      if (record.runId) await langfuse.cancel(record.runId);
    },

    async resume() {
      await Promise.all(
        Object.values(state.events)
          .filter(
            (record) =>
              !record.done &&
              record.channel === channelId &&
              record.threadKey.startsWith(`${teamId}:`),
          )
          .map(dispatch),
      );
    },
  };
}

export function createLangfuseClient({ baseUrl, publicKey, secretKey }) {
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
  ) {
    throw new Error(
      "LANGFUSE_BASE_URL must use HTTPS, or HTTP on localhost, without credentials, query, or fragment.",
    );
  }
  const authorization = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;

  async function request(path, body) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(
          new URL(`api/public/agent/runs${path}`, base),
          {
            method: body === undefined ? "GET" : "POST",
            headers: { authorization, "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
          },
        );
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
        if (attempt >= 2 || error.retryable === false) throw error;
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  return {
    start: (body) => request("", body),
    get: (runId) => request(`/${encodeURIComponent(runId)}`),
    cancel: (runId) => request(`/${encodeURIComponent(runId)}/cancel`, {}),
  };
}

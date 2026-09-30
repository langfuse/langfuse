import { App, LogLevel } from "@slack/bolt";
import { readFile, writeFile, rename } from "node:fs/promises";
import { createBridge, createLangfuseClient } from "./bridge.mjs";
import { readConfig } from "./env.mjs";
import {
  createLinkedBridge,
  createLinkedLangfuseClient,
  PROJECT_ACTION,
} from "./linked-bridge.mjs";

const config = readConfig();
const stateFile =
  config.mode === "linked" ? "state.linked.local.json" : "state.local.json";
const statePath = new URL(`./${stateFile}`, import.meta.url);
let state = { threads: {}, events: {} };
try {
  state = JSON.parse(await readFile(statePath, "utf8"));
  if (!state.threads || !state.events)
    throw new Error("Invalid Slack demo state file.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

let pendingSave = Promise.resolve();
function save() {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [key, event] of Object.entries(state.events)) {
    if (event.done && event.finishedAt < cutoff) delete state.events[key];
  }
  const content = JSON.stringify(state);
  pendingSave = pendingSave
    .catch(() => {})
    .then(async () => {
      const temporary = new URL(
        `./${stateFile}.tmp.local.json`,
        import.meta.url,
      );
      await writeFile(temporary, content, { mode: 0o600 });
      await rename(temporary, statePath);
    });
  return pendingSave;
}

const app = new App({
  token: config.botToken,
  appToken: config.appToken,
  socketMode: true,
  logLevel: LogLevel.WARN,
});
const identity = await app.client.auth.test();
if (identity.team_id !== config.teamId)
  throw new Error("The Slack bot token belongs to a different workspace.");
const linked = config.mode === "linked";
const langfuse = linked
  ? createLinkedLangfuseClient(config)
  : createLangfuseClient(config);
const bridge = (linked ? createLinkedBridge : createBridge)({
  slack: app.client,
  langfuse,
  teamId: config.teamId,
  channelId: config.channelId,
  baseUrl: config.baseUrl,
  botUserId: identity.user_id,
  state,
  save,
});

app.event("app_mention", ({ event, body }) =>
  bridge.mention({
    event,
    eventId: body.event_id,
    eventTeamId: body.team_id,
    botUserId: identity.user_id,
  }),
);
app.event("agent_session_stopped", ({ event, body }) =>
  bridge.stop({
    event,
    eventTeamId: body.team_id,
  }),
);
if (linked) {
  app.event("message", ({ event, body }) =>
    bridge.message({
      event,
      eventId: body.event_id,
      eventTeamId: body.team_id,
    }),
  );
  app.action(PROJECT_ACTION, async ({ ack, body, action }) => {
    await ack();
    await bridge.chooseProject({ body, action });
  });
  app.options(PROJECT_ACTION, async ({ ack, body }) => {
    let deadline;
    const fallback = new Promise((resolve) => {
      deadline = setTimeout(() => resolve({ options: [] }), 2200);
    });
    try {
      await ack(await Promise.race([bridge.options({ body }), fallback]));
    } catch (error) {
      await ack({ options: [] });
      console.error("Unable to load projects:", error.code ?? error.name);
    } finally {
      clearTimeout(deadline);
    }
  });
}
app.error(async (error) => {
  console.error("Slack adapter error:", error.code ?? error.name);
});

await app.start();
console.log(
  `Slack agent connected. ${linked ? "Linked account mode: private DMs" : `Listening in ${config.channelId}`}; Langfuse at ${config.baseUrl}.`,
);
void bridge
  .resume()
  .catch((error) =>
    console.error("Unable to resume agent runs:", error.code ?? error.name),
  );
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await app.stop();
    await pendingSave;
    process.exit(0);
  });
}

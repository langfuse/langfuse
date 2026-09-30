import { App, LogLevel } from "@slack/bolt";
import { readFile, writeFile, rename } from "node:fs/promises";
import { createBridge, createLangfuseClient } from "./bridge.mjs";
import { readConfig } from "./env.mjs";

const config = readConfig();
const statePath = new URL("./state.local.json", import.meta.url);
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
      const temporary = new URL("./state.tmp.local.json", import.meta.url);
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
const langfuse = createLangfuseClient(config);
const bridge = createBridge({
  slack: app.client,
  langfuse,
  teamId: config.teamId,
  channelId: config.channelId,
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
app.error(async (error) => {
  console.error("Slack adapter error:", error.code ?? error.name);
});

await app.start();
console.log(
  `Slack agent connected. Listening in ${config.channelId}; Langfuse at ${config.baseUrl}.`,
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

const WORKING = "halo-looking-into-it";
const DONE = "halo-done-sitting-check";
const WORKING_FALLBACK = "eyes";
const DONE_FALLBACK = "white_check_mark";

/** Reactions are best-effort feedback on the user's original question. */
export function createMessageReactions(slack, reportError) {
  async function update(method, record, name, fallback) {
    // Older saved runs may only identify the thread, not the triggering message.
    if (!record.messageTs) return;
    try {
      await slack.reactions[method]({
        channel: record.channel,
        timestamp: record.messageTs,
        name,
      });
    } catch (error) {
      const code = error.data?.error ?? error.code;
      if (code === "invalid_name" && fallback) {
        await update(method, record, fallback);
      } else if (
        code !== "already_reacted" &&
        code !== "no_reaction" &&
        !(method === "remove" && code === "invalid_name")
      ) {
        reportError(error);
      }
    }
  }

  return {
    start: (record) => update("add", record, WORKING, WORKING_FALLBACK),
    async finish(record, succeeded) {
      // Emoji availability can change while a run is pending or across restarts.
      await update("remove", record, WORKING);
      await update("remove", record, WORKING_FALLBACK);
      if (succeeded) await update("add", record, DONE, DONE_FALLBACK);
    },
  };
}

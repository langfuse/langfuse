const translation = {
  pages: {
    title: "Users",
    description: "Attribute data in Langfuse to a user by adding a userId to your traces. See docs to learn more.",
  },
  filters: {
    timestamp: "Timestamp",
  },
  tabs: {
    traces: "Traces",
    sessions: "Sessions",
    scores: "Scores",
  },
  noTraces: "No traces yet",
  table: {
    userId: "User ID",
    userIdDescription: "The unique identifier for the user that was logged in Langfuse. See docs for more details on how to set this up.",
    firstEvent: "First Event",
    firstEventDescription: "The earliest trace recorded for this user.",
    lastEvent: "Last Event",
    lastEventDescription: "The latest trace recorded for this user.",
    totalEvents: "Total Events",
    totalEventsDescription: "Total number of events for the user, includes traces and observations. See data model for more details.",
    totalTokens: "Total Tokens",
    totalTokensDescription: "Total number of tokens used for the user across all generations.",
    totalCost: "Total Cost",
    totalCostDescription: "Total cost for the user across all generations.",
    noEventYet: "No event yet",
  },
};

export default translation;

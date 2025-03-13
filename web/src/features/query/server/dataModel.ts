// The data model defines all available dimensions, measures, and the timeDimension for a given view.

export const traceView = {
  name: "traces",
  dimensions: {
    id: {
      sql: "id",
      type: "number",
    },
    name: {
      sql: "name",
      type: "string",
    },
    userId: {
      sql: "user_id",
      type: "string",
    },
    sessionId: {
      sql: "session_id",
      type: "string",
    },
    release: {
      sql: "release",
      type: "string",
    },
    version: {
      sql: "version",
      type: "string",
    },
    environment: {
      sql: "environment",
      type: "string",
    },
    public: {
      sql: "public",
      type: "bool",
    },
    bookmarked: {
      sql: "bookmarked",
      type: "bool",
    },
  },
  measures: {
    count: {
      sql: "count",
      type: "count",
      function: "count",
    },
    observationsCount: {
      sql: "observations_count",
      type: "count",
      relationTable: "observations",
      relationColumn: "id",
      function: "uniq",
    },
  },
  timeDimension: {
    sql: "timestamp",
    type: "Date",
  },
  baseCte: `
     select *
     from traces
  `,
};

import { type z } from "zod";
import {
  type views,
  type ViewDeclarationType,
} from "@/src/features/query/server/types";

// The data model defines all available dimensions, measures, and the timeDimension for a given view.

export const traceView: ViewDeclarationType = {
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
      sql: "count(*)",
      alias: "count",
      type: "count",
    },
    observationsCount: {
      sql: "uniq(observations.id)",
      alias: "observations_count",
      type: "count",
      relationTable: "observations",
    },
    scoresCount: {
      sql: "uniq(scores.id)",
      alias: "scores_count",
      type: "count",
      relationTable: "scores",
    },
  },
  tableRelations: {
    observations: {
      name: "observations",
      joinCondition:
        "ON traces.id = observations.trace_id AND traces.project_id = observations.project_id",
      timeDimension: "start_time",
    },
    scores: {
      name: "scores",
      joinCondition:
        "ON traces.id = scores.trace_id AND traces.project_id = scores.project_id",
      timeDimension: "timestamp",
    },
  },
  timeDimension: "timestamp",
  baseCte: `traces`,
};

export const observationsView: ViewDeclarationType = {
  name: "observations",
  dimensions: {},
  measures: {},
  tableRelations: {},
  timeDimension: "start_time",
  baseCte: `observations`,
};

export const viewDeclarations: Record<
  z.infer<typeof views>,
  ViewDeclarationType
> = {
  traces: traceView,
  observations: observationsView,
};

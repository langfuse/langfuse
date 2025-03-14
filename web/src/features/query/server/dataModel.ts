// The data model defines all available dimensions, measures, and the timeDimension for a given view.

import { z } from "zod";
import {
  views,
  type ViewDeclarationType,
} from "@/src/features/query/server/types";

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
  },
  tableRelations: {
    observations:
      "LEFT JOIN observations ON traces.id = observations.trace_id AND traces.project_id = observations.project_id",
  },
  timeDimension: {
    sql: "timestamp",
    type: "Date",
  },
  baseCte: `traces`,
};

export const viewDeclarations: Record<
  z.infer<typeof views>,
  ViewDeclarationType
> = {
  traces: traceView,
};

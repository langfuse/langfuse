/** parityStat counts one authorization decision. */
const parityStat = "langfuse.authz.parity";

/** coverageStat counts one request against its operation. */
const coverageStat = "langfuse.authz.coverage";

/** groupBy is the dimension set every parity widget rolls up by. */
const groupBy = ["seam", "action", "legacy_code", "new_code"] as const;

/** gateScope selects the two parity results a human reads to certify a region. */
const gateScope = "result:new_denies OR result:new_allows";

/** regions is every Datadog site the dashboard ships to. */
export const regions = {
  eu: { label: "EU", site: "datadoghq.eu" },
  us: { label: "US", site: "datadoghq.com" },
} as const satisfies Record<string, RegionMeta>;

/** buildParityDashboard renders the shadow-mode ship-gate dashboard for one Datadog region. */
export function buildParityDashboard(region: Region): DatadogDashboard {
  const meta = regions[region];
  return {
    title: `Authz Parity + Coverage — ${meta.label}`,
    description:
      "Shadow-mode ship gate for granular API permissions. Read by a human, never automated: a region flips to enforce only when the gate is empty bar recognized rows.",
    layout_type: "ordered",
    reflow_type: "auto",
    widgets: [
      gateNote(meta),
      gateWidget(),
      newAllowsWidget(),
      newDeniesWidget(),
      coverageWidget(),
    ],
  };
}

/** gateNote states that the dashboard automates nothing. */
function gateNote(meta: RegionMeta): Widget {
  return {
    definition: {
      type: "note",
      content: `${meta.label} (${meta.site}) — this dashboard gates nothing automatically. Enforce and remove stay deliberate human decisions: flip a region only after the gate below is empty bar recognized rows (e.g. resolution shifts legacy_code:403, new_code:400).`,
      background_color: "yellow",
      font_size: "14",
      text_align: "left",
      vertical_align: "top",
      show_tick: false,
    },
  };
}

/** gateWidget is the ship-gate table: new_denies and new_allows grouped by seam/action/legacy_code/new_code. */
function gateWidget(): Widget {
  return {
    definition: {
      type: "query_table",
      title: "Ship gate — must be empty bar recognized rows",
      requests: [scalarRequest(parityQuery(gateScope))],
    },
  };
}

/** newAllowsWidget is the standout security-hole signal: the new path permits what legacy blocks. */
function newAllowsWidget(): Widget {
  return {
    definition: {
      type: "timeseries",
      title: "new_allows — SECURITY HOLE (new path permits what legacy blocks)",
      requests: [barRequest(parityQuery("result:new_allows"), "red")],
      markers: [{ value: "y = 0", display_type: "error dashed" }],
    },
  };
}

/** newDeniesWidget is the breakage signal: the new path blocks what legacy permits. */
function newDeniesWidget(): Widget {
  return {
    definition: {
      type: "timeseries",
      title: "new_denies — breakage (new path blocks what legacy permits)",
      requests: [barRequest(parityQuery("result:new_denies"), "orange")],
    },
  };
}

/** coverageWidget counts traffic per operation so a genuine parity zero is distinguishable from an untested route. */
function coverageWidget(): Widget {
  return {
    definition: {
      type: "query_table",
      title: "Coverage per operation — zero here means no traffic, not parity",
      requests: [scalarRequest(`sum:${coverageStat}{*} by {operation}`)],
    },
  };
}

/** parityQuery sums the parity counter under a result scope, grouped by every gate dimension. */
function parityQuery(scope: string): string {
  return `sum:${parityStat}{${scope}} by {${groupBy.join(",")}}`;
}

/** scalarRequest builds a summed scalar table request for one query. */
function scalarRequest(query: string): Request {
  return {
    response_format: "scalar",
    queries: [{ name: "a", data_source: "metrics", query, aggregator: "sum" }],
    formulas: [{ formula: "a" }],
  };
}

/** barRequest builds a summed bar-graph timeseries request tinted by palette. */
function barRequest(query: string, palette: string): Request {
  return {
    response_format: "timeseries",
    display_type: "bars",
    style: { palette },
    queries: [{ name: "a", data_source: "metrics", query, aggregator: "sum" }],
    formulas: [{ formula: "a" }],
  };
}

/** Region is a Datadog site key the dashboard ships to. */
export type Region = keyof typeof regions;

/** RegionMeta is a region's display label and Datadog site host. */
export type RegionMeta = { label: string; site: string };

/** DatadogDashboard is the subset of Datadog's dashboard schema this builder emits. */
export type DatadogDashboard = {
  title: string;
  description: string;
  layout_type: "ordered";
  reflow_type: "auto";
  widgets: Widget[];
};

/** Widget wraps one Datadog widget definition. */
export type Widget = { definition: WidgetDefinition };

/** WidgetDefinition is a note, query_table, or timeseries widget body. */
export type WidgetDefinition =
  | {
      type: "note";
      content: string;
      background_color: string;
      font_size: string;
      text_align: string;
      vertical_align: string;
      show_tick: boolean;
    }
  | { type: "query_table"; title: string; requests: Request[] }
  | {
      type: "timeseries";
      title: string;
      requests: Request[];
      markers?: { value: string; display_type: string }[];
    };

/** Request is one widget data request over the metrics data source. */
export type Request = {
  response_format: "scalar" | "timeseries";
  display_type?: "bars";
  style?: { palette: string };
  queries: {
    name: string;
    data_source: "metrics";
    query: string;
    aggregator: "sum";
  }[];
  formulas: { formula: string }[];
};

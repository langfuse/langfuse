export const INSTANCE_HEALTH_TIME_RANGES = ["now", "1h", "6h", "24h"] as const;

export type InstanceHealthTimeRange =
  (typeof INSTANCE_HEALTH_TIME_RANGES)[number];

export type DiagnosticStatus = "ok" | "warning" | "error" | "unavailable";

export type DiagnosticArea =
  | "web"
  | "postgres"
  | "redis"
  | "queues"
  | "worker"
  | "clickhouse"
  | "capacity";

export type DiagnosticDetail = {
  label: string;
  value: string;
  status?: DiagnosticStatus;
};

export type InstanceHealthFinding = {
  id: string;
  area: DiagnosticArea;
  status: DiagnosticStatus;
  title: string;
  evidence: string;
  nextAction: string;
};

export type InstanceHealthTopologyNode = {
  id: string;
  area: DiagnosticArea;
  label: string;
  status: DiagnosticStatus;
  summary: string;
};

export type InstanceHealthTopologyEdge = {
  from: string;
  to: string;
  status: DiagnosticStatus;
};

export type InstanceHealthRunbookStep = {
  id: string;
  order: number;
  area: DiagnosticArea;
  status: DiagnosticStatus;
  title: string;
  signal: string;
  expected: string;
  lastChecked: string;
  details?: DiagnosticDetail[];
};

export type InstanceHealthLedgerRow = {
  id: string;
  area: DiagnosticArea;
  status: DiagnosticStatus;
  signal: string;
  currentValue: string;
  expected: string;
  lastChecked: string;
  details?: DiagnosticDetail[];
};

export type InstanceHealthMetricPoint = {
  timestamp: string;
  value: number | null;
};

export type InstanceHealthMetricSeries = {
  id: string;
  node: string;
  label: string;
  unit: "bytes" | "ratio" | "count";
  points: InstanceHealthMetricPoint[];
};

export type InstanceHealthClickHouseMetricPanel = {
  id: "memory" | "cpu" | "disk";
  title: string;
  status: DiagnosticStatus;
  current: DiagnosticDetail[];
  history: {
    range: InstanceHealthTimeRange;
    series: InstanceHealthMetricSeries[];
    emptyState?: string;
  };
};

export type InstanceHealthClickHouseTableSize = {
  node: string;
  database: string;
  table: string;
  engine: string;
  rows: string;
  bytes: string;
  parts: string;
  status: DiagnosticStatus;
};

export type InstanceHealthClickHousePanels = {
  summary: DiagnosticDetail[];
  metrics: InstanceHealthClickHouseMetricPanel[];
  tables: {
    status: DiagnosticStatus;
    rows: InstanceHealthClickHouseTableSize[];
    emptyState?: string;
  };
};

export type InstanceHealthUnavailableDiagnostic = {
  id: string;
  area: DiagnosticArea;
  reason: string;
};

export type InstanceHealthResponse = {
  overallStatus: DiagnosticStatus;
  generatedAt: string;
  findings: InstanceHealthFinding[];
  topologyNodes: InstanceHealthTopologyNode[];
  topologyEdges: InstanceHealthTopologyEdge[];
  runbookSteps: InstanceHealthRunbookStep[];
  ledgerRows: InstanceHealthLedgerRow[];
  clickhousePanels: InstanceHealthClickHousePanels;
  unavailableDiagnostics: InstanceHealthUnavailableDiagnostic[];
};

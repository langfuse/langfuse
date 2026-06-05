export type LangGraphAssistant = {
  assistant_id: string;
  graph_id: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type LangGraphGraphNode = {
  id: string;
  name?: string;
  type?: string;
  data?: Record<string, unknown>;
};

export type LangGraphGraphEdge = {
  source: string;
  target: string;
  data?: string;
  conditional?: boolean;
};

export type LangGraphGraphDef = {
  nodes: LangGraphGraphNode[];
  edges: LangGraphGraphEdge[];
};

export type LangGraphThread = {
  thread_id: string;
  status: "idle" | "busy" | "interrupted" | "error";
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
};

export type NodeEvent = {
  id: string;
  nodeName: string;
  subgraphNs?: string; // set for inner subgraph events: "subgraph_name:instance-uuid"
  type: "updates" | "metadata" | "end" | "error" | "values";
  data: unknown;
  durationMs?: number;
  receivedAt: number;
  status: "running" | "success" | "error";
};

export type StreamState =
  | { status: "idle" }
  | { status: "running"; events: NodeEvent[]; runId: string | null }
  | { status: "done"; events: NodeEvent[]; runId: string | null }
  | {
      status: "error";
      events: NodeEvent[];
      error: string;
      runId: string | null;
    };

export type ChainStep = {
  assistantId: string;
  assistantName: string;
  fieldMappings: { fromPath: string; toField: string }[];
};

export type AgentStudioServerRecord = {
  id: string;
  name: string;
  serverUrl: string;
  projectId: string;
  headerNames: string[]; // names only — values are never sent to the client
  createdAt: Date;
  updatedAt: Date;
  chains: AgentStudioChainRecord[];
};

export type AgentStudioChainRecord = {
  id: string;
  name: string;
  steps: ChainStep[];
  serverId: string;
  createdAt: Date;
  updatedAt: Date;
};

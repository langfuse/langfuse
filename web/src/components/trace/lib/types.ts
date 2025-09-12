import { type ObservationType } from "@langfuse/shared";

// Unified tree node type for trace tree component
export type TreeNode = {
  id: string;
  type: "TRACE" | ObservationType;
  name: string;
  startTime: Date;
  endTime?: Date | null;
  level?: string;
  children: TreeNode[];
  // Common properties
  inputUsage?: number | null;
  outputUsage?: number | null;
  totalUsage?: number | null;
  calculatedInputCost?: any;
  calculatedOutputCost?: any;
  calculatedTotalCost?: any;
  // Trace-specific properties (when type === 'TRACE')
  latency?: number;
  // Observation-specific properties (when type !== 'TRACE')
  parentObservationId?: string | null;
  traceId?: string;
};

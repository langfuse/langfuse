import { type ObservationType } from "@langfuse/shared";
import type Decimal from "decimal.js";

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
  // Pre-computed cost for this node + all descendants
  // Calculated bottom-up during tree construction for O(1) access
  // Will be undefined if neither this node nor any descendants have cost data
  totalCost?: Decimal;
  // Trace-specific properties (when type === 'TRACE')
  latency?: number;
  // Observation-specific properties (when type !== 'TRACE')
  parentObservationId?: string | null;
  traceId?: string;
};

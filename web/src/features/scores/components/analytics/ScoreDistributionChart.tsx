import { ScoreDistributionNumericChart } from "./ScoreDistributionNumericChart";
import { ScoreDistributionCategoricalChart } from "./ScoreDistributionCategoricalChart";

export interface ScoreDistributionChartProps {
  distribution1: Array<{ binIndex: number; count: number }>;
  distribution2?: Array<{ binIndex: number; count: number }>;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  score1Name: string;
  score2Name?: string;
  // For numeric scores, provide bin labels
  binLabels?: string[];
  // For categorical scores, provide category names
  categories?: string[];
  // For categorical comparison, provide stacked distribution data
  stackedDistribution?: Array<{
    score1Category: string;
    score2Stack: string;
    count: number;
  }>;
  score2Categories?: string[];
}

/**
 * Orchestrator component for score distribution charts
 * Routes to specialized components based on data type:
 * - Numeric: ScoreDistributionNumericChart (grouped bars for comparison)
 * - Categorical/Boolean: ScoreDistributionCategoricalChart (stacked bars for comparison)
 */
export function ScoreDistributionChart({
  distribution1,
  distribution2,
  dataType,
  score1Name,
  score2Name,
  binLabels,
  categories,
  stackedDistribution,
  score2Categories,
}: ScoreDistributionChartProps) {
  // Empty state check
  if (distribution1.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No distribution data available
      </div>
    );
  }

  // Route to appropriate chart component
  if (dataType === "NUMERIC") {
    if (!binLabels || binLabels.length === 0) {
      return (
        <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
          No bin labels available for numeric distribution
        </div>
      );
    }

    return (
      <ScoreDistributionNumericChart
        distribution1={distribution1}
        distribution2={distribution2}
        binLabels={binLabels}
        score1Name={score1Name}
        score2Name={score2Name}
      />
    );
  }

  // Categorical or Boolean
  if (!categories || categories.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No categories available for categorical distribution
      </div>
    );
  }

  return (
    <ScoreDistributionCategoricalChart
      distribution1={distribution1}
      distribution2={distribution2}
      categories={categories}
      score1Name={score1Name}
      score2Name={score2Name}
      stackedDistribution={stackedDistribution}
      score2Categories={score2Categories}
    />
  );
}

/**
 * Statistical calculation utilities for score comparison analytics
 * Provides functions for calculating Cohen's Kappa, F1 Score, Overall Agreement,
 * and interpretation functions for various statistical metrics.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface ConfusionMatrixRow {
  rowCategory: string;
  colCategory: string;
  count: number;
}

export interface InterpretationResult {
  strength: string;
  color: string;
  description: string;
}

export type InterpretationMessageKey =
  | "strength.notAvailable"
  | "strength.veryStrong"
  | "strength.strong"
  | "strength.moderate"
  | "strength.weak"
  | "strength.veryWeak"
  | "strength.perfect"
  | "strength.almostPerfect"
  | "strength.substantial"
  | "strength.fair"
  | "strength.slight"
  | "strength.poor"
  | "strength.excellent"
  | "strength.good"
  | "strength.veryPoor"
  | "direction.positive"
  | "direction.negative"
  | "direction.none"
  | "error.veryLow"
  | "error.low"
  | "error.moderate"
  | "error.high"
  | "error.veryHigh"
  | "noData"
  | "linearCorrelation"
  | "veryWeakLinearCorrelation"
  | "monotonicRelationship"
  | "veryWeakMonotonicRelationship"
  | "agreementBetweenScores"
  | "poorAgreement"
  | "classificationPerformance"
  | "predictionsMatch"
  | "relativeError"
  | "averageError"
  | "rootMeanSquaredError";

type InterpretationMessageValues = Record<string, string | number>;

export type InterpretationTranslator = (
  key: InterpretationMessageKey,
  values?: InterpretationMessageValues,
) => string;

const defaultInterpretationTranslator: InterpretationTranslator = (
  key,
  values = {},
) => {
  const messages: Record<
    InterpretationMessageKey,
    (messageValues: InterpretationMessageValues) => string
  > = {
    "strength.notAvailable": () => "N/A",
    "strength.veryStrong": () => "Very Strong",
    "strength.strong": () => "Strong",
    "strength.moderate": () => "Moderate",
    "strength.weak": () => "Weak",
    "strength.veryWeak": () => "Very Weak",
    "strength.perfect": () => "Perfect",
    "strength.almostPerfect": () => "Almost Perfect",
    "strength.substantial": () => "Substantial",
    "strength.fair": () => "Fair",
    "strength.slight": () => "Slight",
    "strength.poor": () => "Poor",
    "strength.excellent": () => "Excellent",
    "strength.good": () => "Good",
    "strength.veryPoor": () => "Very Poor",
    "direction.positive": () => "positive",
    "direction.negative": () => "negative",
    "direction.none": () => "no",
    "error.veryLow": () => "Very low",
    "error.low": () => "Low",
    "error.moderate": () => "Moderate",
    "error.high": () => "High",
    "error.veryHigh": () => "Very high",
    noData: () => "No data available",
    linearCorrelation: ({ strength, direction }) =>
      `${strength} ${direction} linear correlation`,
    veryWeakLinearCorrelation: () => "Very weak or no linear correlation",
    monotonicRelationship: ({ strength, direction }) =>
      `${strength} ${direction} monotonic relationship`,
    veryWeakMonotonicRelationship: () =>
      "Very weak or no monotonic relationship",
    agreementBetweenScores: ({ strength }) =>
      `${strength} agreement between scores`,
    poorAgreement: () => "Poor agreement (worse than chance)",
    classificationPerformance: ({ strength }) =>
      `${strength} classification performance`,
    predictionsMatch: ({ percentage }) => `${percentage}% of predictions match`,
    relativeError: ({ severity, percentage }) =>
      `${severity} error (${percentage}% of range)`,
    averageError: ({ value }) => `Average error: ${value}`,
    rootMeanSquaredError: ({ value }) => `Root mean squared error: ${value}`,
  };

  return messages[key](values);
};

function interpretationResult(
  strengthKey: InterpretationMessageKey,
  color: string,
  descriptionKey: InterpretationMessageKey,
  translate: InterpretationTranslator,
  values?: InterpretationMessageValues,
): InterpretationResult {
  return {
    strength: translate(strengthKey),
    color,
    description: translate(descriptionKey, values),
  };
}

// ============================================================================
// Categorical Statistics Calculations
// ============================================================================

/**
 * Calculate Cohen's Kappa for inter-rater agreement
 * Cohen's Kappa measures agreement between two raters while accounting for
 * chance agreement. Range: [-1, 1] where 1 = perfect agreement.
 *
 * Formula: κ = (Po - Pe) / (1 - Pe)
 * Where Po = observed agreement, Pe = expected agreement by chance
 *
 * @param confusionMatrix - Array of confusion matrix cells
 * @returns Cohen's Kappa coefficient or null if calculation not possible
 */
export function calculateCohensKappa(
  confusionMatrix: ConfusionMatrixRow[],
): number | null {
  if (!confusionMatrix || confusionMatrix.length === 0) {
    return null;
  }

  // Calculate total count
  const total = confusionMatrix.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) {
    return null;
  }

  // Build set of all categories
  const categories = Array.from(
    new Set([
      ...confusionMatrix.map((r) => r.rowCategory),
      ...confusionMatrix.map((r) => r.colCategory),
    ]),
  ).sort();

  // Calculate observed agreement (Po)
  const observedAgreement =
    confusionMatrix
      .filter((r) => r.rowCategory === r.colCategory)
      .reduce((sum, r) => sum + r.count, 0) / total;

  // Calculate marginal totals for expected agreement
  const score1Totals: Record<string, number> = {};
  const score2Totals: Record<string, number> = {};

  confusionMatrix.forEach((r) => {
    score1Totals[r.rowCategory] = (score1Totals[r.rowCategory] || 0) + r.count;
    score2Totals[r.colCategory] = (score2Totals[r.colCategory] || 0) + r.count;
  });

  // Calculate expected agreement (Pe)
  const expectedAgreement = categories.reduce((sum, cat) => {
    const p1 = (score1Totals[cat] || 0) / total;
    const p2 = (score2Totals[cat] || 0) / total;
    return sum + p1 * p2;
  }, 0);

  // Calculate Kappa
  const denominator = 1 - expectedAgreement;
  if (Math.abs(denominator) < 1e-10) {
    // Perfect expected agreement - return 1 if observed is also perfect
    return observedAgreement === 1 ? 1 : null;
  }

  const kappa = (observedAgreement - expectedAgreement) / denominator;

  // Round to 3 decimal places
  return Math.round(kappa * 1000) / 1000;
}

/**
 * Calculate weighted F1 score for multi-class classification
 * F1 is the harmonic mean of precision and recall, weighted by support.
 * Range: [0, 1] where 1 = perfect classification.
 *
 * @param confusionMatrix - Array of confusion matrix cells
 * @returns Weighted F1 score or null if calculation not possible
 */
export function calculateWeightedF1Score(
  confusionMatrix: ConfusionMatrixRow[],
): number | null {
  if (!confusionMatrix || confusionMatrix.length === 0) {
    return null;
  }

  const total = confusionMatrix.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) {
    return null;
  }

  // Get all unique categories
  const categories = Array.from(
    new Set(confusionMatrix.flatMap((r) => [r.rowCategory, r.colCategory])),
  ).sort();

  // Calculate F1 score for each category
  const f1Scores = categories.map((cat) => {
    // True Positives: both scores match this category
    const tp =
      confusionMatrix.find(
        (r) => r.rowCategory === cat && r.colCategory === cat,
      )?.count || 0;

    // False Positives: score2 is this category but score1 is not
    const fp = confusionMatrix
      .filter((r) => r.colCategory === cat && r.rowCategory !== cat)
      .reduce((sum, r) => sum + r.count, 0);

    // False Negatives: score1 is this category but score2 is not
    const fn = confusionMatrix
      .filter((r) => r.rowCategory === cat && r.colCategory !== cat)
      .reduce((sum, r) => sum + r.count, 0);

    // Calculate precision and recall
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;

    // Calculate F1 score
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    // Support is the number of actual instances of this category
    const support = tp + fn;

    return { f1, support };
  });

  // Calculate weighted average F1 score
  const weightedF1 =
    f1Scores.reduce((sum, { f1, support }) => sum + f1 * support, 0) / total;

  // Round to 3 decimal places
  return Math.round(weightedF1 * 1000) / 1000;
}

/**
 * Calculate overall agreement (simple accuracy)
 * This is the percentage of cases where both scores agree.
 * Range: [0, 1] where 1 = 100% agreement.
 *
 * @param confusionMatrix - Array of confusion matrix cells
 * @returns Overall agreement percentage or null if calculation not possible
 */
export function calculateOverallAgreement(
  confusionMatrix: ConfusionMatrixRow[],
): number | null {
  if (!confusionMatrix || confusionMatrix.length === 0) {
    return null;
  }

  const total = confusionMatrix.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) {
    return null;
  }

  // Sum diagonal (matching categories)
  const matching = confusionMatrix
    .filter((r) => r.rowCategory === r.colCategory)
    .reduce((sum, r) => sum + r.count, 0);

  const agreement = matching / total;

  // Round to 3 decimal places
  return Math.round(agreement * 1000) / 1000;
}

// ============================================================================
// Interpretation Functions
// ============================================================================

/**
 * Interpret Pearson correlation coefficient
 * Reference: Cohen, J. (1988). Statistical power analysis for the behavioral sciences.
 *
 * @param r - Pearson correlation coefficient
 * @returns Interpretation with strength, color, and description
 */
export function interpretPearsonCorrelation(
  r: number | null,
  translate: InterpretationTranslator = defaultInterpretationTranslator,
): InterpretationResult {
  if (r === null) {
    return interpretationResult(
      "strength.notAvailable",
      "gray",
      "noData",
      translate,
    );
  }

  const abs = Math.abs(r);
  const direction = translate(
    r > 0
      ? "direction.positive"
      : r < 0
        ? "direction.negative"
        : "direction.none",
  );

  if (abs >= 0.9) {
    return interpretationResult(
      "strength.veryStrong",
      "green",
      "linearCorrelation",
      translate,
      { strength: translate("strength.veryStrong"), direction },
    );
  }
  if (abs >= 0.7) {
    return interpretationResult(
      "strength.strong",
      "blue",
      "linearCorrelation",
      translate,
      { strength: translate("strength.strong"), direction },
    );
  }
  if (abs >= 0.5) {
    return interpretationResult(
      "strength.moderate",
      "yellow",
      "linearCorrelation",
      translate,
      { strength: translate("strength.moderate"), direction },
    );
  }
  if (abs >= 0.3) {
    return interpretationResult(
      "strength.weak",
      "orange",
      "linearCorrelation",
      translate,
      { strength: translate("strength.weak"), direction },
    );
  }
  return interpretationResult(
    "strength.veryWeak",
    "red",
    "veryWeakLinearCorrelation",
    translate,
  );
}

/**
 * Interpret Spearman rank correlation coefficient
 * Similar interpretation to Pearson but for monotonic relationships
 *
 * @param rho - Spearman's rho coefficient
 * @returns Interpretation with strength, color, and description
 */
export function interpretSpearmanCorrelation(
  rho: number | null,
  translate: InterpretationTranslator = defaultInterpretationTranslator,
): InterpretationResult {
  if (rho === null) {
    return interpretationResult(
      "strength.notAvailable",
      "gray",
      "noData",
      translate,
    );
  }

  const abs = Math.abs(rho);
  const direction = translate(
    rho > 0
      ? "direction.positive"
      : rho < 0
        ? "direction.negative"
        : "direction.none",
  );

  if (abs >= 0.9) {
    return interpretationResult(
      "strength.veryStrong",
      "green",
      "monotonicRelationship",
      translate,
      { strength: translate("strength.veryStrong"), direction },
    );
  }
  if (abs >= 0.7) {
    return interpretationResult(
      "strength.strong",
      "blue",
      "monotonicRelationship",
      translate,
      { strength: translate("strength.strong"), direction },
    );
  }
  if (abs >= 0.5) {
    return interpretationResult(
      "strength.moderate",
      "yellow",
      "monotonicRelationship",
      translate,
      { strength: translate("strength.moderate"), direction },
    );
  }
  if (abs >= 0.3) {
    return interpretationResult(
      "strength.weak",
      "orange",
      "monotonicRelationship",
      translate,
      { strength: translate("strength.weak"), direction },
    );
  }
  return interpretationResult(
    "strength.veryWeak",
    "red",
    "veryWeakMonotonicRelationship",
    translate,
  );
}

/**
 * Interpret Cohen's Kappa coefficient
 * Reference: Landis, J. R., & Koch, G. G. (1977). The measurement of observer
 * agreement for categorical data. Biometrics, 159-174.
 *
 * @param kappa - Cohen's Kappa coefficient
 * @returns Interpretation with strength, color, and description
 */
export function interpretCohensKappa(
  kappa: number | null,
  translate: InterpretationTranslator = defaultInterpretationTranslator,
): InterpretationResult {
  if (kappa === null) {
    return interpretationResult(
      "strength.notAvailable",
      "gray",
      "noData",
      translate,
    );
  }

  if (kappa >= 1.0) {
    return interpretationResult(
      "strength.perfect",
      "green",
      "agreementBetweenScores",
      translate,
      { strength: translate("strength.perfect") },
    );
  }
  if (kappa >= 0.81) {
    return interpretationResult(
      "strength.almostPerfect",
      "green",
      "agreementBetweenScores",
      translate,
      { strength: translate("strength.almostPerfect") },
    );
  }
  if (kappa >= 0.61) {
    return interpretationResult(
      "strength.substantial",
      "blue",
      "agreementBetweenScores",
      translate,
      { strength: translate("strength.substantial") },
    );
  }
  if (kappa >= 0.41) {
    return interpretationResult(
      "strength.moderate",
      "yellow",
      "agreementBetweenScores",
      translate,
      { strength: translate("strength.moderate") },
    );
  }
  if (kappa >= 0.21) {
    return interpretationResult(
      "strength.fair",
      "orange",
      "agreementBetweenScores",
      translate,
      { strength: translate("strength.fair") },
    );
  }
  if (kappa > 0) {
    return interpretationResult(
      "strength.slight",
      "red",
      "agreementBetweenScores",
      translate,
      { strength: translate("strength.slight") },
    );
  }
  return interpretationResult(
    "strength.poor",
    "red",
    "poorAgreement",
    translate,
  );
}

/**
 * Interpret F1 score
 * Common thresholds for classification performance
 *
 * @param f1 - F1 score
 * @returns Interpretation with strength, color, and description
 */
export function interpretF1Score(
  f1: number | null,
  translate: InterpretationTranslator = defaultInterpretationTranslator,
): InterpretationResult {
  if (f1 === null) {
    return interpretationResult(
      "strength.notAvailable",
      "gray",
      "noData",
      translate,
    );
  }

  if (f1 >= 0.9) {
    return interpretationResult(
      "strength.excellent",
      "green",
      "classificationPerformance",
      translate,
      { strength: translate("strength.excellent") },
    );
  }
  if (f1 >= 0.8) {
    return interpretationResult(
      "strength.good",
      "blue",
      "classificationPerformance",
      translate,
      { strength: translate("strength.good") },
    );
  }
  if (f1 >= 0.6) {
    return interpretationResult(
      "strength.fair",
      "yellow",
      "classificationPerformance",
      translate,
      { strength: translate("strength.fair") },
    );
  }
  if (f1 >= 0.4) {
    return interpretationResult(
      "strength.poor",
      "orange",
      "classificationPerformance",
      translate,
      { strength: translate("strength.poor") },
    );
  }
  return interpretationResult(
    "strength.veryPoor",
    "red",
    "classificationPerformance",
    translate,
    { strength: translate("strength.veryPoor") },
  );
}

/**
 * Interpret overall agreement percentage
 *
 * @param agreement - Overall agreement (0-1)
 * @returns Interpretation with strength, color, and description
 */
export function interpretOverallAgreement(
  agreement: number | null,
  translate: InterpretationTranslator = defaultInterpretationTranslator,
): InterpretationResult {
  if (agreement === null) {
    return interpretationResult(
      "strength.notAvailable",
      "gray",
      "noData",
      translate,
    );
  }

  const percentage = Math.round(agreement * 100);

  if (agreement >= 0.9) {
    return interpretationResult(
      "strength.excellent",
      "green",
      "predictionsMatch",
      translate,
      { percentage },
    );
  }
  if (agreement >= 0.8) {
    return interpretationResult(
      "strength.good",
      "blue",
      "predictionsMatch",
      translate,
      { percentage },
    );
  }
  if (agreement >= 0.6) {
    return interpretationResult(
      "strength.fair",
      "yellow",
      "predictionsMatch",
      translate,
      { percentage },
    );
  }
  if (agreement >= 0.4) {
    return interpretationResult(
      "strength.poor",
      "orange",
      "predictionsMatch",
      translate,
      { percentage },
    );
  }
  return interpretationResult(
    "strength.veryPoor",
    "red",
    "predictionsMatch",
    translate,
    { percentage },
  );
}

/**
 * Interpret Mean Absolute Error (MAE)
 * Context-dependent interpretation based on scale
 *
 * @param mae - Mean Absolute Error
 * @param scale - Optional scale information {min, max} for contextual interpretation
 * @returns Interpretation with strength, color, and description
 */
export function interpretMAE(
  mae: number | null,
  scale?: { min: number; max: number },
  translate: InterpretationTranslator = defaultInterpretationTranslator,
): InterpretationResult {
  if (mae === null) {
    return interpretationResult(
      "strength.notAvailable",
      "gray",
      "noData",
      translate,
    );
  }

  if (scale) {
    const range = scale.max - scale.min;
    const relativeError = mae / range;

    if (relativeError <= 0.05) {
      return interpretationResult(
        "strength.excellent",
        "green",
        "relativeError",
        translate,
        {
          severity: translate("error.veryLow"),
          percentage: (relativeError * 100).toFixed(1),
        },
      );
    }
    if (relativeError <= 0.1) {
      return interpretationResult(
        "strength.good",
        "blue",
        "relativeError",
        translate,
        {
          severity: translate("error.low"),
          percentage: (relativeError * 100).toFixed(1),
        },
      );
    }
    if (relativeError <= 0.2) {
      return interpretationResult(
        "strength.fair",
        "yellow",
        "relativeError",
        translate,
        {
          severity: translate("error.moderate"),
          percentage: (relativeError * 100).toFixed(1),
        },
      );
    }
    if (relativeError <= 0.3) {
      return interpretationResult(
        "strength.poor",
        "orange",
        "relativeError",
        translate,
        {
          severity: translate("error.high"),
          percentage: (relativeError * 100).toFixed(1),
        },
      );
    }
    return interpretationResult(
      "strength.veryPoor",
      "red",
      "relativeError",
      translate,
      {
        severity: translate("error.veryHigh"),
        percentage: (relativeError * 100).toFixed(1),
      },
    );
  }

  // Without scale context, just report the value
  return interpretationResult(
    "strength.notAvailable",
    "gray",
    "averageError",
    translate,
    { value: mae.toFixed(3) },
  );
}

/**
 * Interpret Root Mean Squared Error (RMSE)
 * Context-dependent interpretation based on scale
 * RMSE penalizes large errors more than MAE
 *
 * @param rmse - Root Mean Squared Error
 * @param scale - Optional scale information {min, max} for contextual interpretation
 * @returns Interpretation with strength, color, and description
 */
export function interpretRMSE(
  rmse: number | null,
  scale?: { min: number; max: number },
  translate: InterpretationTranslator = defaultInterpretationTranslator,
): InterpretationResult {
  if (rmse === null) {
    return interpretationResult(
      "strength.notAvailable",
      "gray",
      "noData",
      translate,
    );
  }

  if (scale) {
    const range = scale.max - scale.min;
    const relativeError = rmse / range;

    if (relativeError <= 0.05) {
      return interpretationResult(
        "strength.excellent",
        "green",
        "relativeError",
        translate,
        {
          severity: translate("error.veryLow"),
          percentage: (relativeError * 100).toFixed(1),
        },
      );
    }
    if (relativeError <= 0.1) {
      return interpretationResult(
        "strength.good",
        "blue",
        "relativeError",
        translate,
        {
          severity: translate("error.low"),
          percentage: (relativeError * 100).toFixed(1),
        },
      );
    }
    if (relativeError <= 0.2) {
      return interpretationResult(
        "strength.fair",
        "yellow",
        "relativeError",
        translate,
        {
          severity: translate("error.moderate"),
          percentage: (relativeError * 100).toFixed(1),
        },
      );
    }
    if (relativeError <= 0.3) {
      return interpretationResult(
        "strength.poor",
        "orange",
        "relativeError",
        translate,
        {
          severity: translate("error.high"),
          percentage: (relativeError * 100).toFixed(1),
        },
      );
    }
    return interpretationResult(
      "strength.veryPoor",
      "red",
      "relativeError",
      translate,
      {
        severity: translate("error.veryHigh"),
        percentage: (relativeError * 100).toFixed(1),
      },
    );
  }

  // Without scale context, just report the value
  return interpretationResult(
    "strength.notAvailable",
    "gray",
    "rootMeanSquaredError",
    translate,
    { value: rmse.toFixed(3) },
  );
}

/**
 * @jest-environment node
 */

import {
  calculateCohensKappa,
  calculateWeightedF1Score,
  calculateOverallAgreement,
  interpretPearsonCorrelation,
  interpretSpearmanCorrelation,
  interpretCohensKappa,
  interpretF1Score,
  interpretOverallAgreement,
  type ConfusionMatrixRow,
} from "@/src/features/score-analytics/lib/statistics-utils";

describe("Cohen's Kappa Calculation", () => {
  it("should calculate perfect agreement (κ = 1.0)", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 50 },
      { rowCategory: "B", colCategory: "B", count: 30 },
      { rowCategory: "C", colCategory: "C", count: 20 },
    ];

    const kappa = calculateCohensKappa(confusionMatrix);
    expect(kappa).toBe(1.0);
  });

  it("should calculate zero agreement (κ ≈ 0)", () => {
    // Random distribution matching only by chance
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 25 },
      { rowCategory: "A", colCategory: "B", count: 25 },
      { rowCategory: "B", colCategory: "A", count: 25 },
      { rowCategory: "B", colCategory: "B", count: 25 },
    ];

    const kappa = calculateCohensKappa(confusionMatrix);
    expect(kappa).toBe(0); // Perfect chance agreement
  });

  it("should calculate moderate agreement", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 40 },
      { rowCategory: "A", colCategory: "B", count: 10 },
      { rowCategory: "B", colCategory: "A", count: 15 },
      { rowCategory: "B", colCategory: "B", count: 35 },
    ];

    const kappa = calculateCohensKappa(confusionMatrix);
    expect(kappa).toBeGreaterThan(0.4);
    expect(kappa).toBeLessThan(0.8);
  });

  it("should handle empty confusion matrix", () => {
    const kappa = calculateCohensKappa([]);
    expect(kappa).toBeNull();
  });

  it("should handle confusion matrix with zero total count", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 0 },
    ];

    const kappa = calculateCohensKappa(confusionMatrix);
    expect(kappa).toBeNull();
  });

  it("should handle multi-class scenario", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 30 },
      { rowCategory: "A", colCategory: "B", count: 5 },
      { rowCategory: "A", colCategory: "C", count: 5 },
      { rowCategory: "B", colCategory: "A", count: 5 },
      { rowCategory: "B", colCategory: "B", count: 25 },
      { rowCategory: "B", colCategory: "C", count: 5 },
      { rowCategory: "C", colCategory: "A", count: 5 },
      { rowCategory: "C", colCategory: "B", count: 5 },
      { rowCategory: "C", colCategory: "C", count: 15 },
    ];

    const kappa = calculateCohensKappa(confusionMatrix);
    expect(kappa).toBeGreaterThan(0.5);
    expect(kappa).toBeLessThan(0.8);
  });
});

describe("Weighted F1 Score Calculation", () => {
  it("should calculate perfect F1 score (F1 = 1.0)", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 50 },
      { rowCategory: "B", colCategory: "B", count: 30 },
      { rowCategory: "C", colCategory: "C", count: 20 },
    ];

    const f1 = calculateWeightedF1Score(confusionMatrix);
    expect(f1).toBe(1.0);
  });

  it("should calculate F1 score with some misclassifications", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 40 },
      { rowCategory: "A", colCategory: "B", count: 10 },
      { rowCategory: "B", colCategory: "A", count: 5 },
      { rowCategory: "B", colCategory: "B", count: 45 },
    ];

    const f1 = calculateWeightedF1Score(confusionMatrix);
    expect(f1).toBeGreaterThan(0.8);
    expect(f1).toBeLessThan(0.95);
  });

  it("should handle empty confusion matrix", () => {
    const f1 = calculateWeightedF1Score([]);
    expect(f1).toBeNull();
  });

  it("should handle zero total count", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 0 },
    ];

    const f1 = calculateWeightedF1Score(confusionMatrix);
    expect(f1).toBeNull();
  });

  it("should handle imbalanced classes", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 90 },
      { rowCategory: "A", colCategory: "B", count: 0 },
      { rowCategory: "B", colCategory: "A", count: 5 },
      { rowCategory: "B", colCategory: "B", count: 5 },
    ];

    const f1 = calculateWeightedF1Score(confusionMatrix);
    expect(f1).toBeGreaterThan(0);
    expect(f1).toBeLessThan(1);
  });

  it("should calculate weighted average correctly", () => {
    // Binary classification with clear precision/recall tradeoff
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "positive", colCategory: "positive", count: 40 },
      { rowCategory: "positive", colCategory: "negative", count: 10 },
      { rowCategory: "negative", colCategory: "positive", count: 20 },
      { rowCategory: "negative", colCategory: "negative", count: 30 },
    ];

    const f1 = calculateWeightedF1Score(confusionMatrix);

    // Manual calculation:
    // For "positive": TP=40, FP=20, FN=10
    // Precision = 40/60 = 0.667, Recall = 40/50 = 0.8
    // F1 = 2 * 0.667 * 0.8 / (0.667 + 0.8) = 0.727
    // For "negative": TP=30, FP=10, FN=20
    // Precision = 30/40 = 0.75, Recall = 30/50 = 0.6
    // F1 = 2 * 0.75 * 0.6 / (0.75 + 0.6) = 0.667
    // Weighted: (0.727 * 50 + 0.667 * 50) / 100 = 0.697

    expect(f1).toBeCloseTo(0.697, 2);
  });
});

describe("Overall Agreement Calculation", () => {
  it("should calculate 100% agreement", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 50 },
      { rowCategory: "B", colCategory: "B", count: 50 },
    ];

    const agreement = calculateOverallAgreement(confusionMatrix);
    expect(agreement).toBe(1.0);
  });

  it("should calculate 0% agreement", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "B", count: 50 },
      { rowCategory: "B", colCategory: "A", count: 50 },
    ];

    const agreement = calculateOverallAgreement(confusionMatrix);
    expect(agreement).toBe(0);
  });

  it("should calculate 50% agreement", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 25 },
      { rowCategory: "A", colCategory: "B", count: 25 },
      { rowCategory: "B", colCategory: "A", count: 25 },
      { rowCategory: "B", colCategory: "B", count: 25 },
    ];

    const agreement = calculateOverallAgreement(confusionMatrix);
    expect(agreement).toBe(0.5);
  });

  it("should handle empty confusion matrix", () => {
    const agreement = calculateOverallAgreement([]);
    expect(agreement).toBeNull();
  });

  it("should handle zero total count", () => {
    const confusionMatrix: ConfusionMatrixRow[] = [
      { rowCategory: "A", colCategory: "A", count: 0 },
    ];

    const agreement = calculateOverallAgreement(confusionMatrix);
    expect(agreement).toBeNull();
  });
});

describe("Pearson Correlation Interpretation", () => {
  it("should interpret null as N/A", () => {
    const result = interpretPearsonCorrelation(null);
    expect(result.strength).toBe("N/A");
    expect(result.color).toBe("gray");
  });

  it("should interpret very strong positive correlation", () => {
    const result = interpretPearsonCorrelation(0.95);
    expect(result.strength).toBe("Very Strong");
    expect(result.color).toBe("green");
    expect(result.description).toContain("positive");
  });

  it("should interpret very strong negative correlation", () => {
    const result = interpretPearsonCorrelation(-0.92);
    expect(result.strength).toBe("Very Strong");
    expect(result.color).toBe("green");
    expect(result.description).toContain("negative");
  });

  it("should interpret strong correlation", () => {
    const result = interpretPearsonCorrelation(0.75);
    expect(result.strength).toBe("Strong");
    expect(result.color).toBe("blue");
  });

  it("should interpret moderate correlation", () => {
    const result = interpretPearsonCorrelation(0.55);
    expect(result.strength).toBe("Moderate");
    expect(result.color).toBe("yellow");
  });

  it("should interpret weak correlation", () => {
    const result = interpretPearsonCorrelation(0.35);
    expect(result.strength).toBe("Weak");
    expect(result.color).toBe("orange");
  });

  it("should interpret very weak correlation", () => {
    const result = interpretPearsonCorrelation(0.1);
    expect(result.strength).toBe("Very Weak");
    expect(result.color).toBe("red");
  });

  it("should interpret zero correlation", () => {
    const result = interpretPearsonCorrelation(0);
    expect(result.strength).toBe("Very Weak");
    expect(result.description).toContain("no linear correlation");
  });
});

describe("Spearman Correlation Interpretation", () => {
  it("should interpret null as N/A", () => {
    const result = interpretSpearmanCorrelation(null);
    expect(result.strength).toBe("N/A");
    expect(result.color).toBe("gray");
  });

  it("should interpret very strong monotonic relationship", () => {
    const result = interpretSpearmanCorrelation(0.93);
    expect(result.strength).toBe("Very Strong");
    expect(result.color).toBe("green");
    expect(result.description).toContain("monotonic");
  });

  it("should interpret moderate relationship", () => {
    const result = interpretSpearmanCorrelation(0.6);
    expect(result.strength).toBe("Moderate");
    expect(result.color).toBe("yellow");
  });
});

describe("Cohen's Kappa Interpretation", () => {
  it("should interpret null as N/A", () => {
    const result = interpretCohensKappa(null);
    expect(result.strength).toBe("N/A");
    expect(result.color).toBe("gray");
  });

  it("should interpret almost perfect agreement", () => {
    const result = interpretCohensKappa(0.85);
    expect(result.strength).toBe("Almost Perfect");
    expect(result.color).toBe("green");
  });

  it("should interpret substantial agreement", () => {
    const result = interpretCohensKappa(0.7);
    expect(result.strength).toBe("Substantial");
    expect(result.color).toBe("blue");
  });

  it("should interpret moderate agreement", () => {
    const result = interpretCohensKappa(0.5);
    expect(result.strength).toBe("Moderate");
    expect(result.color).toBe("yellow");
  });

  it("should interpret fair agreement", () => {
    const result = interpretCohensKappa(0.3);
    expect(result.strength).toBe("Fair");
    expect(result.color).toBe("orange");
  });

  it("should interpret slight agreement", () => {
    const result = interpretCohensKappa(0.1);
    expect(result.strength).toBe("Slight");
    expect(result.color).toBe("red");
  });

  it("should interpret poor agreement (negative kappa)", () => {
    const result = interpretCohensKappa(-0.1);
    expect(result.strength).toBe("Poor");
    expect(result.color).toBe("red");
    expect(result.description).toContain("worse than chance");
  });
});

describe("F1 Score Interpretation", () => {
  it("should interpret null as N/A", () => {
    const result = interpretF1Score(null);
    expect(result.strength).toBe("N/A");
    expect(result.color).toBe("gray");
  });

  it("should interpret excellent performance", () => {
    const result = interpretF1Score(0.95);
    expect(result.strength).toBe("Excellent");
    expect(result.color).toBe("green");
  });

  it("should interpret good performance", () => {
    const result = interpretF1Score(0.85);
    expect(result.strength).toBe("Good");
    expect(result.color).toBe("blue");
  });

  it("should interpret fair performance", () => {
    const result = interpretF1Score(0.7);
    expect(result.strength).toBe("Fair");
    expect(result.color).toBe("yellow");
  });

  it("should interpret poor performance", () => {
    const result = interpretF1Score(0.5);
    expect(result.strength).toBe("Poor");
    expect(result.color).toBe("orange");
  });

  it("should interpret very poor performance", () => {
    const result = interpretF1Score(0.2);
    expect(result.strength).toBe("Very Poor");
    expect(result.color).toBe("red");
  });
});

describe("Overall Agreement Interpretation", () => {
  it("should interpret null as N/A", () => {
    const result = interpretOverallAgreement(null);
    expect(result.strength).toBe("N/A");
    expect(result.color).toBe("gray");
  });

  it("should interpret excellent agreement", () => {
    const result = interpretOverallAgreement(0.95);
    expect(result.strength).toBe("Excellent");
    expect(result.color).toBe("green");
    expect(result.description).toContain("95%");
  });

  it("should interpret good agreement", () => {
    const result = interpretOverallAgreement(0.85);
    expect(result.strength).toBe("Good");
    expect(result.color).toBe("blue");
    expect(result.description).toContain("85%");
  });

  it("should interpret fair agreement", () => {
    const result = interpretOverallAgreement(0.7);
    expect(result.strength).toBe("Fair");
    expect(result.color).toBe("yellow");
    expect(result.description).toContain("70%");
  });

  it("should interpret poor agreement", () => {
    const result = interpretOverallAgreement(0.5);
    expect(result.strength).toBe("Poor");
    expect(result.color).toBe("orange");
    expect(result.description).toContain("50%");
  });

  it("should interpret very poor agreement", () => {
    const result = interpretOverallAgreement(0.2);
    expect(result.strength).toBe("Very Poor");
    expect(result.color).toBe("red");
    expect(result.description).toContain("20%");
  });
});

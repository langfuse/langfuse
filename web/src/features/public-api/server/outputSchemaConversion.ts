import { type ObservationView } from "@langfuse/shared";

// This function exists to endure backwards compatibility with GET API consumers
// Old APIs expect to return promptTokens, completionTokens, totalTokens
// New APIs expect to return usage: { input, output, total, unit }
// We decided to return both formats to not break anything. In the future, this function
// will take a variable passed from a query param to determine which API version to return.
export const mapUsageOutput = (observation: ObservationView) => {
  const { promptTokens, completionTokens, totalTokens, unit } = observation;
  return {
    ...observation,
    inputPrice: observation.inputPrice?.toNumber() ?? null,
    outputPrice: observation.outputPrice?.toNumber() ?? null,
    totalPrice: observation.totalPrice?.toNumber() ?? null,
    calculatedInputCost: observation.calculatedInputCost?.toNumber() ?? null,
    calculatedOutputCost: observation.calculatedOutputCost?.toNumber() ?? null,
    calculatedTotalCost: observation.calculatedTotalCost?.toNumber() ?? null,
    usage: {
      unit,
      input: promptTokens,
      output: completionTokens,
      total: totalTokens,
    },
  };
};

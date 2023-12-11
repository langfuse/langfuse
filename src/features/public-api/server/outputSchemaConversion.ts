import { type Observation } from "@prisma/client";

// This function exists to endure backwards compatibility with GET API consumers
// Old APIs expect to return promptTokens, completionTokens, totalTokens
// New APIs expect to return usage: { input, output, total, unit }
// We decided to return both formats to not break anything. In the future, this function
// will take a variable passed from a query param to determine which API version to return.
export const mapUsageOutput = (observation: Observation) => {
  const { promptTokens, completionTokens, totalTokens, unit } = observation;
  return {
    ...observation,
    usage: {
      unit,
      input: promptTokens,
      output: completionTokens,
      total: totalTokens,
    },
  };
};

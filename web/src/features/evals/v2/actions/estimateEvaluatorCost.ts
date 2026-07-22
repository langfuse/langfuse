import { type TestRunPayload } from "@/src/features/evals/v2/components/TestRunSection";

type TestInput = Omit<
  TestRunPayload,
  "observationId" | "traceId" | "observationStartTime"
>;

export async function estimateEvaluatorCost({
  testInput,
  getSample,
  runTest,
}: {
  testInput: TestInput;
  getSample: () => Promise<{
    id: string;
    traceId: string | null;
    startTime: Date;
  } | null>;
  runTest: (input: TestRunPayload) => Promise<{
    success: boolean;
    estimatedCostUsd?: number | null;
  }>;
}) {
  const sample = await getSample();
  if (!sample?.traceId) return null;

  const result = await runTest({
    ...testInput,
    observationId: sample.id,
    traceId: sample.traceId,
    observationStartTime: sample.startTime,
  });

  return result.success ? (result.estimatedCostUsd ?? null) : null;
}

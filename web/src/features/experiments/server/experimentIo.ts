import { z } from "zod/v4";
import { type ExperimentItemBatchIO } from "@langfuse/shared/src/server";
import { MAX_SELECTED_EXPERIMENTS } from "../constants/comparison";

// Matches the table viewer's character limit. Preview and cumulative limits
// follow the session-detail I/O contract.
export const EXPERIMENT_FORMATTED_IO_SIZE_CAP = {
  inlineChars: 10_000,
  previewChars: 4_000,
};
const EXPERIMENT_FORMATTED_IO_CHAR_BUDGET = 2_000_000;
const EXPERIMENT_FORMATTED_IO_MAX_ITEMS = 50;

export const experimentBatchIOInput = z
  .object({
    projectId: z.string(),
    itemIds: z.array(z.string()),
    baseExperimentId: z.string().nullish(),
    compExperimentIds: z.array(z.string()),
    includeFullIo: z.boolean().optional().default(false),
  })
  .superRefine((input, ctx) => {
    if (!input.includeFullIo) return;
    if (!input.baseExperimentId && input.compExperimentIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["compExperimentIds"],
        message: "Formatted I/O requires at least one selected experiment",
      });
    }
    if (input.itemIds.length > EXPERIMENT_FORMATTED_IO_MAX_ITEMS) {
      ctx.addIssue({
        code: "custom",
        path: ["itemIds"],
        message: "Formatted I/O supports at most 50 items per request",
      });
    }
    if (
      input.compExperimentIds.length + (input.baseExperimentId ? 1 : 0) >
      MAX_SELECTED_EXPERIMENTS
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["compExperimentIds"],
        message: "Formatted I/O supports at most 10 experiments per request",
      });
    }
  });

/** Keep a page's returned I/O within the cumulative character budget. */
export function limitExperimentIO(
  rows: ExperimentItemBatchIO[],
): ExperimentItemBatchIO[] {
  let remaining = EXPERIMENT_FORMATTED_IO_CHAR_BUDGET;
  const bound = (value: string | null, truncated = false) => {
    if (value === null) return { value, truncated };
    if (value.length <= remaining) {
      remaining -= value.length;
      return { value, truncated };
    }
    let head = value.slice(
      0,
      Math.min(remaining, EXPERIMENT_FORMATTED_IO_SIZE_CAP.previewChars),
    );
    const lastCode = head.charCodeAt(head.length - 1);
    if (lastCode >= 0xd800 && lastCode <= 0xdbff) head = head.slice(0, -1);
    remaining -= head.length;
    return { value: head, truncated: true };
  };

  return rows.map((row) => {
    const input = bound(row.input, row.inputTruncated);
    const expectedOutput = bound(
      row.expectedOutput,
      row.expectedOutputTruncated,
    );
    const outputs = row.outputs.map((output) => {
      const bounded = bound(output.output, output.outputTruncated);
      return {
        ...output,
        output: bounded.value,
        outputTruncated: bounded.truncated,
      };
    });
    return {
      ...row,
      input: input.value,
      inputTruncated: input.truncated,
      expectedOutput: expectedOutput.value,
      expectedOutputTruncated: expectedOutput.truncated,
      outputs,
    };
  });
}

import { describe, expect, it } from "vitest";

import {
  PROMPT_EXPORT_VERSION_LIMIT,
  isPromptExportLimitFailure,
  promptExportLimitMessage,
} from "@/src/features/prompts/fns/promptExportLimit";

describe("promptExportLimitMessage", () => {
  it("allows an export at the version limit", () => {
    expect(promptExportLimitMessage(PROMPT_EXPORT_VERSION_LIMIT)).toBeNull();
    expect(promptExportLimitMessage(0)).toBeNull();
  });

  it("explains the limit and that latest-only still counts every version", () => {
    expect(promptExportLimitMessage(PROMPT_EXPORT_VERSION_LIMIT + 1)).toBe(
      "This project has 10,001 prompt versions, which is over the export limit of 10,000. Narrow the export to fewer prompts. The limit counts every version in the project, so exporting only the latest version does not reduce it. Contact support if you need a bulk export.",
    );
  });
});

describe("isPromptExportLimitFailure", () => {
  it("matches only the export procedure's bad request", () => {
    expect(
      isPromptExportLimitFailure({
        code: "BAD_REQUEST",
        path: "prompts.exportAll",
      }),
    ).toBe(true);
    expect(
      isPromptExportLimitFailure({
        code: "INTERNAL_SERVER_ERROR",
        path: "prompts.exportAll",
      }),
    ).toBe(false);
    expect(
      isPromptExportLimitFailure({
        code: "BAD_REQUEST",
        path: "prompts.create",
      }),
    ).toBe(false);
    expect(
      isPromptExportLimitFailure({
        code: undefined,
        path: undefined,
      }),
    ).toBe(false);
  });
});

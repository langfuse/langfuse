import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/features/natural-language-filters/server/utils", () => ({
  getLangfuseClient: vi.fn(),
}));

import { logger } from "@langfuse/shared/src/server";
import { getLangfuseClient } from "@/src/features/natural-language-filters/server/utils";
import {
  buildFieldCatalog,
  buildFilterSystemPrompt,
  nullableFieldIds,
} from "@/src/features/search-bar/server/buildFilterPrompt";
import {
  resolveFilterSystemPrompt,
  SEARCH_BAR_FILTER_PROMPT_NAME,
} from "@/src/features/search-bar/server/resolveFilterPrompt";

const mockedGetLangfuseClient = vi.mocked(getLangfuseClient);

const baseParams = {
  currentDatetime: "Tuesday, 2026-07-21T12:00:00.000Z",
  projectId: "test-project",
};

describe("resolveFilterSystemPrompt", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the code-built prompt when AI-features keys are absent (self-hosted)", async () => {
    const result = await resolveFilterSystemPrompt({
      ...baseParams,
      aiTelemetryEnabled: true,
      aiFeaturesPublicKey: undefined,
      aiFeaturesSecretKey: undefined,
      aiFeaturesHost: undefined,
    });

    expect(result.usedPrompt).toBeUndefined();
    expect(result.messages).toEqual([
      {
        role: "system",
        content: buildFilterSystemPrompt(baseParams.currentDatetime),
        type: "public-api-created",
      },
    ]);
    // Self-hosted is an expected, ordinary state — never contact the
    // AI-features project.
    expect(mockedGetLangfuseClient).not.toHaveBeenCalled();
  });

  it("falls back to the code-built prompt when the org's AI telemetry is off, even with keys present", async () => {
    const result = await resolveFilterSystemPrompt({
      ...baseParams,
      aiTelemetryEnabled: false,
      aiFeaturesPublicKey: "pk-test",
      aiFeaturesSecretKey: "sk-test",
      aiFeaturesHost: "https://example.com",
    });

    expect(result.usedPrompt).toBeUndefined();
    expect(result.messages).toEqual([
      {
        role: "system",
        content: buildFilterSystemPrompt(baseParams.currentDatetime),
        type: "public-api-created",
      },
    ]);
    expect(mockedGetLangfuseClient).not.toHaveBeenCalled();
  });

  it("falls back to the code-built prompt (with a warn log) when the managed-prompt fetch throws", async () => {
    const getPrompt = vi.fn().mockRejectedValue(new Error("network error"));
    mockedGetLangfuseClient.mockReturnValue({ getPrompt } as any);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const result = await resolveFilterSystemPrompt({
      ...baseParams,
      aiTelemetryEnabled: true,
      aiFeaturesPublicKey: "pk-test",
      aiFeaturesSecretKey: "sk-test",
      aiFeaturesHost: "https://example.com",
    });

    expect(result.usedPrompt).toBeUndefined();
    expect(result.messages).toEqual([
      {
        role: "system",
        content: buildFilterSystemPrompt(baseParams.currentDatetime),
        type: "public-api-created",
      },
    ]);
    expect(getPrompt).toHaveBeenCalledWith(
      SEARCH_BAR_FILTER_PROMPT_NAME,
      undefined,
      { type: "chat" },
    );
    // A broken managed prompt must be visible, not silent.
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("compiles the managed prompt with the registry-derived catalog/nullable-ids/current-datetime variables and links the prompt version", async () => {
    const compile = vi
      .fn()
      .mockReturnValue([
        { role: "system", content: "compiled system message" },
      ]);
    const fakePromptResponse = {
      name: SEARCH_BAR_FILTER_PROMPT_NAME,
      version: 3,
      compile,
    };
    const getPrompt = vi.fn().mockResolvedValue(fakePromptResponse);
    mockedGetLangfuseClient.mockReturnValue({ getPrompt } as any);

    const result = await resolveFilterSystemPrompt({
      ...baseParams,
      aiTelemetryEnabled: true,
      aiFeaturesPublicKey: "pk-test",
      aiFeaturesSecretKey: "sk-test",
      aiFeaturesHost: "https://example.com",
    });

    expect(mockedGetLangfuseClient).toHaveBeenCalledWith(
      "pk-test",
      "sk-test",
      "https://example.com",
      false,
    );
    expect(compile).toHaveBeenCalledWith({
      catalog: buildFieldCatalog(),
      nullable_ids: nullableFieldIds(),
      current_datetime: baseParams.currentDatetime,
    });
    expect(result.usedPrompt).toBe(fakePromptResponse);
    expect(result.messages).toEqual([
      {
        role: "system",
        content: "compiled system message",
        type: "public-api-created",
      },
    ]);
  });
});

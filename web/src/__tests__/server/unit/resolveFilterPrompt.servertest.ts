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

  it("uses the managed prompt whenever keys are present, regardless of the org's AI telemetry setting", async () => {
    // This function no longer takes an `aiTelemetryEnabled` flag at all —
    // reading our own managed prompt is a capability question (do we have
    // keys?), not a telemetry-consent question (fetching it sends no org
    // data anywhere). `aiTelemetryEnabled` still gates the trace WRITE and
    // the prompt-version link, but that gate lives entirely in
    // `router.ts`'s `traceSinkParams` ternary — a telemetry-off org still
    // gets the improved prompt here, it just never gets traced or linked.
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
      aiFeaturesPublicKey: "pk-test",
      aiFeaturesSecretKey: "sk-test",
      aiFeaturesHost: "https://example.com",
    });

    expect(mockedGetLangfuseClient).toHaveBeenCalled();
    expect(result.usedPrompt).toBe(fakePromptResponse);
    expect(result.messages).toEqual([
      {
        role: "system",
        content: "compiled system message",
        type: "public-api-created",
      },
    ]);
  });

  it("falls back to the code-built prompt (with a warn log) when the managed-prompt fetch throws", async () => {
    const getPrompt = vi.fn().mockRejectedValue(new Error("network error"));
    mockedGetLangfuseClient.mockReturnValue({ getPrompt } as any);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const result = await resolveFilterSystemPrompt({
      ...baseParams,
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
      {
        type: "chat",
        // Caps cold-start latency: a slow/erroring AI-features project must
        // never stall the user's request when a fast local fallback exists.
        fetchTimeoutMs: 2000,
        maxRetries: 0,
      },
    );
    // A broken managed prompt must be visible, not silent.
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("falls back to the code-built prompt (with a warn log) when the managed prompt compiles to a non-chat result", async () => {
    // If the server ever stores a TEXT prompt under this name,
    // `getPrompt(..., { type: "chat" })` still resolves, but `.compile()`
    // returns a STRING (the `TextPromptClient` shape), not an array of chat
    // messages. This must degrade to the fallback via an explicit guard, not
    // by relying on the TypeError `.map` would otherwise throw.
    const compile = vi.fn().mockReturnValue("a plain compiled string");
    const fakePromptResponse = {
      name: SEARCH_BAR_FILTER_PROMPT_NAME,
      version: 1,
      compile,
    };
    const getPrompt = vi.fn().mockResolvedValue(fakePromptResponse);
    mockedGetLangfuseClient.mockReturnValue({ getPrompt } as any);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const result = await resolveFilterSystemPrompt({
      ...baseParams,
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
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // The managed prompt is edited live in the Langfuse UI, so a bad edit can
  // compile to a well-typed-but-malformed chat result. Each of these must
  // degrade to the code fallback (with a warn) rather than reach the model
  // call and 500 the request.
  it.each([
    ["an empty message array", [] as unknown],
    ["a message with an unsupported role", [{ role: "wizard", content: "hi" }]],
    [
      "a message with non-string (multimodal) content",
      [{ role: "system", content: [{ type: "text", text: "hi" }] }],
    ],
    ["a null entry", [null]],
  ])(
    "falls back to the code-built prompt (with a warn log) when the managed prompt compiles to %s",
    async (_label, compiled) => {
      const compile = vi.fn().mockReturnValue(compiled);
      const fakePromptResponse = {
        name: SEARCH_BAR_FILTER_PROMPT_NAME,
        version: 2,
        compile,
      };
      const getPrompt = vi.fn().mockResolvedValue(fakePromptResponse);
      mockedGetLangfuseClient.mockReturnValue({ getPrompt } as any);
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

      const result = await resolveFilterSystemPrompt({
        ...baseParams,
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
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    },
  );

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

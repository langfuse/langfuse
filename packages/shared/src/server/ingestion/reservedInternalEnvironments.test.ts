import { describe, expect, it } from "vitest";

import { LangfuseInternalTraceEnvironment } from "../llm/types";
import {
  isInternalEnvironmentNamespace,
  RESERVED_PUBLIC_INTERNAL_ENVIRONMENT_ALIASES,
  shouldDropExternalIngestionForReservedEnvironment,
  shouldDropPublicIngestionForEnvironment,
  stripLangfuseEnvironmentPrefix,
} from "./reservedInternalEnvironments";

describe("reservedInternalEnvironments", () => {
  it("strips repeated langfuse prefixes", () => {
    expect(stripLangfuseEnvironmentPrefix("langfuse-llm-as-a-judge")).toBe(
      "llm-as-a-judge",
    );
    expect(stripLangfuseEnvironmentPrefix("langfuselangfuse-x")).toBe("x");
  });

  it("includes all internal trace environments as public aliases", () => {
    for (const environment of Object.values(LangfuseInternalTraceEnvironment)) {
      const alias = environment.replace(/^(?:langfuse[-_]?)+/, "");
      expect(RESERVED_PUBLIC_INTERNAL_ENVIRONMENT_ALIASES.has(alias)).toBe(
        true,
      );
    }
  });

  it("detects internal namespace for full and stripped names", () => {
    expect(
      isInternalEnvironmentNamespace(LangfuseInternalTraceEnvironment.LLMJudge),
    ).toBe(true);
    expect(isInternalEnvironmentNamespace("llm-as-a-judge")).toBe(true);
    expect(isInternalEnvironmentNamespace("code-eval")).toBe(true);
    expect(isInternalEnvironmentNamespace("default")).toBe(false);
    expect(isInternalEnvironmentNamespace("production")).toBe(false);
  });

  it("drops external ingestion for reserved environments unless internal SDK", () => {
    const externalAttribution = {
      ingestionApiKey: "pk",
      ingestionSdkName: "openrouter",
      ingestionSdkVersion: "1.0.0",
    };
    const internalAttribution = {
      ingestionApiKey: "pk",
      ingestionSdkName: "langfuse-internal-ai-sdk",
      ingestionSdkVersion: "1.0.0",
    };

    expect(
      shouldDropExternalIngestionForReservedEnvironment(
        "llm-as-a-judge",
        externalAttribution,
      ),
    ).toBe(true);
    expect(
      shouldDropExternalIngestionForReservedEnvironment(
        LangfuseInternalTraceEnvironment.LLMJudge,
        internalAttribution,
      ),
    ).toBe(false);
    expect(
      shouldDropExternalIngestionForReservedEnvironment(
        "default",
        externalAttribution,
      ),
    ).toBe(false);
  });

  it("never drops when isLangfuseInternal is set", () => {
    expect(
      shouldDropPublicIngestionForEnvironment("llm-as-a-judge", {
        isLangfuseInternal: true,
        attribution: {
          ingestionApiKey: "pk",
          ingestionSdkName: "unknown",
          ingestionSdkVersion: "unknown",
        },
      }),
    ).toBe(false);
  });
});

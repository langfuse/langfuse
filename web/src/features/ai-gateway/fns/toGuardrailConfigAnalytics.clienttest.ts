import { describe, expect, it } from "vitest";

import { GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL } from "@/src/features/ai-gateway/constants/gatewayGuardrails";
import { toGuardrailConfigAnalytics } from "./toGuardrailConfigAnalytics";

describe("toGuardrailConfigAnalytics", () => {
  it("captures built-in PII preset, action, scope, targeting, and drops unknown presets", () => {
    const payload = toGuardrailConfigAnalytics({
      template: "pii",
      guardrail: {
        type: "REGEX",
        action: "REDACT",
        scope: "ENTIRE_INPUT_AND_OUTPUT",
        presets: ["us_ssn", "email", "email", "unknown_future_preset"],
        secretPrefixes: [],
        containsWords: [],
        customRegex: null,
        redactionLabel: GATEWAY_GUARDRAIL_DEFAULT_REDACTION_LABEL,
        assignments: [{ scope: "ORGANIZATION" }],
      },
    });

    expect(payload).toEqual({
      template: "pii",
      guardrailType: "REGEX",
      isExternal: false,
      action: "REDACT",
      scope: "ENTIRE_INPUT_AND_OUTPUT",
      presets: ["email", "us_ssn"],
      presetCount: 2,
      customSecretPrefixCount: 0,
      keywordCount: 0,
      hasCustomRegex: false,
      hasCustomRedactionLabel: false,
      appliesTo: "everyone",
      targetedUserCount: 0,
      targetedApiKeyCount: 0,
    });
  });

  it("captures external Bedrock guardrails and subset user/API-key counts without leaking customer data", () => {
    const sentinels = [
      "sentinel-guardrail-name",
      "sentinel-regex-pattern",
      "sentinel-secret-prefix",
      "sentinel-keyword",
      "sentinel-redaction-label",
      "arn:aws:bedrock:us-east-1:123456789012:guardrail/sentinelid",
      "sentinel-user-id",
      "sentinel-api-key-id",
      "sentinel@example.com",
    ] as const;

    const bedrockGuardrail = {
      name: sentinels[0],
      type: "BEDROCK" as const,
      action: "ENFORCE" as const,
      scope: "LAST_TURN_AND_OUTPUT" as const,
      presets: [] as string[],
      secretPrefixes: [] as string[],
      containsWords: [] as string[],
      customRegex: null,
      redactionLabel: null,
      bedrock: {
        guardrailId: sentinels[5],
        guardrailVersion: "1",
        region: "us-east-1",
      },
      assignments: [
        { scope: "USER" as const, userId: sentinels[6], label: sentinels[8] },
        {
          scope: "API_KEY" as const,
          apiKeyId: sentinels[7],
          label: "prod-key",
        },
        { scope: "API_KEY" as const, apiKeyId: "key-2", label: "staging-key" },
      ],
    };

    const bedrockPayload = toGuardrailConfigAnalytics({
      template: "bedrock",
      guardrail: bedrockGuardrail,
    });

    expect(bedrockPayload).toEqual({
      template: "bedrock",
      guardrailType: "BEDROCK",
      isExternal: true,
      action: "ENFORCE",
      scope: "LAST_TURN_AND_OUTPUT",
      presets: [],
      presetCount: 0,
      customSecretPrefixCount: 0,
      keywordCount: 0,
      hasCustomRegex: false,
      hasCustomRedactionLabel: false,
      appliesTo: "subset",
      targetedUserCount: 1,
      targetedApiKeyCount: 2,
    });

    const customGuardrail = {
      name: sentinels[0],
      type: "REGEX" as const,
      action: "REDACT" as const,
      scope: "OUTPUT" as const,
      presets: [] as string[],
      secretPrefixes: [sentinels[2]],
      containsWords: [sentinels[3], "second-keyword"],
      customRegex: sentinels[1],
      redactionLabel: sentinels[4],
      assignments: [{ scope: "USER" as const, userId: sentinels[6] }],
    };

    const customPayload = toGuardrailConfigAnalytics({
      template: "custom_regex",
      guardrail: customGuardrail,
    });

    expect(customPayload).toEqual({
      template: "custom_regex",
      guardrailType: "REGEX",
      isExternal: false,
      action: "REDACT",
      scope: "OUTPUT",
      presets: [],
      presetCount: 0,
      customSecretPrefixCount: 1,
      keywordCount: 2,
      hasCustomRegex: true,
      hasCustomRedactionLabel: true,
      appliesTo: "subset",
      targetedUserCount: 1,
      targetedApiKeyCount: 0,
    });

    const serialized = JSON.stringify([bedrockPayload, customPayload]);
    for (const sentinel of sentinels) {
      expect(serialized).not.toContain(sentinel);
    }
  });
});

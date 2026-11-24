import { useState } from "react";

import preview from "@/.storybook/preview";
import type { GatewayGuardrailPreset } from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { GatewayGuardrailTestInput } from "./GatewayGuardrailTestInput";

function InteractiveTestInput({
  initialValue,
  presets,
  secretPrefixes,
  containsWords,
}: {
  initialValue: string;
  presets: readonly GatewayGuardrailPreset[];
  secretPrefixes?: readonly string[];
  containsWords?: readonly string[];
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="w-[520px]">
      <GatewayGuardrailTestInput
        value={value}
        onChange={setValue}
        presets={presets}
        secretPrefixes={secretPrefixes}
        containsWords={containsWords}
      />
    </div>
  );
}

const meta = preview.meta({
  component: InteractiveTestInput,
});

export const PiiMatches = meta.story({
  args: {
    initialValue:
      "My SSN is 123-45-6789, reach me at dana@example.com from 192.168.1.42.",
    presets: ["us_ssn", "credit_card", "email", "ip_address"],
  },
});

export const SecretAndCustomPrefixMatch = meta.story({
  args: {
    initialValue:
      "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE ACME_KEY=acme_sk_1234567890abcdef",
    presets: ["aws_access_key_id"],
    secretPrefixes: ["acme_sk_"],
  },
});

export const KeywordBlocklistMatch = meta.story({
  args: {
    initialValue: "This report is CONFIDENTIAL and Internal Only.",
    presets: [],
    containsWords: ["confidential", "internal only"],
  },
});

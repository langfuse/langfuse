import { useState } from "react";

import preview from "@/.storybook/preview";
import type { GatewayGuardrailPreset } from "@/src/features/ai-gateway/types/gatewayGuardrail";
import { GatewayGuardrailTestInput } from "./GatewayGuardrailTestInput";

function InteractiveTestInput({
  initialValue,
  presets,
}: {
  initialValue: string;
  presets: readonly GatewayGuardrailPreset[];
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="w-[520px]">
      <GatewayGuardrailTestInput
        value={value}
        onChange={setValue}
        presets={presets}
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
      "My SSN is 123-45-6789, reach me at dana@example.com or +1 415 555 0132.",
    presets: ["us_ssn", "credit_card", "email"],
  },
});

export const SecretMatch = meta.story({
  args: {
    initialValue: "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
    presets: ["aws_access_key_id"],
  },
});

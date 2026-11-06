import type { ChangeEvent, ReactNode } from "react";

import { Input } from "@/src/components/design-system/Input/Input";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

const keyCopy = {
  OPENAI: {
    label: "OpenAI API key",
    description: (
      <>
        Create one under{" "}
        <DocsLink href="https://platform.openai.com/api-keys">
          API keys
        </DocsLink>{" "}
        in the OpenAI platform.
      </>
    ),
    placeholder: "Enter OpenAI API key",
  },
  ANTHROPIC: {
    label: "Anthropic API key",
    description: (
      <>
        Create one under{" "}
        <DocsLink href="https://console.anthropic.com/settings/keys">
          API keys
        </DocsLink>{" "}
        in the Claude Console.
      </>
    ),
    placeholder: "Enter Anthropic API key",
  },
  BEDROCK: {
    label: "Bedrock API key",
    description: (
      <>
        Use{" "}
        <DocsLink href="https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html">
          Amazon Bedrock API keys
        </DocsLink>
        . The key needs access to the selected region.
      </>
    ),
    placeholder: "Enter Bedrock API key",
  },
} satisfies Record<
  GatewayProvider,
  { label: string; description: ReactNode; placeholder: string }
>;

export type SecretKeyFieldProps = {
  provider: GatewayProvider;
  credential: string;
  /** Editing a saved credential, where a blank key keeps the stored one. */
  hasSavedKey: boolean;
  onCredentialChange: (credential: string) => void;
};

export function SecretKeyField({
  provider,
  credential,
  hasSavedKey,
  onCredentialChange,
}: SecretKeyFieldProps) {
  const copy = keyCopy[provider];

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onCredentialChange(event.target.value);
  };

  return (
    <div className="ph-no-capture">
      <FieldHeader
        htmlFor="gateway-secret-key"
        label={copy.label}
        description={copy.description}
      />
      <Input
        id="gateway-secret-key"
        type="password"
        autoComplete="new-password"
        placeholder={
          hasSavedKey ? "Leave blank to keep current key" : copy.placeholder
        }
        value={credential}
        onChange={handleChange}
      />
    </div>
  );
}

function DocsLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-link hover:text-link-hover underline"
    >
      {children}
    </a>
  );
}

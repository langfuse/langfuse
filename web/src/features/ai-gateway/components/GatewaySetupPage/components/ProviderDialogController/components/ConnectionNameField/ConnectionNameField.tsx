import type { ChangeEvent } from "react";

import { Input } from "@/src/components/design-system/Input/Input";
import { FieldHeader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/components/FieldHeader";

export type ConnectionNameFieldProps = {
  name: string;
  nameError: string | null;
  onNameChange: (name: string) => void;
};

export function ConnectionNameField({
  name,
  nameError,
  onNameChange,
}: ConnectionNameFieldProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onNameChange(event.target.value);
  };

  return (
    <div>
      <FieldHeader
        htmlFor="gateway-credential-name"
        label="Name"
        description={
          <>
            Used as the prefix when calling models, e.g.{" "}
            <code className="bg-muted rounded-md px-1 py-px font-mono text-xs">
              {name.trim() || "production"}:gpt-5
            </code>
            .
          </>
        }
      />
      <div className="space-y-1">
        <Input
          id="gateway-credential-name"
          placeholder="Production"
          value={name}
          aria-invalid={Boolean(nameError)}
          aria-describedby={
            nameError ? "gateway-credential-name-error" : undefined
          }
          error={Boolean(nameError)}
          onChange={handleChange}
        />
        {nameError ? (
          <p
            id="gateway-credential-name-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {nameError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

import type { ChangeEvent } from "react";

import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";

export type CredentialFieldsProps = {
  name: string;
  nameError: string | null;
  credential: string;
  credentialPlaceholder: string;
  onNameChange: (name: string) => void;
  onCredentialChange: (credential: string) => void;
};

export function CredentialFields({
  name,
  nameError,
  credential,
  credentialPlaceholder,
  onNameChange,
  onCredentialChange,
}: CredentialFieldsProps) {
  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    onNameChange(event.target.value);
  }

  function handleCredentialChange(event: ChangeEvent<HTMLInputElement>) {
    onCredentialChange(event.target.value);
  }

  return (
    <>
      <FormField label="Name" errorMessage={nameError ?? undefined}>
        {({ id, inputDescribedById }) => (
          <Input
            id={id}
            placeholder="Production"
            value={name}
            aria-invalid={nameError !== null}
            aria-describedby={inputDescribedById}
            error={nameError !== null}
            onChange={handleNameChange}
          />
        )}
      </FormField>
      <div className="ph-no-capture">
        <FormField label="Secret key">
          {({ id, inputDescribedById }) => (
            <PasswordInput
              id={id}
              autoComplete="new-password"
              placeholder={credentialPlaceholder}
              value={credential}
              aria-describedby={inputDescribedById}
              onChange={handleCredentialChange}
            />
          )}
        </FormField>
      </div>
    </>
  );
}

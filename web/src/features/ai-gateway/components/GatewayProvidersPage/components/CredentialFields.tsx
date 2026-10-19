import { Input } from "@/src/components/design-system/Input/Input";
import { Label } from "@/src/components/ui/label";

export function CredentialFields({
  name,
  nameError,
  credential,
  credentialPlaceholder,
  onNameChange,
  onCredentialChange,
}: {
  name: string;
  nameError: string | null;
  credential: string;
  credentialPlaceholder: string;
  onNameChange: (name: string) => void;
  onCredentialChange: (credential: string) => void;
}) {
  return (
    <>
      <div>
        <Label htmlFor="gateway-credential-name">Name</Label>
        <div className="mt-1.5 space-y-1">
          <Input
            id="gateway-credential-name"
            placeholder="Production"
            value={name}
            aria-invalid={Boolean(nameError)}
            aria-describedby={
              nameError ? "gateway-credential-name-error" : undefined
            }
            error={Boolean(nameError)}
            onChange={(event) => onNameChange(event.target.value)}
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
      <div className="ph-no-capture">
        <Label htmlFor="gateway-secret-key">Secret key</Label>
        <div className="mt-1.5">
          <Input
            id="gateway-secret-key"
            type="password"
            autoComplete="new-password"
            placeholder={credentialPlaceholder}
            value={credential}
            onChange={(event) => onCredentialChange(event.target.value)}
          />
        </div>
      </div>
    </>
  );
}

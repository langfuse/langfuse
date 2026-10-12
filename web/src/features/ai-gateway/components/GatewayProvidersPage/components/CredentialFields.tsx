import { Input } from "@/src/components/ui/input";
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
        <Input
          id="gateway-credential-name"
          className="aria-invalid:border-destructive mt-1.5"
          placeholder="Production"
          value={name}
          aria-invalid={Boolean(nameError)}
          aria-describedby={
            nameError ? "gateway-credential-name-error" : undefined
          }
          onChange={(event) => onNameChange(event.target.value)}
        />
        {nameError ? (
          <p
            id="gateway-credential-name-error"
            role="alert"
            className="text-destructive mt-1 text-sm"
          >
            {nameError}
          </p>
        ) : null}
      </div>
      <div className="ph-no-capture">
        <Label htmlFor="gateway-secret-key">Secret key</Label>
        <Input
          id="gateway-secret-key"
          className="mt-1.5"
          type="password"
          autoComplete="new-password"
          placeholder={credentialPlaceholder}
          value={credential}
          onChange={(event) => onCredentialChange(event.target.value)}
        />
      </div>
    </>
  );
}

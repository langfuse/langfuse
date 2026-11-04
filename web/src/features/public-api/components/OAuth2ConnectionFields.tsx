import { useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  CLIENT_SECRET_JWT_ALGORITHMS,
  OAUTH2_AUTH_METHODS,
  OAUTH2_PROVIDERS,
  OAUTH2_PROVIDER_PROFILES,
  OAuth2ConfigSchema,
  PRIVATE_KEY_JWT_ALGORITHMS,
  resolveOAuth2Profile,
  type OAuth2AuthMethod,
  type OAuth2Config,
  type OAuth2Provider,
} from "@langfuse/shared";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { PasswordInput } from "@/src/components/design-system/PasswordInput/PasswordInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { Textarea } from "@/src/components/ui/textarea";

export const OAuth2FormSchema = z.object({
  provider: z.enum(OAUTH2_PROVIDERS),
  clientId: z.string(),
  authMethod: z.enum(OAUTH2_AUTH_METHODS),
  // Values of the provider profile's text inputs, keyed by config key.
  fields: z.record(z.string(), z.string()),
  // Empty uses the algorithm from the key, or the provider default.
  assertionAlgorithm: z.string(),
  sendClientIdWithAssertion: z.boolean().optional(),
});
type OAuth2FormValues = z.infer<typeof OAuth2FormSchema>;

type OAuth2FieldValues = { oauth2: OAuth2FormValues; secretKey?: string };

const DEFAULT_ALGORITHM_OPTION = "default";

const PRESET_AUTH_METHOD_LABELS: Record<OAuth2AuthMethod, string> = {
  client_secret_basic: "Client secret (HTTP Basic)",
  client_secret_post: "Client secret (request body)",
  client_secret_jwt: "Signed JWT (client secret)",
  private_key_jwt: "Certificate (private key)",
};

const ALGORITHMS_BY_AUTH_METHOD: Partial<
  Record<OAuth2AuthMethod, readonly string[]>
> = {
  client_secret_jwt: CLIENT_SECRET_JWT_ALGORITHMS,
  private_key_jwt: PRIVATE_KEY_JWT_ALGORITHMS,
};

const isJwtAuthMethod = (authMethod: OAuth2AuthMethod) =>
  ALGORITHMS_BY_AUTH_METHOD[authMethod] !== undefined;

const keepAlgorithmForAuthMethod = (
  algorithm: string,
  authMethod: OAuth2AuthMethod,
) =>
  ALGORITHMS_BY_AUTH_METHOD[authMethod]?.includes(algorithm) ? algorithm : "";

export function toOAuth2FormValues(
  config: OAuth2Config | undefined,
): OAuth2FormValues {
  const provider = config?.provider ?? OAUTH2_PROVIDERS[0];
  const profile = OAUTH2_PROVIDER_PROFILES[provider];
  const stored: Partial<Record<string, unknown>> = config ?? {};
  return {
    provider,
    clientId: config?.clientId ?? "",
    authMethod: config?.authMethod ?? profile.authMethods[0],
    fields: Object.fromEntries(
      profile.fields.map((field) => {
        const value = stored[field.key];
        if (config) {
          return [field.key, typeof value === "string" ? value : ""];
        }
        return [field.key, field.defaultValue ?? ""];
      }),
    ),
    assertionAlgorithm:
      config && "assertionAlgorithm" in config
        ? (config.assertionAlgorithm ?? "")
        : "",
    sendClientIdWithAssertion:
      config?.provider === "custom"
        ? config.sendClientIdWithAssertion
        : undefined,
  };
}

/**
 * Builds the `config.oauth2` candidate from the form values. Only the
 * selected provider's inputs are kept, and empty optional values are left
 * out because the config schema rejects empty strings.
 */
function toOAuth2ConfigCandidate(values: OAuth2FormValues) {
  const profile = OAUTH2_PROVIDER_PROFILES[values.provider];
  const isJwt = isJwtAuthMethod(values.authMethod);
  const fields = Object.fromEntries(
    profile.fields.flatMap((field) => {
      const value = values.fields[field.key]?.trim() ?? "";
      return value ? [[field.key, value]] : [];
    }),
  );
  return {
    provider: values.provider,
    clientId: values.clientId.trim(),
    authMethod: values.authMethod,
    ...fields,
    ...(isJwt && values.assertionAlgorithm
      ? { assertionAlgorithm: values.assertionAlgorithm }
      : {}),
    ...(values.provider === "custom" &&
    isJwt &&
    values.sendClientIdWithAssertion !== undefined
      ? { sendClientIdWithAssertion: values.sendClientIdWithAssertion }
      : {}),
  };
}

export function toOAuth2Config(values: OAuth2FormValues): OAuth2Config {
  return OAuth2ConfigSchema.parse(toOAuth2ConfigCandidate(values));
}

const FORM_LEVEL_CONFIG_KEYS = new Set([
  "provider",
  "clientId",
  "authMethod",
  "assertionAlgorithm",
  "sendClientIdWithAssertion",
]);

/** Reports issues against `oauth2.*` form paths. */
export function validateOAuth2Form(
  values: OAuth2FormValues,
  addIssue: (path: string[], message: string) => void,
) {
  const profile = OAUTH2_PROVIDER_PROFILES[values.provider];
  const missing = new Set<string>();
  if (!values.clientId.trim()) {
    missing.add("clientId");
    addIssue(["clientId"], "Client ID is required.");
  }
  for (const field of profile.fields) {
    if (field.required && !values.fields[field.key]?.trim()) {
      missing.add(field.key);
      addIssue(["fields", field.key], `${field.label} is required.`);
    }
  }

  const result = OAuth2ConfigSchema.safeParse(toOAuth2ConfigCandidate(values));
  if (result.success) return;
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "provider");
    if (missing.has(key)) continue;
    if (FORM_LEVEL_CONFIG_KEYS.has(key)) {
      addIssue([key], issue.message);
      continue;
    }
    addIssue(["fields", key], fieldIssueMessage(issue));
  }
}

function fieldIssueMessage(issue: z.core.$ZodIssue) {
  if (issue.code !== "invalid_format") return issue.message;
  if (issue.format === "regex") {
    return "Enter the host name only, without https:// or a path.";
  }
  if (issue.format === "url") {
    return "Enter a full URL, e.g. https://idp.example.com/oauth2/token.";
  }
  return issue.message;
}

const resolveTokenEndpoint = (values: OAuth2FormValues) => {
  const result = OAuth2ConfigSchema.safeParse(toOAuth2ConfigCandidate(values));
  return result.success
    ? resolveOAuth2Profile(result.data).tokenEndpoint
    : undefined;
};

/**
 * OAuth2 client credentials inputs of the LLM connection form. Renders the
 * selected identity provider's inputs and the credential (client secret or
 * private JWK) into the surrounding form's `oauth2` and `secretKey` values.
 */
export function OAuth2ConnectionFields({
  secretPlaceholder,
  isLangfuseCloud,
}: {
  /** Shown in the empty secret field; an empty field keeps the stored secret. */
  secretPlaceholder: string | undefined;
  isLangfuseCloud: boolean;
}) {
  const { control, getValues, setValue } = useFormContext<OAuth2FieldValues>();
  const oauth2 = useWatch({ control, name: "oauth2" });
  const profile = OAUTH2_PROVIDER_PROFILES[oauth2.provider];
  const isCustom = oauth2.provider === "custom";
  const algorithms = ALGORITHMS_BY_AUTH_METHOD[oauth2.authMethod];
  const tokenEndpoint = isCustom ? undefined : resolveTokenEndpoint(oauth2);

  const selectProvider = (provider: OAuth2Provider) => {
    const current = getValues("oauth2");
    const next = OAUTH2_PROVIDER_PROFILES[provider];
    const authMethod = next.authMethods[0];
    // A typed secret belongs to one identity provider and credential.
    setValue("secretKey", "");
    setValue("oauth2.provider", provider);
    setValue("oauth2.authMethod", authMethod);
    setValue(
      "oauth2.fields",
      Object.fromEntries(
        next.fields.map((field) => [
          field.key,
          current.fields[field.key] || (field.defaultValue ?? ""),
        ]),
      ),
    );
    setValue(
      "oauth2.assertionAlgorithm",
      keepAlgorithmForAuthMethod(current.assertionAlgorithm, authMethod),
    );
  };

  const selectAuthMethod = (authMethod: OAuth2AuthMethod) => {
    setValue("secretKey", "");
    setValue("oauth2.authMethod", authMethod);
    setValue(
      "oauth2.assertionAlgorithm",
      keepAlgorithmForAuthMethod(
        getValues("oauth2.assertionAlgorithm"),
        authMethod,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="oauth2.provider"
        label="Identity provider"
      >
        {(field) => (
          <SelectInput
            id={field.id}
            aria-describedby={field.inputDescribedById}
            placeholder="Select an identity provider"
            value={field.value}
            onValueChange={selectProvider}
            options={OAUTH2_PROVIDERS.map((provider) => ({
              value: provider,
              label: OAUTH2_PROVIDER_PROFILES[provider].label,
            }))}
          />
        )}
      </FormField>

      {profile.fields.map((profileField) => (
        <FormField
          key={`${oauth2.provider}.${profileField.key}`}
          control={control}
          name={`oauth2.fields.${profileField.key}`}
          label={
            profileField.required
              ? profileField.label
              : `${profileField.label} (optional)`
          }
        >
          {(field) => (
            <Input
              id={field.id}
              aria-describedby={field.inputDescribedById}
              aria-invalid={Boolean(field.error)}
              error={Boolean(field.error)}
              name={field.name}
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={
                profileField.placeholder ?? profileField.defaultValue
              }
              autoComplete="off"
            />
          )}
        </FormField>
      ))}

      {tokenEndpoint && (
        <div className="space-y-1 text-sm">
          <p className="font-bold">Token endpoint</p>
          <p>
            <code className="bg-muted rounded px-1 py-0.5 break-all">
              {tokenEndpoint}
            </code>
          </p>
          <p className="text-muted-foreground">
            Add this URL to LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS.
          </p>
        </div>
      )}

      <FormField control={control} name="oauth2.clientId" label="Client ID">
        {(field) => (
          <Input
            id={field.id}
            aria-describedby={field.inputDescribedById}
            aria-invalid={Boolean(field.error)}
            error={Boolean(field.error)}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            autoComplete="off"
          />
        )}
      </FormField>

      <FormField control={control} name="oauth2.authMethod" label="Credential">
        {(field) => (
          <SelectInput
            id={field.id}
            aria-describedby={field.inputDescribedById}
            placeholder="Select a credential"
            value={field.value}
            onValueChange={selectAuthMethod}
            options={profile.authMethods.map((authMethod) => ({
              value: authMethod,
              label: isCustom
                ? authMethod
                : PRESET_AUTH_METHOD_LABELS[authMethod],
            }))}
          />
        )}
      </FormField>

      {algorithms && (
        <FormField
          control={control}
          name="oauth2.assertionAlgorithm"
          label="Assertion algorithm"
          description="Default uses the key's alg, otherwise the provider default."
        >
          {(field) => (
            <SelectInput
              id={field.id}
              aria-describedby={field.inputDescribedById}
              placeholder="Default"
              value={field.value || DEFAULT_ALGORITHM_OPTION}
              onValueChange={(value) =>
                field.onChange(value === DEFAULT_ALGORITHM_OPTION ? "" : value)
              }
              options={[
                { value: DEFAULT_ALGORITHM_OPTION, label: "Default" },
                ...algorithms.map((algorithm) => ({
                  value: algorithm,
                  label: algorithm,
                })),
              ]}
            />
          )}
        </FormField>
      )}

      {isCustom && algorithms && (
        <FormField
          control={control}
          name="oauth2.sendClientIdWithAssertion"
          label="Send client_id with assertion"
        >
          {(field) => (
            <SwitchInput
              id={field.id}
              aria-describedby={field.inputDescribedById}
              description="Also send client_id in the token request body. Some identity providers require it."
              checked={field.value ?? false}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        </FormField>
      )}

      {oauth2.authMethod === "private_key_jwt" ? (
        <FormField
          control={control}
          name="secretKey"
          label="Private JWK (JSON)"
          description={[
            {
              type: "text",
              text: "A single private JWK with its private part (",
            },
            { type: "code", text: "d" },
            {
              type: "text",
              text: `), not a JWKS. Stored encrypted ${isLangfuseCloud ? "on our servers" : "in your database"}.`,
            },
          ]}
        >
          {(field) => (
            <Textarea
              id={field.id}
              aria-describedby={field.inputDescribedById}
              aria-invalid={Boolean(field.error)}
              name={field.name}
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={
                secretPlaceholder ??
                '{"kty": "RSA", "kid": "...", "n": "...", "e": "AQAB", "d": "...", ...}'
              }
              rows={6}
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </FormField>
      ) : (
        <FormField
          control={control}
          name="secretKey"
          label="Client secret"
          description={`Stored encrypted ${isLangfuseCloud ? "on our servers" : "in your database"}.`}
        >
          {(field) => (
            <PasswordInput
              id={field.id}
              aria-describedby={field.inputDescribedById}
              aria-invalid={Boolean(field.error)}
              error={Boolean(field.error)}
              name={field.name}
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={secretPlaceholder}
              autoComplete="off"
            />
          )}
        </FormField>
      )}
    </div>
  );
}

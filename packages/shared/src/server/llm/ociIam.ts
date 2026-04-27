import {
  DefaultRequestSigner,
  FetchHttpClient,
  type Method,
  Region,
  SimpleAuthenticationDetailsProvider,
} from "oci-common";
import {
  OciIAMCredentialSchema,
  type OciIAMCredential,
  getOciBaseUrlValidationError,
} from "../../interfaces/customLLMProviderConfigSchemas";

export const OCI_IAM_API_KEY_PLACEHOLDER = "oci-iam";

const OCI_REGION_HOSTNAME_REGEX =
  /^inference\.generativeai\.([^.]+)\.oci\.oraclecloud\.com$/;
const OCI_IAM_PROTECTED_HEADERS = [
  "authorization",
  "content-length",
  "date",
  "x-content-sha256",
  "x-date",
] as const;
const OCI_IAM_USER_BLOCKED_HEADERS = [
  ...OCI_IAM_PROTECTED_HEADERS,
  "host",
  "opc-compartment-id",
] as const;

export const sanitizeOciIamHeaders = (
  headers?: Record<string, string>,
): Record<string, string> | undefined => {
  if (!headers) return undefined;

  const sanitizedHeaders = Object.fromEntries(
    Object.entries(headers).filter(
      ([headerName]) =>
        !OCI_IAM_USER_BLOCKED_HEADERS.includes(
          headerName.toLowerCase() as (typeof OCI_IAM_USER_BLOCKED_HEADERS)[number],
        ),
    ),
  );

  return Object.keys(sanitizedHeaders).length > 0
    ? sanitizedHeaders
    : undefined;
};

const resolveOciRegion = ({
  credentials,
  baseURL,
}: {
  credentials: OciIAMCredential;
  baseURL?: string | null;
}) => {
  if (credentials.region?.trim()) {
    return credentials.region.trim();
  }

  if (!baseURL) {
    throw new Error(
      "OCI IAM credentials require either `region` in the secret JSON or an OCI base URL.",
    );
  }

  try {
    const hostname = new URL(baseURL).hostname;
    const region = hostname.match(OCI_REGION_HOSTNAME_REGEX)?.[1];

    if (region) {
      return region;
    }
  } catch {
    // fall through to the explicit error below
  }

  throw new Error(
    "Could not determine OCI region. Add `region` to the OCI IAM credentials JSON or use a standard OCI Generative AI base URL.",
  );
};

export const buildOciIamFetch = ({
  credentials,
  baseURL,
}: {
  credentials: OciIAMCredential;
  baseURL?: string | null;
}) => {
  if (!baseURL) {
    throw new Error("OCI IAM requires a base URL for origin pinning.");
  }

  const baseUrlError = getOciBaseUrlValidationError(baseURL);
  if (baseUrlError) {
    throw new Error(baseUrlError);
  }

  const authenticationProvider = new SimpleAuthenticationDetailsProvider(
    credentials.tenancyId,
    credentials.userId,
    credentials.fingerprint,
    credentials.privateKey,
    credentials.passphrase ?? null,
    Region.fromRegionId(resolveOciRegion({ credentials, baseURL })),
  );

  const signer = new DefaultRequestSigner(authenticationProvider);
  const allowedOrigin = new URL(baseURL).origin;

  return async (input: string | URL | Request, init?: RequestInit) => {
    const existingRequest = input instanceof Request ? input.clone() : null;
    const body =
      init?.body !== undefined
        ? init.body
        : existingRequest
          ? await existingRequest.text()
          : undefined;

    const requestUrl =
      typeof input === "string" || input instanceof URL
        ? input.toString()
        : input.url;

    if (new URL(requestUrl).origin !== allowedOrigin) {
      throw new Error(
        "OCI IAM requests must stay on the configured OCI base URL origin.",
      );
    }

    const requestHeaders = new Headers(
      init?.headers ?? existingRequest?.headers,
    );
    for (const headerName of OCI_IAM_PROTECTED_HEADERS) {
      requestHeaders.delete(headerName);
    }
    const requestMethod = init?.method ?? existingRequest?.method ?? "GET";

    const httpClient = new FetchHttpClient(signer, undefined, {
      cache: init?.cache ?? existingRequest?.cache,
      credentials: init?.credentials ?? existingRequest?.credentials,
      dispatcher: (init as RequestInit & { dispatcher?: unknown })?.dispatcher,
      integrity: init?.integrity ?? existingRequest?.integrity,
      keepalive: init?.keepalive ?? existingRequest?.keepalive,
      mode: init?.mode ?? existingRequest?.mode,
      // Never follow redirects with signed OCI IAM requests to avoid leaking
      // request signatures or compartment headers to another origin.
      redirect: "manual",
      referrer: init?.referrer ?? existingRequest?.referrer,
      referrerPolicy: init?.referrerPolicy ?? existingRequest?.referrerPolicy,
      signal: init?.signal ?? existingRequest?.signal,
    });

    return httpClient.send({
      method: requestMethod as Method,
      headers: requestHeaders,
      uri: requestUrl,
      body,
    });
  };
};

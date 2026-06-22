export type LangfuseSdkHeaders = {
  sdkName?: string;
  sdkVersion?: string;
  ingestionVersion?: string;
};

export type NormalizedLangfuseSdkHeaders = {
  langfuseSdkName?: string;
  langfuseSdkVersion?: string;
  langfuseIngestionVersion?: string;
};

export function normalizeLangfuseSdkName(
  sdkName: string | null | undefined,
): string | undefined {
  const normalized = sdkName?.trim().toLowerCase();
  return normalized || undefined;
}

export function extractBaseLangfuseSdkVersion(sdkVersion: string): string {
  const version = sdkVersion.trim();

  // Standard semver / semver pre-release / build metadata.
  if (/^v?\d+\.\d+\.\d+(?:[-+].+)?$/i.test(version)) {
    return version.split(/[-+]/)[0].replace(/^v/i, "");
  }

  // Python PEP 440 pre-release shorthand: 4.0.0a1, 4.0.0b1, 4.0.0rc1.
  const pep440Match = version.match(/^(v?\d+\.\d+\.\d+)(?:a|b|rc)\d+$/i);
  if (pep440Match?.[1]) {
    return pep440Match[1].replace(/^v/i, "");
  }

  return version;
}

export function normalizeLangfuseSdkVersion(
  sdkVersion: string | null | undefined,
): string | undefined {
  const normalized = sdkVersion?.trim();
  if (!normalized) return undefined;

  return extractBaseLangfuseSdkVersion(normalized);
}

export function normalizeLangfuseIngestionVersion(
  ingestionVersion: string | null | undefined,
): string | undefined {
  const normalized = ingestionVersion?.trim();
  if (!normalized) return undefined;

  if (/^\d+$/.test(normalized)) {
    return String(Number.parseInt(normalized, 10));
  }

  return normalized;
}

export function parseLangfuseIngestionVersion(
  ingestionVersion: string | null | undefined,
): number | undefined | null {
  const normalized = ingestionVersion?.trim();
  if (!normalized) return undefined;

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  return Number.parseInt(normalized, 10);
}

export function normalizeLangfuseSdkHeaders(
  headers: LangfuseSdkHeaders,
): NormalizedLangfuseSdkHeaders {
  return {
    langfuseSdkName: normalizeLangfuseSdkName(headers.sdkName),
    langfuseSdkVersion: normalizeLangfuseSdkVersion(headers.sdkVersion),
    langfuseIngestionVersion: normalizeLangfuseIngestionVersion(
      headers.ingestionVersion,
    ),
  };
}

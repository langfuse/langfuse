const S3_URI_PREFIX = "s3://";
const MAX_S3_URI_LENGTH = 2048;

export type ParsedS3Uri = {
  bucket: string;
  key: string;
};

export function parseS3Uri(value: string): ParsedS3Uri | null {
  if (!value.startsWith(S3_URI_PREFIX) || value.length > MAX_S3_URI_LENGTH) {
    return null;
  }

  const withoutScheme = value.slice(S3_URI_PREFIX.length);
  const separatorIndex = withoutScheme.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === withoutScheme.length - 1) {
    return null;
  }

  const bucket = withoutScheme.slice(0, separatorIndex);
  const key = withoutScheme.slice(separatorIndex + 1);

  if (
    !bucket ||
    !key ||
    key.startsWith("/") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return null;
  }

  return { bucket, key };
}

export function isS3KeyWithinPrefix(key: string, prefix: string): boolean {
  if (!prefix) return false;
  const directoryPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return key.startsWith(directoryPrefix);
}

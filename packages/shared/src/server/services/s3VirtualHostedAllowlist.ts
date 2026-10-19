import { BLOB_STORAGE_REGION_REGEX } from "../../utils/stringChecks";
import {
  type OutboundUrlValidationWhitelist,
  parseOutboundUrl,
} from "../outbound-url";

/** Bucket names the AWS SDK virtual-hosts as `{bucket}.{endpoint host}`. */
const DNS_COMPATIBLE_BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const IP_SHAPED_BUCKET_NAME = /(?:\d+\.){3}\d+/;
const ADJACENT_DOTS = /\.\./;

export type S3VirtualHostTarget = {
  endpoint?: string | null;
  bucketName?: string | null;
  forcePathStyle?: boolean;
  region?: string | null;
};

/** withS3VirtualHostedBucket trusts `{bucket}.{allowlisted endpoint}` and rejects other names under that parent. */
export function withS3VirtualHostedBucket(
  whitelist: OutboundUrlValidationWhitelist,
  target?: S3VirtualHostTarget,
): OutboundUrlValidationWhitelist {
  const allowedHosts = whitelist.allowedHosts ?? [];
  const bucketName = target?.bucketName?.trim() ?? "";
  if (
    allowedHosts.length === 0 ||
    !target ||
    target.forcePathStyle ||
    !isDnsCompatibleBucketName(bucketName)
  ) {
    return whitelist;
  }

  const virtualHosts = virtualHostedNames(target, bucketName, allowedHosts);
  if (virtualHosts.length === 0) return whitelist;
  return {
    ...whitelist,
    allowedHosts: [...allowedHosts, ...virtualHosts],
  };
}

function isDnsCompatibleBucketName(bucketName: string): boolean {
  return (
    DNS_COMPATIBLE_BUCKET_NAME.test(bucketName) &&
    !IP_SHAPED_BUCKET_NAME.test(bucketName) &&
    !ADJACENT_DOTS.test(bucketName)
  );
}

function virtualHostedNames(
  target: S3VirtualHostTarget,
  bucketName: string,
  allowedHosts: string[],
): string[] {
  const names: string[] = [];
  for (const base of addressBases(target)) {
    // HTTPS virtual-hosting skips bucket names that contain a dot; the SDK
    // keeps the endpoint host so the certificate still matches.
    if (base.https && bucketName.includes(".")) continue;
    if (!allowedHosts.includes(base.hostname)) continue;
    const virtualHost = `${bucketName}.${base.hostname}`;
    if (allowedHosts.includes(virtualHost) || names.includes(virtualHost)) {
      continue;
    }
    names.push(virtualHost);
  }
  return names;
}

function addressBases(
  target: S3VirtualHostTarget,
): Array<{ hostname: string; https: boolean }> {
  if (target.endpoint) {
    try {
      const url = parseOutboundUrl(target.endpoint);
      if (isIpHostname(url.hostname)) return [];
      return [{ hostname: url.hostname, https: url.protocol === "https:" }];
    } catch {
      return [];
    }
  }

  const region = target.region?.trim().toLowerCase();
  if (!region || region === "auto" || !BLOB_STORAGE_REGION_REGEX.test(region)) {
    return [];
  }
  const bases = [
    { hostname: `s3.${region}.amazonaws.com`, https: true as const },
  ];
  if (region === "us-east-1") {
    bases.push({ hostname: "s3.amazonaws.com", https: true });
  }
  return bases;
}

function isIpHostname(hostname: string): boolean {
  return hostname.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

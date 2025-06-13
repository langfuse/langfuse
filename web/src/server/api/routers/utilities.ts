import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import { z } from "zod/v4";
import { promises as dns } from "dns";
import { Address4, Address6 } from "ip-address";
import { logger } from "@langfuse/shared/src/server";

const IP_4_LOOPBACK_SUBNET = "127.0.0.0/8";
const IP_4_LINK_LOCAL_SUBNET = "169.254.0.0/16";
const IP_4_PRIVATE_A_SUBNET = "10.0.0.0/8";
const IP_4_PRIVATE_B_SUBNET = "172.16.0.0/12";
const IP_4_PRIVATE_C_SUBNET = "192.168.0.0/16";

/**
 * Check if the ipAddress is a private IP address
 * This function is used to protect against Server Side Request Forgery (SSRF) attacks.
 * SSRF attacks can cause the server to make requests to internal resources that should not be accessible.
 * By checking if a ipAddress resolves to a private IP address, we can prevent such attacks.
 *
 * @param ipAddress - The ipAddress to check
 * @returns True if the ipAddress is a private IP address, false otherwise
 */
const isPrivateIp = (ipAddress: string): boolean => {
  try {
    if (Address6.isValid(ipAddress)) {
      const address = new Address6(ipAddress);
      const isValidAddress6 = address.isLinkLocal() || address.isLoopback();
      if (isValidAddress6) return true;
    }
    if (Address4.isValid(ipAddress)) {
      const address = new Address4(ipAddress);
      const isValidAddress4 = [
        IP_4_LOOPBACK_SUBNET,
        IP_4_LINK_LOCAL_SUBNET,
        IP_4_PRIVATE_A_SUBNET,
        IP_4_PRIVATE_B_SUBNET,
        IP_4_PRIVATE_C_SUBNET,
      ].some((subnet) => address.isInSubnet(new Address4(subnet)));
      if (isValidAddress4) return true;
    }
    return false;
  } catch (error) {
    logger.info("IP parsing error:", error);
    return false;
  }
};

const resolveHostname = async (
  hostname: string,
): Promise<{ addresses4: string[]; addresses6: string[] }> => {
  let addresses4: string[] = [];
  let addresses6: string[] = [];

  try {
    addresses4 = await dns.resolve4(hostname);
  } catch (error) {
    logger.info("IPv4 DNS resolution error:", error);
  }

  try {
    addresses6 = await dns.resolve6(hostname);
  } catch (error) {
    logger.info("IPv6 DNS resolution error:", error);
  }

  return { addresses4, addresses6 };
};

const isValidAndSecureUrl = async (urlString: string): Promise<boolean> => {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") {
      return false;
    }
    const hostname = new URL(url).hostname;
    const ipAddresses = await resolveHostname(hostname);

    // Consider unresolvable or private hostnames as invalid/unsafe
    return (
      (Boolean(ipAddresses.addresses4.length) &&
        ipAddresses.addresses4.every((ip) => !isPrivateIp(ip))) ||
      (Boolean(ipAddresses.addresses6.length) &&
        ipAddresses.addresses6.every((ip) => !isPrivateIp(ip)))
    );
  } catch (error) {
    logger.info("Invalid URL:", error);
    return false;
  }
};

// Define a Zod schema for pre-signed S3 URL validation, based on https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html; 04.12.24
const s3UrlSchema = z.object({
  hostname: z
    .string()
    .refine((hostname) => hostname.endsWith(".amazonaws.com"), {
      message: "Invalid hostname. Must be an S3 URL.",
    }),
  path: z.string(),
  query: z.object({
    "X-Amz-Algorithm": z.string().optional(),
    "X-Amz-Credential": z.string().optional(),
    "X-Amz-Date": z.string().optional(),
    "X-Amz-Expires": z.string().optional(),
    "X-Amz-SignedHeaders": z.string().optional(),
    "X-Amz-Signature": z.string(),
    "X-Amz-Security-Token": z.string().optional(),
    "x-id": z.string().optional(), // Optional ID parameter, not documented in AWS docs as it is SDK specific, https://github.com/aws/aws-sdk-go-v2/blob/04e7aca073a0a7ed479aa37cad88a1cf58a979a1/service/s3/internal/customizations/presign_test.go#L35-L41
  }),
});

const isImageContent = (response: Response): boolean => {
  const contentType = response.headers.get("content-type");
  return !!contentType && contentType.startsWith("image/");
};

/**
 * Validate if a URL is a valid and live pre-signed S3 URL
 * @param url The pre-signed S3 URL to validate
 * @returns True if the URL is valid and reachable, false otherwise
 */
const isValidPresignedS3Url = async (url: string): Promise<boolean> => {
  try {
    const parsedUrl = new URL(url);

    // Validate hostname and query parameters
    const result = s3UrlSchema.safeParse({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
    });

    if (!result.success) {
      logger.info("Invalid pre-signed S3 URL:", result.error.message);
      return false;
    }

    // Perform a HEAD request to check reachability
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });

    // Status 200 indicates the URL is valid
    if (response.ok && isImageContent(response)) {
      return true;
    }

    // Attempt a GET request, as most pre-signed URLs are restricted to GET requests only
    if (response.status === 403) {
      logger.info(
        "HEAD request returned 403, attempting GET for validation...",
      );

      const getResponse = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        headers: { Range: "bytes=0-1" }, // Fetch only the first byte, expected server response for valid pre-signed URLs is 206 Partial Content
      });

      return getResponse.ok && isImageContent(getResponse); // 200 or 206 Partial Content indicates success
    }

    return false;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.info("URL Validation Error:", error.message);
    } else if (error instanceof Error) {
      logger.info("HEAD Request Error:", error.message);
    } else {
      logger.info("Unknown error:", error);
    }
    return false;
  }
};

const isValidImageUrl = async (url: string): Promise<boolean> => {
  try {
    // Pre-signed URLs (AWS S3) often have restricted access methods. Some only allow GET requests, others only HEAD. We need to try both.
    if (await isValidPresignedS3Url(url)) {
      return true;
    }

    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return false;
    }

    return isImageContent(response);
  } catch (error) {
    logger.info("Invalid image error:", error);
    return false;
  }
};

export const utilsRouter = createTRPCRouter({
  validateImgUrl: protectedProcedure
    .input(z.string().max(2048))
    .query(async ({ input: url }) => {
      const isValidUrl = await isValidAndSecureUrl(url);
      if (!isValidUrl) {
        return { isValid: false };
      }

      const isValidImg = await isValidImageUrl(url);
      return { isValid: isValidImg };
    }),
});

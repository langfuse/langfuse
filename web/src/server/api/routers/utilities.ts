import {
  createTRPCRouter,
  authenticatedProcedure,
} from "@/src/server/api/trpc";
import { z } from "zod";
import {
  fetchWithSecureRedirects,
  logger,
  parseOutboundUrl,
  validateOutboundUrlHost,
  type ValidateOutboundUrlHostOptions,
} from "@langfuse/shared/src/server";

const MAX_IMAGE_URL_REDIRECTS = 5;
const IMAGE_URL_VALIDATION_OPTIONS = {
  whitelist: { hosts: [], ips: [], ip_ranges: [] },
  shouldThrowIfDnsResolutionFails: true,
  logContext: "Image URL",
  shouldSkipDnsCheckForLiteralIps: true,
} satisfies Omit<ValidateOutboundUrlHostOptions, "url">;

export const isValidAndSecureUrl = async (
  urlString: string,
): Promise<boolean> => {
  try {
    const url = parseOutboundUrl(urlString);
    if (url.protocol !== "https:") {
      return false;
    }

    await validateOutboundUrlHost({
      url,
      ...IMAGE_URL_VALIDATION_OPTIONS,
    });
    return true;
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

type PresignedS3UrlValidationResult = "not-s3-url" | "valid" | "invalid";

const isImageContent = (response: Response): boolean => {
  const contentType = response.headers.get("content-type");
  return !!contentType && contentType.startsWith("image/");
};

const fetchImageUrlWithSecureRedirects = async (
  url: string,
  options: RequestInit,
): Promise<Response> => {
  // fetchWithSecureRedirects validates redirect targets. Validate the initial
  // image URL here so the first network request cannot target a blocked host.
  if (!(await isValidAndSecureUrl(url))) {
    throw new Error("Image URL failed security validation");
  }

  const { response } = await fetchWithSecureRedirects(url, options, {
    maxRedirects: MAX_IMAGE_URL_REDIRECTS,
    redirectValidation: {
      validateUrl: async (redirectUrl) => {
        if (!(await isValidAndSecureUrl(redirectUrl))) {
          throw new Error(
            "Image URL redirect target failed security validation",
          );
        }
      },
    },
  });

  return response;
};

/**
 * Validate if a URL is a valid and live pre-signed S3 URL
 * @param url The pre-signed S3 URL to validate
 * @returns True if the URL is valid and reachable, false otherwise
 */
const validatePresignedS3Url = async (
  url: string,
): Promise<PresignedS3UrlValidationResult> => {
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
      return "not-s3-url";
    }

    // Perform a HEAD request to check reachability
    const response = await fetchImageUrlWithSecureRedirects(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });

    // Status 200 indicates the URL is valid
    if (response.ok && isImageContent(response)) {
      return "valid";
    }

    // Attempt a GET request, as most pre-signed URLs are restricted to GET requests only
    if (response.status === 403) {
      logger.info(
        "HEAD request returned 403, attempting GET for validation...",
      );

      const getResponse = await fetchImageUrlWithSecureRedirects(url, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
        headers: { Range: "bytes=0-1" }, // Fetch only the first byte, expected server response for valid pre-signed URLs is 206 Partial Content
      });

      return getResponse.ok && isImageContent(getResponse)
        ? "valid"
        : "invalid"; // 200 or 206 Partial Content indicates success
    }

    return "invalid";
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.info("URL Validation Error:", error.message);
    } else if (error instanceof Error) {
      logger.info("HEAD Request Error:", error.message);
    } else {
      logger.info("Unknown error:", error);
    }
    return "invalid";
  }
};

export const isValidImageUrl = async (url: string): Promise<boolean> => {
  try {
    // Pre-signed URLs (AWS S3) often have restricted access methods. Some only allow GET requests, others only HEAD. We need to try both.
    const presignedS3UrlValidationResult = await validatePresignedS3Url(url);
    if (presignedS3UrlValidationResult === "valid") {
      return true;
    }
    // If the URL looks like a pre-signed S3 URL but validation failed, do not
    // retry it through the generic image path; that would repeat the same
    // secure fetch and DNS checks for the same URL.
    if (presignedS3UrlValidationResult === "invalid") {
      return false;
    }

    const response = await fetchImageUrlWithSecureRedirects(url, {
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
  validateImgUrl: authenticatedProcedure
    .input(z.string().max(2048))
    .query(async ({ input: url }) => {
      const isValidImg = await isValidImageUrl(url);
      return { isValid: isValidImg };
    }),
});

import { env } from "../../../env";
import { logger } from "../../logger";
import {
  traceException,
  recordHistogram,
  recordIncrement,
} from "../../instrumentation";
import { isEnterpriseLicenseAvailable } from "../licenseCheck";
import type {
  IngestionMaskingConfig,
  ApplyIngestionMaskingParams,
  MaskingResult,
} from "./types";

/**
 * Get ingestion masking configuration from environment variables.
 * Returns null if the callback URL is not configured.
 */
function getIngestionMaskingConfig(): IngestionMaskingConfig | null {
  const callbackUrl = env.LANGFUSE_INGESTION_MASKING_CALLBACK_URL;
  if (!callbackUrl) {
    return null;
  }

  return {
    callbackUrl,
    timeoutMs: env.LANGFUSE_INGESTION_MASKING_CALLBACK_TIMEOUT_MS,
    failClosed: env.LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED === "true",
    maxRetries: env.LANGFUSE_INGESTION_MASKING_MAX_RETRIES,
    propagatedHeaders: env.LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS,
  };
}

/**
 * Check if ingestion masking is enabled.
 * Returns true only if:
 * 1. The callback URL is configured
 * 2. An EE license is available (cloud or self-hosted with license)
 */
export function isIngestionMaskingEnabled(): boolean {
  const config = getIngestionMaskingConfig();
  if (!config) {
    return false;
  }

  if (!isEnterpriseLicenseAvailable()) {
    logger.warn(
      "Ingestion masking callback URL is configured but enterprise license is not available. Masking will be disabled. Ingestion masking requires Langfuse Cloud or a self-hosted enterprise license (langfuse_ee_*).",
    );
    return false;
  }

  return true;
}

/**
 * Make an HTTP POST request to the masking callback with retry support.
 */
async function makeCallbackRequest<T>(params: {
  config: IngestionMaskingConfig;
  data: T;
  projectId: string;
  orgId?: string;
  propagatedHeaders?: Record<string, string>;
  attempt: number;
}): Promise<{ success: boolean; data: T; error?: string }> {
  const { config, data, projectId, orgId, propagatedHeaders, attempt } = params;
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Langfuse-Org-Id": orgId ?? "",
      "X-Langfuse-Project-Id": projectId,
      ...propagatedHeaders,
    };

    const response = await fetch(config.callbackUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    const duration = Date.now() - startTime;
    recordHistogram(
      "langfuse.ingestion.masking.callback_duration_ms",
      duration,
      {
        status: response.ok ? "success" : "error",
        attempt: attempt.toString(),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return {
        success: false,
        data,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const maskedData = (await response.json()) as T;
    return { success: true, data: maskedData };
  } catch (error) {
    const duration = Date.now() - startTime;
    recordHistogram(
      "langfuse.ingestion.masking.callback_duration_ms",
      duration,
      {
        status: "error",
        attempt: attempt.toString(),
      },
    );

    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, data, error: "Request timeout" };
    }

    return {
      success: false,
      data,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Apply ingestion masking to data by making an HTTP callback to an external masking endpoint.
 *
 * This feature masks sensitive data from OTEL events before storage in ClickHouse.
 *
 * @param params - The parameters for the masking operation
 * @returns A MaskingResult containing the (potentially masked) data and success status
 */
export async function applyIngestionMasking<T>(
  params: ApplyIngestionMaskingParams<T>,
): Promise<MaskingResult<T>> {
  const { data, projectId, orgId, propagatedHeaders } = params;

  if (!isIngestionMaskingEnabled()) {
    return { success: true, data, masked: false };
  }

  // Check if masking is enabled
  const config = getIngestionMaskingConfig()!;

  // Attempt the callback with retries
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    const result = await makeCallbackRequest({
      config,
      data,
      projectId,
      orgId,
      propagatedHeaders,
      attempt,
    });

    if (result.success) {
      recordIncrement("langfuse.ingestion.masking.success", 1, {
        attempt: attempt.toString(),
      });
      return { success: true, data: result.data, masked: true };
    }

    lastError = result.error;
    logger.warn(
      `Ingestion masking callback failed (attempt ${attempt}/${config.maxRetries + 1}): ${lastError}`,
      { projectId, orgId },
    );

    // Don't retry if this was the last attempt
    if (attempt <= config.maxRetries) {
      // Small delay before retry (exponential backoff capped at 1 second)
      const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  recordIncrement("langfuse.ingestion.masking.failure", 1, {
    fail_closed: config.failClosed.toString(),
  });

  const error = new Error(
    `Ingestion masking callback failed after ${config.maxRetries + 1} attempts: ${lastError}`,
  );
  traceException(error);

  if (config.failClosed) {
    // Fail closed: return failure so the event is dropped
    return {
      success: false,
      data,
      masked: false,
      error: lastError,
    };
  }

  // Fail open: return success with original data
  logger.warn(
    `Ingestion masking failed, processing with original data (fail-open mode)`,
    { projectId, orgId, error: lastError },
  );
  return { success: true, data, masked: false };
}

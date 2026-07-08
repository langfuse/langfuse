/**
 * Configuration for ingestion masking callback.
 * Read from environment variables.
 */
export interface IngestionMaskingConfig {
  /** URL of the external masking callback endpoint */
  callbackUrl: string;
  /** Timeout in milliseconds for the callback request */
  timeoutMs: number;
  /** If true, drop events when masking fails. If false, process original data. */
  failClosed: boolean;
  /** Maximum number of retry attempts for failed requests */
  maxRetries: number;
  /** List of header names to propagate from the original request */
  propagatedHeaders: string[];
}

/**
 * Input parameters for the applyIngestionMasking function.
 */
export interface ApplyIngestionMaskingParams<T> {
  /** The data to be masked */
  data: T;
  /** The project ID for the data */
  projectId: string;
  /** The organization ID for the data */
  orgId?: string;
  /** Headers to propagate to the masking callback */
  propagatedHeaders?: Record<string, string>;
}

/**
 * Result of the masking operation.
 */
export interface MaskingResult<T> {
  /** Whether the masking operation succeeded */
  success: boolean;
  /** The (potentially masked) data */
  data: T;
  /** Whether the data was actually masked */
  masked: boolean;
  /** Error message if the operation failed */
  error?: string;
}

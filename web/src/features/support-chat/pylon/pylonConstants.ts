/**
 * Client-safe constants for the Pylon support integration.
 * These can be safely imported in both client and server code.
 */

/**
 * Maximum file size allowed for support attachments uploaded to Pylon.
 * Kept in sync with the limit enforced by the
 * `/api/support/upload-attachments` endpoint.
 */
export const PYLON_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

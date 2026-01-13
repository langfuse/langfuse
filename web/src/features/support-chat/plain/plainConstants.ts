/**
 * Client-safe constants for Plain API integration
 * These can be safely imported in both client and server code
 */

/**
 * Maximum file size allowed by Plain API for attachments
 * This is enforced by Plain's API, so we must match it on client and server
 */
export const PLAIN_MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024; // 6MB

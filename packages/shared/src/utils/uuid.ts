import { v4 as uuidv4 } from "uuid";

/**
 * Generates an RFC4122 v4 UUID safely across browser and server environments.
 * Uses crypto.randomUUID() when available (Node.js & HTTPS Secure Contexts),
 * falling back to uuidv4() for non-secure HTTP origins (such as self-hosted LAN IP access).
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback for non-secure browser contexts
    }
  }
  return uuidv4();
}

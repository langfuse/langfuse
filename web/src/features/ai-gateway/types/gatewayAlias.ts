import { z } from "zod/v4";

const ALIAS_NAME_MAX_LENGTH = 128;

/** Alias name syntax. Resolve accepts any matching model before
 * authentication; whether the alias exists depends on the key's organization. */
export const GatewayAliasNameSchema = z
  .string()
  .min(1)
  .max(ALIAS_NAME_MAX_LENGTH)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    "Alias names may contain letters, digits, dots, underscores and hyphens",
  );

import { TRPCClientError } from "@trpc/client";

type ZodFlattenedError = {
  formErrors?: unknown;
  fieldErrors?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getErrorCode = (error: TRPCClientError<any>): string | undefined => {
  const code = (error.data as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : undefined;
};

const getZodError = (error: TRPCClientError<any>): ZodFlattenedError | null => {
  const zodError = (error.data as { zodError?: unknown } | undefined)?.zodError;
  if (!isRecord(zodError)) return null;
  return zodError as ZodFlattenedError;
};

const formatPath = (path: unknown): string => {
  if (!Array.isArray(path)) return "";
  return path
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join(".");
};

/**
 * Zod 4's `ZodError.message` is a JSON array of issues. tRPC puts that string
 * on `TRPCClientError.message`, which is what the global error toast shows.
 */
const parseZodIssueList = (
  message: string,
): Array<{ path: unknown; message: string }> | null => {
  const trimmed = message.trim();
  // tRPC sometimes prefixes the Zod 4 JSON issue list, e.g.
  // `Invalid input, [{ "code": "too_small", ... }]`.
  const start = trimmed.indexOf("[");
  if (start === -1) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed.slice(start));
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const issues: Array<{ path: unknown; message: string }> = [];
    for (const item of parsed) {
      if (!isRecord(item) || typeof item.message !== "string") return null;
      issues.push({ path: item.path, message: item.message });
    }
    return issues;
  } catch {
    return null;
  }
};

const formatFlattenedZodError = (
  zodError: ZodFlattenedError,
): string | null => {
  const lines: string[] = [];

  if (isRecord(zodError.fieldErrors)) {
    for (const [field, messages] of Object.entries(zodError.fieldErrors)) {
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        if (typeof message === "string" && message.length > 0) {
          lines.push(`${field}: ${message}`);
        }
      }
    }
  }

  if (Array.isArray(zodError.formErrors)) {
    for (const message of zodError.formErrors) {
      if (typeof message === "string" && message.length > 0) {
        lines.push(message);
      }
    }
  }

  return lines.length > 0 ? lines.join("\n") : null;
};

/**
 * True when a tRPC client error is Zod input validation (empty / too-short /
 * wrong-type fields), not an application bug.
 *
 * Matches either the Zod 4 JSON issue list on `error.message` or the flattened
 * `data.zodError` attached by the tRPC `errorFormatter`.
 */
export const isTrpcZodValidationError = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;
  if (getErrorCode(error) !== "BAD_REQUEST") return false;
  if (parseZodIssueList(error.message) !== null) return true;

  const zodError = getZodError(error);
  return zodError !== null && formatFlattenedZodError(zodError) !== null;
};

/** Human-readable field messages, or null when this is not a Zod validation error. */
export const formatTrpcZodValidationDescription = (
  error: unknown,
): string | null => {
  if (!(error instanceof TRPCClientError)) return null;

  const issues = parseZodIssueList(error.message);
  if (issues) {
    return issues
      .map((issue) => {
        const path = formatPath(issue.path);
        return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
      })
      .join("\n");
  }

  const zodError = getZodError(error);
  return zodError ? formatFlattenedZodError(zodError) : null;
};

import { createW3CTraceId, logger } from "@langfuse/shared/src/server";

export { createW3CTraceId };

export function compileTemplateString(
  template: string,
  context: Record<string, any>,
): string {
  try {
    return template.replace(/{{\s*([\w.]+)\s*}}/g, (match, key) => {
      if (key in context) {
        const value = context[key];
        return value === undefined || value === null ? "" : String(value);
      }
      return match; // missing key → return original variable including its braces
    });
  } catch (error) {
    logger.info("Template compilation error:", error);

    return template;
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate the retention cutoff date for a given number of retention days.
 * Returns a Date representing the timestamp before which data should be deleted.
 */
export const getRetentionCutoffDate = (
  retentionDays: number,
  referenceDate: Date = new Date(),
): Date => {
  return new Date(referenceDate.getTime() - retentionDays * MS_PER_DAY);
};

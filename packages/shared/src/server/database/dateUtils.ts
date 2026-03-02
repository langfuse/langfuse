import { isOceanBase } from "../../utils/oceanbase";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { convertDateToOceanBaseDateTime } from "../oceanbase/client";

/**
 * Convert a JavaScript Date or Unix timestamp to database-specific datetime format
 * Automatically selects the correct conversion function based on OCEANBASE_ENABLED
 * @param date - Date object or Unix timestamp (milliseconds since epoch, e.g., 1768470430401)
 */
export function convertDateToDateTime(date: Date | number): string {
  // If it's a Unix timestamp (number > 1000000000000 indicates milliseconds since epoch)
  // Convert it to a Date object first
  let dateObj: Date;
  if (typeof date === "number" && date > 1000000000000) {
    dateObj = new Date(date);
  } else if (date instanceof Date) {
    dateObj = date;
  } else {
    // If it's a number but not a valid timestamp, throw an error
    throw new Error(
      `Invalid date parameter: ${date}. Expected Date object or Unix timestamp (milliseconds).`,
    );
  }

  if (isOceanBase()) {
    return convertDateToOceanBaseDateTime(dateObj);
  }
  return convertDateToClickhouseDateTime(dateObj);
}

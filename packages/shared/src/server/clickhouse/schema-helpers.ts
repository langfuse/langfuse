import {
  isKeyOfObservationClickhouseRecord,
  isKeyOfScoreClickhouseRecord,
  isKeyOfTraceClickhouseRecord,
} from "./schema";

export const isColumnOnSchema = (table: string, column: string) => {
  if (table !== "traces" && table !== "observations" && table !== "scores") {
    throw new Error(`Unhandled table case: ${table}`);
  }

  switch (table) {
    case "traces":
      // check if column is in traces schema
      return isKeyOfTraceClickhouseRecord(column);
    case "observations":
      // check if column is in observations schema
      return isKeyOfObservationClickhouseRecord(column);
    case "scores":
      // check if column is in scores schema
      return isKeyOfScoreClickhouseRecord(column);
    default:
      const exhaustiveCheck: never = table;
      throw new Error(`Unhandled table case: ${exhaustiveCheck}`);
  }
};

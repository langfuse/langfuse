import { Prisma } from "../../db";

export const datasetItemMatchesVariable = (
  input: Prisma.JsonValue,
  variable: string,
) => {
  if (
    input === null ||
    input === undefined ||
    typeof input !== "object" ||
    Array.isArray(input)
  )
    return false;
  return Object.keys(input).includes(variable);
};

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

const isValidPrismaJsonObject = (
  input: Prisma.JsonValue,
): input is Prisma.JsonObject =>
  typeof input === "object" &&
  input !== null &&
  input !== undefined &&
  !Array.isArray(input);

/**
 * Validate dataset item input against prompt variables.
 * Allows plain strings if exactly one variable exists.
 */
export const validateDatasetItem = (
  itemInput: Prisma.JsonValue,
  variables: string[],
): boolean => {
  // String allowed if exactly 1 variable
  if (
    typeof itemInput === "string" &&
    itemInput !== "" &&
    variables.length === 1
  ) {
    return true;
  }

  // Object validation: must have at least one matching variable
  if (!isValidPrismaJsonObject(itemInput)) {
    return false;
  }

  return variables.some((variable) =>
    datasetItemMatchesVariable(itemInput, variable),
  );
};

/**
 * Normalize dataset item input to object format.
 * Auto-wraps strings into {variableName: string} for single-variable prompts.
 */
export const normalizeDatasetItemInput = (
  itemInput: Prisma.JsonValue,
  variables: string[],
): Prisma.JsonObject => {
  // Auto-wrap string for single variable
  if (typeof itemInput === "string" && variables.length === 1) {
    return { [variables[0]]: itemInput };
  }

  // Pass through objects
  if (isValidPrismaJsonObject(itemInput)) {
    return itemInput;
  }

  throw new Error("Invalid dataset item input");
};

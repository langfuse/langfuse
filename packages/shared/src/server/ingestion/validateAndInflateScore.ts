import {
  ScoreBodyWithoutConfig,
  ScoreConfigDomain,
  type ScoreDataTypeType,
  type ScoreDomain,
  ScorePropsAgainstConfig,
  ScoreDataTypeEnum,
  CORRECTION_NAME,
} from "../../../src";
import { prisma } from "../../db";
import { InvalidRequestError, LangfuseNotFoundError } from "../../errors";
import { validateDbScoreConfigSafe } from "../../features/scoreConfigs/validation";
import { ScoreEventType } from "./types";

type ValidateAndInflateScoreParams = {
  projectId: string;
  scoreId: string;
  body: ScoreEventType["body"];
};

export async function validateAndInflateScore(
  params: ValidateAndInflateScoreParams,
) {
  const { body, projectId, scoreId } = params;

  if (body.configId) {
    const config = await prisma.scoreConfig.findFirst({
      where: {
        projectId,
        id: body.configId,
      },
    });

    if (!config || !validateDbScoreConfigSafe(config).success)
      throw new LangfuseNotFoundError(
        "The configId you provided does not match a valid config in this project",
      );

    // Override some fields in the score body with config fields
    // We ignore the set fields in the body
    const bodyWithConfigOverrides = {
      ...body,
      name: config.name,
    };

    validateConfigAgainstBody({
      body: bodyWithConfigOverrides,
      config: config as ScoreConfigDomain,
      context: "INGESTION",
    });

    return inflateScoreBody({
      projectId,
      scoreId,
      body: bodyWithConfigOverrides,
      config: config as ScoreConfigDomain,
    });
  }

  const validation = ScoreBodyWithoutConfig.safeParse({
    ...body,
    dataType: body.dataType ?? inferDataType(body.value),
  });

  if (!validation.success) {
    throw new InvalidRequestError(
      `Ingested score value type not valid against provided data type. Provide numeric values for numeric and boolean scores, and string values for categorical scores.`,
    );
  }

  return inflateScoreBody(params);
}

function inferDataType(value: string | number): ScoreDataTypeType {
  return typeof value === "number"
    ? ScoreDataTypeEnum.NUMERIC
    : ScoreDataTypeEnum.CATEGORICAL;
}

function mapStringValueToNumericValue(
  config: ScoreConfigDomain,
  label: string,
): number {
  return (
    config.categories?.find((category) => category.label === label)?.value ?? 0
  );
}

function inflateScoreBody(
  params: ValidateAndInflateScoreParams & { config?: ScoreConfigDomain },
) {
  const { body, projectId, scoreId, config } = params;

  const relevantDataType = config?.dataType ?? body.dataType;
  const scoreProps = {
    ...body,
    longStringValue: "",
    source: body.source ?? "API",
    id: scoreId,
    projectId,
  };

  if (typeof body.value === "number") {
    if (relevantDataType && relevantDataType === ScoreDataTypeEnum.BOOLEAN) {
      return {
        ...scoreProps,
        value: body.value,
        stringValue: body.value === 1 ? "True" : "False",
        dataType: ScoreDataTypeEnum.BOOLEAN,
      };
    }

    return {
      ...scoreProps,
      value: body.value,
      stringValue: null,
      dataType: ScoreDataTypeEnum.NUMERIC,
    };
  }

  if (relevantDataType && relevantDataType === ScoreDataTypeEnum.CORRECTION) {
    // CORRECTION scores can only be associated with traces or observations
    if (body.sessionId) {
      throw new InvalidRequestError(
        "CORRECTION scores cannot be associated with sessions. Please associate with a trace or observation instead.",
      );
    }
    if (body.datasetRunId) {
      throw new InvalidRequestError(
        "CORRECTION scores cannot be associated with dataset runs. Please associate with a trace or observation instead.",
      );
    }

    return {
      ...scoreProps,
      value: 0,
      name: CORRECTION_NAME,
      longStringValue: body.value,
      stringValue: null,
      dataType: ScoreDataTypeEnum.CORRECTION,
    };
  }

  return {
    ...scoreProps,
    value: config ? mapStringValueToNumericValue(config, body.value) : 0,
    stringValue: body.value,
    dataType: ScoreDataTypeEnum.CATEGORICAL,
  };
}

type ScoreBodyWithContext =
  | {
      body: ScoreEventType["body"];
      context: "INGESTION";
    }
  | {
      body: ScoreDomain;
      context: "ANNOTATION";
    };

function resolveScoreValueIngestion(
  body: ScoreEventType["body"],
): string | number | null {
  return body.value;
}

function resolveScoreValueAnnotation(
  body: ScoreDomain,
): string | number | null {
  switch (body.dataType) {
    case ScoreDataTypeEnum.NUMERIC:
    case ScoreDataTypeEnum.BOOLEAN:
      return body.value;
    case ScoreDataTypeEnum.CATEGORICAL:
      return body.stringValue;
    case ScoreDataTypeEnum.CORRECTION:
      throw new Error("CORRECTION type not supported in annotation drawer");
  }
}

type ValidateConfigAgainstBodyParams = {
  config: ScoreConfigDomain;
} & ScoreBodyWithContext;

export function validateConfigAgainstBody({
  body,
  config,
  context,
}: ValidateConfigAgainstBodyParams): void {
  const { maxValue, minValue, categories, dataType: configDataType } = config;

  if (body.dataType && body.dataType !== configDataType) {
    throw new InvalidRequestError(
      `Data type mismatch based on config: expected ${configDataType}, got ${body.dataType}`,
    );
  }

  if (config.isArchived) {
    throw new InvalidRequestError(
      "Config is archived and cannot be used to create new scores. Please restore the config first.",
    );
  }

  if (config.name !== body.name) {
    throw new InvalidRequestError(
      `Name mismatch based on config: expected ${config.name}, got ${body.name}`,
    );
  }

  const relevantDataType = configDataType ?? body.dataType;
  const scoreValue =
    context === "INGESTION"
      ? resolveScoreValueIngestion(body)
      : resolveScoreValueAnnotation(body);

  const rangeValidation = ScorePropsAgainstConfig.safeParse({
    value: scoreValue,
    dataType: relevantDataType,
    ...(maxValue !== null && maxValue !== undefined && { maxValue }),
    ...(minValue !== null && minValue !== undefined && { minValue }),
    ...(categories && { categories }),
  });

  if (!rangeValidation.success) {
    const errorDetails = rangeValidation.error.issues
      .map((error) => `${error.path.join(".")} - ${error.message}`)
      .join(", ");

    throw new InvalidRequestError(
      `Ingested score body not valid against provided config: ${errorDetails}`,
    );
  }
}

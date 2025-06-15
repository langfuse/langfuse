import {
  ScoreBodyWithoutConfig,
  ScoreDomain,
  ScorePropsAgainstConfig,
  validateDbScoreConfigSafe,
  ValidatedScoreConfig,
} from "../../../src";
import { prisma, ScoreDataType } from "../../db";

import { InvalidRequestError, LangfuseNotFoundError } from "../../errors";

type ValidateAndInflateScoreParams = {
  projectId: string;
  scoreId: string;
  body: any;
};

export async function validateAndInflateScore(
  params: ValidateAndInflateScoreParams,
): Promise<ScoreDomain> {
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

    validateConfigAgainstBody(
      bodyWithConfigOverrides,
      config as ValidatedScoreConfig,
    );

    return inflateScoreBody({
      projectId,
      scoreId,
      body: bodyWithConfigOverrides,
      config: config as ValidatedScoreConfig,
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

function inferDataType(value: string | number): ScoreDataType {
  return typeof value === "number"
    ? ScoreDataType.NUMERIC
    : ScoreDataType.CATEGORICAL;
}

function mapStringValueToNumericValue(
  config: ValidatedScoreConfig,
  label: string,
): number | null {
  return (
    config.categories?.find((category) => category.label === label)?.value ??
    null
  );
}

function inflateScoreBody(
  params: ValidateAndInflateScoreParams & { config?: ValidatedScoreConfig },
): ScoreDomain {
  const { body, projectId, scoreId, config } = params;

  const relevantDataType = config?.dataType ?? body.dataType;
  const scoreProps = { source: "API", ...body, id: scoreId, projectId };

  if (typeof body.value === "number") {
    if (relevantDataType && relevantDataType === ScoreDataType.BOOLEAN) {
      return {
        ...scoreProps,
        value: body.value,
        stringValue: body.value === 1 ? "True" : "False",
        dataType: ScoreDataType.BOOLEAN,
      };
    }

    return {
      ...scoreProps,
      value: body.value,
      dataType: ScoreDataType.NUMERIC,
    };
  }

  return {
    ...scoreProps,
    value: config ? mapStringValueToNumericValue(config, body.value) : null,
    stringValue: body.value,
    dataType: ScoreDataType.CATEGORICAL,
  };
}

function validateConfigAgainstBody(
  body: any,
  config: ValidatedScoreConfig,
): void {
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

  const dataTypeValidation = ScoreBodyWithoutConfig.safeParse({
    ...body,
    dataType: relevantDataType,
  });

  if (!dataTypeValidation.success) {
    throw new InvalidRequestError(
      `Ingested score body not valid against provided config data type.`,
    );
  }

  const rangeValidation = ScorePropsAgainstConfig.safeParse({
    value: body.value,
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

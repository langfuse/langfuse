import { prisma } from "@langfuse/shared/src/db";
import {
  GetObservationV1Query,
  GetObservationV1Response,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  getObservationById,
  replaceIdentifierWithContent,
} from "@langfuse/shared/src/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Observation",
    querySchema: GetObservationV1Query,
    responseSchema: GetObservationV1Response,
    fn: async ({ query, auth }) => {
      const clickhouseObservation = await getObservationById({
        id: query.observationId,
        projectId: auth.scope.projectId,
        fetchWithInputOutput: true,
      });
      if (!clickhouseObservation) {
        throw new LangfuseNotFoundError(
          "Observation not found within authorized project",
        );
      }

      const model = clickhouseObservation.internalModelId
        ? await prisma.model.findFirst({
            where: {
              AND: [
                {
                  id: clickhouseObservation.internalModelId,
                },
                {
                  OR: [
                    {
                      projectId: auth.scope.projectId,
                    },
                    {
                      projectId: null,
                    },
                  ],
                },
              ],
            },
            include: {
              Price: true,
            },
            orderBy: {
              projectId: {
                sort: "desc",
                nulls: "last",
              },
            },
          })
        : undefined;

      // Generate unique identifiers for input/output replacement
      const inputIdentifier = `__OBS_INPUT_${Math.random().toString(36).substr(2, 9)}__`;
      const outputIdentifier = `__OBS_OUTPUT_${Math.random().toString(36).substr(2, 9)}__`;

      const observation = {
        ...clickhouseObservation,
        input: clickhouseObservation.input ? inputIdentifier : null,
        output: clickhouseObservation.output ? outputIdentifier : null,
        modelId: model?.id ?? null,
        inputPrice:
          model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
        outputPrice:
          model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
        totalPrice:
          model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
      };

      if (!observation) {
        throw new LangfuseNotFoundError(
          "Observation not found within authorized project",
        );
      }

      // Transform to API format and stringify
      const apiObservation = transformDbToApiObservation(observation);
      let stringified = JSON.stringify(apiObservation);

      // Replace identifiers with raw strings
      if (clickhouseObservation.input) {
        stringified = replaceIdentifierWithContent(
          stringified,
          inputIdentifier,
          clickhouseObservation.input,
        );
      }
      if (clickhouseObservation.output) {
        stringified = stringified.replace(
          `"${outputIdentifier}"`,
          clickhouseObservation.output,
        );
      }

      return JSON.parse(stringified);
    },
  }),
});

import { prisma } from "@langfuse/shared/src/db";
import {
  GetObservationV1Query,
  transformDbToApiObservation,
} from "@/src/features/public-api/types/observations";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  getObservationById,
  replaceIdentifierWithContent,
  clickhouseCompliantRandomCharacters,
} from "@langfuse/shared/src/server";
import { z } from "zod/v4";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Observation",
    querySchema: GetObservationV1Query,
    responseSchema: z.string(),
    fn: async ({ query, auth, res }) => {
      const clickhouseObservation = await getObservationById({
        id: query.observationId,
        projectId: auth.scope.projectId,
        fetchWithInputOutput: true,
        convertToString: true,
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
      const inputIdentifier = clickhouseCompliantRandomCharacters();
      const outputIdentifier = clickhouseCompliantRandomCharacters();

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

      // Replace identifiers with actual content
      if (clickhouseObservation.input) {
        stringified = replaceIdentifierWithContent(
          stringified,
          inputIdentifier,
          clickhouseObservation.input,
        );
      }
      if (clickhouseObservation.output) {
        stringified = replaceIdentifierWithContent(
          stringified,
          outputIdentifier,
          clickhouseObservation.output,
        );
      }

      res.setHeader("Content-Type", "application/json");
      return stringified;
    },
  }),
});

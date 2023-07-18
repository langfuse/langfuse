import { prisma } from "@/src/server/db";
import { Neurons } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";

const NeuronsCreateSchema = z.object({
  id: z.string().nullish(),
  ownerId: z.string().nullish(),
  projectId: z.string().nullish(),
  rank: z.number().nullish(),
  stake: z.number().nullish(),
  emission: z.number().nullish(),
  incentive: z.number().nullish(),
  consensus: z.number().nullish(),
  trust: z.number().nullish(),
});

const NeuronPatchSchema = z.object({
  neuronId: z.string(),
  rank: z.number(),
  stake: z.number().nullish(),
  emission: z.number().nullish(),
  incentive: z.number().nullish(),
  consensus: z.number().nullish(),
  trust: z.number().nullish(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await runMiddleware(req, res, cors);

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      success: false,
      message: authCheck.error,
    });
  // END CHECK AUTH

  if (req.method === "POST") {
    try {
      const obj = NeuronsCreateSchema.parse(req.body);
      const {
        id,
        ownerId,
        projectId,
        rank,
        stake,
        emission,
        incentive,
        consensus,
        trust,
      } = obj;

      // CHECK ACCESS SCOPE
      const accessCheck = await checkApiAccessScope(authCheck.scope, [
        { type: "project", id: projectId ? projectId : "" },
      ]);
      if (!accessCheck)
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      // END CHECK ACCESS SCOPE

      const newNeuron = await prisma.neurons.create({
        data: {
          id: id ?? undefined,
          owner: { connect: { id: ownerId ? ownerId : "" } },
          project: { connect: { id: projectId ? projectId : "" } },
          rank: rank ? rank : 0,
          stake: stake ? stake : 0,
          emission: emission ? emission : 0,
          incentive: incentive ? incentive : 0,
          consensus: consensus ? consensus : 0,
          trust: trust ? trust : 0,
        },
      });

      res.status(200).json(newNeuron);
    } catch (error: unknown) {
      console.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(400).json({
        success: false,
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else if (req.method === "PATCH") {
    try {
      const { neuronId, ...fields } = NeuronPatchSchema.parse(req.body);

      // CHECK ACCESS SCOPE
      const accessCheck = await checkApiAccessScope(authCheck.scope, [
        { type: "neuron", id: neuronId },
      ]);
      if (!accessCheck)
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      // END CHECK ACCESS SCOPE

      const updatedNeuron = await prisma.neurons.update({
        where: { id: neuronId },
        data: Object.fromEntries(
          Object.entries(fields).filter(
            ([_, v]) => v !== null && v !== undefined
          )
        ),
      });

      res.status(200).json(updatedNeuron);
    } catch (error: unknown) {
      console.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(400).json({
        success: false,
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else {
    return res.status(405).json({ message: "Method not allowed" });
  }
}

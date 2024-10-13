import { z } from "zod";
import {
  jsonSchema,
  paginationZod,
  paginationMetaResponseZod,
  queryStringZod,
} from "@langfuse/shared";
import { stringDateTime} from "@langfuse/shared/src/server";

export const APIUser = z
  .object({
    userId: z.string(),
    lastTrace : stringDateTime.nullable(),
  })
  .strict();

export const GetUsersQuery = z.object({
  ...paginationZod,
});

export const GetUsersResponse = z.object({
  users: z.array(APIUser), // dataset run names
}).strict();

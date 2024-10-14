import { z } from "zod";
import {
  paginationMetaResponseZod,
  paginationZod,
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
  data: z.array(APIUser), // users
  meta: paginationMetaResponseZod,
}).strict();

import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@/src/utils/zod";

const AlertFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  ...paginationZod,
});

export const alertsRouter = createTRPCRouter({
  all: protectedProjectProcedure.input(AlertFilterOptions).query(async () => {
    const alerts = [
      {
        id: "1",
        name: "Alert 1",
        triggerAttribute: "cost",
        triggerOperator: ">",
        triggerValue: 100,
      },
    ];
    return Promise.resolve(alerts);
  }),
});

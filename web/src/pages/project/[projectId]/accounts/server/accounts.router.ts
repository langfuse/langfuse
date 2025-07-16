import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

export const accountsRouter = createTRPCRouter({
  getUsers: protectedProjectProcedure.query(async ({ ctx }) => {}),
});

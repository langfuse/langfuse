/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 */
import { type CreateNextContextOptions } from "@trpc/server/adapters/next";
import { type Session } from "next-auth";

import { getServerAuthSession } from "@/src/server/auth";
import { prisma } from "@langfuse/shared/src/db";
import * as Sentry from "@sentry/node";
import * as z from "zod";

type CreateContextOptions = {
  session: Session | null;
};

/**
 * This helper generates the "internals" for a tRPC context. If you need to use it, you can export
 * it from here.
 *
 * Examples of things you may need it for:
 * - testing, so we don't have to mock Next.js' req/res
 * - tRPC's `createSSGHelpers`, where we don't have req/res
 *
 * @see https://create.t3.gg/en/usage/trpc#-serverapitrpcts
 */
export const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    session: opts.session,
    prisma,
    DB,
  };
};

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 *
 * @see https://trpc.io/docs/context
 */
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts;

  // Get the session from the server using the getServerSession wrapper function
  const session = await getServerAuthSession({ req, res });

  Sentry.setUser({
    id: session?.user?.id,
    email: session?.user?.email ?? undefined,
    username: session?.user?.name ?? undefined,
  });

  return createInnerTRPCContext({
    session,
  });
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { setUpSuperjson } from "@/src/utils/superjson";
import { DB } from "@/src/server/db";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";

setUpSuperjson();

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

// sentry setup
const sentryMiddleware = t.middleware(
  Sentry.trpcMiddleware({
    attachRpcInput: true,
  }),
);
const withSentryProcedure = t.procedure.use(sentryMiddleware);
/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */

export const publicProcedure = withSentryProcedure;

/** Reusable middleware that enforces users are logged in before running the procedure. */
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = withSentryProcedure.use(enforceUserIsAuthed);

const inputProjectSchema = z.object({
  projectId: z.string(),
});

/**
 * Protected (authenticated) procedure with project role
 */

const enforceUserIsAuthedAndProjectMember = t.middleware(
  ({ ctx, rawInput, next }) => {
    if (!ctx.session || !ctx.session.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const result = inputProjectSchema.safeParse(rawInput);
    if (!result.success)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid input, projectId is required",
      });

    // check that the user is a member of this project
    const projectId = result.data.projectId;
    const sessionProject = ctx.session.user.projects.find(
      ({ id }) => id === projectId,
    );

    if (!sessionProject && !isProjectMemberOrAdmin(ctx.session.user, projectId))
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User is not a member of this project",
      });

    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: {
          ...ctx.session,
          user: ctx.session.user,
          projectRole:
            ctx.session.user.admin === true ? "ADMIN" : sessionProject!.role,
          projectId: projectId,
        },
      },
    });
  },
);

export const protectedProjectProcedure = withSentryProcedure.use(
  enforceUserIsAuthedAndProjectMember,
);

/*
 * Protect trace-level getter routes.
 * - Users need to be member of the project to access the trace.
 * - Alternatively, the trace needs to be public.
 */

const inputTraceSchema = z.object({
  traceId: z.string(),
});

const enforceTraceAccess = t.middleware(async ({ ctx, rawInput, next }) => {
  const result = inputTraceSchema.safeParse(rawInput);
  if (!result.success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid input, traceId is required",
    });

  const traceId = result.data.traceId;

  const trace = await prisma.trace.findFirst({
    where: {
      id: traceId,
    },
    select: {
      public: true,
      projectId: true,
    },
  });

  if (!trace)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Trace not found",
    });

  const sessionProject = ctx.session?.user?.projects.find(
    ({ id }) => id === trace.projectId,
  );

  if (
    !trace.public &&
    !sessionProject &&
    !isProjectMemberOrAdmin(ctx.session?.user, trace.projectId)
  )
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "User is not a member of this project and this trace is not public",
    });

  return next({
    ctx: {
      session: {
        ...ctx.session,
        projectRole:
          ctx.session?.user?.admin === true ? "ADMIN" : sessionProject?.role,
      },
    },
  });
});

export const protectedGetTraceProcedure =
  withSentryProcedure.use(enforceTraceAccess);

/*
 * Protect session-level getter routes.
 * - Users need to be member of the project to access the trace.
 * - Alternatively, the trace needs to be public.
 */

const inputSessionSchema = z.object({
  sessionId: z.string(),
  projectId: z.string(),
});

const enforceSessionAccess = t.middleware(async ({ ctx, rawInput, next }) => {
  const result = inputSessionSchema.safeParse(rawInput);
  if (!result.success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid input, sessionId is required",
    });

  const { sessionId, projectId } = result.data;

  const session = await prisma.traceSession.findFirst({
    where: {
      id: sessionId,
      projectId,
    },
    select: {
      public: true,
    },
  });

  if (!session)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Session not found",
    });

  const userSessionProject = ctx.session?.user?.projects.find(
    ({ id }) => id === projectId,
  );

  if (
    !session.public &&
    !userSessionProject &&
    ctx.session?.user?.admin !== true
  )
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "User is not a member of this project and this session is not public",
    });

  return next({
    ctx: {
      session: {
        ...ctx.session,
        projectRole:
          ctx.session?.user?.admin === true
            ? "ADMIN"
            : userSessionProject?.role,
      },
    },
  });
});

export const protectedGetSessionProcedure =
  withSentryProcedure.use(enforceSessionAccess);

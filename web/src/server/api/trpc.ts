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
import { tracing } from "@baselime/trpc-opentelemetry-middleware";
import { getServerAuthSession } from "@/src/server/auth";
import { prisma, Role } from "@langfuse/shared/src/db";
import * as z from "zod/v4";
import * as opentelemetry from "@opentelemetry/api";
import { type IncomingHttpHeaders } from "node:http";
import { getTRPCErrorCodeFromHTTPStatusCode } from "@/src/server/utils/trpc-utils";

type CreateContextOptions = {
  session: Session | null;
  headers: IncomingHttpHeaders;
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
    headers: opts.headers,
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

  // Get the headers from the request
  const headers = req.headers;

  addUserToSpan({
    userId: session?.user?.id,
    email: session?.user?.email ?? undefined,
  });

  return createInnerTRPCContext({ session, headers });
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import superjson from "superjson";
import { ZodError } from "zod/v4";
import { setUpSuperjson } from "@/src/utils/superjson";
import { DB } from "@/src/server/db";
import {
  getTraceById,
  logger,
  addUserToSpan,
  contextWithLangfuseProps,
  ClickHouseResourceError,
} from "@langfuse/shared/src/server";

import { AdminApiAuthService } from "@/src/ee/features/admin-api/server/adminApiAuth";
import { env } from "@/src/env.mjs";
import { BaseError, parseIO } from "@langfuse/shared";

setUpSuperjson();

const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

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

const resolveError = (error: TRPCError) => {
  if (error.cause instanceof BaseError) {
    return {
      code: getTRPCErrorCodeFromHTTPStatusCode(error.cause.httpCode),
      httpStatus: error.cause.httpCode,
    };
  }
  return { code: error.code, httpStatus: getHTTPStatusCodeFromError(error) };
};

const logErrorByCode = (errorCode: TRPCError["code"], error: TRPCError) => {
  if (errorCode === "NOT_FOUND" || errorCode === "UNAUTHORIZED") {
    logger.info(`middleware intercepted error with code ${errorCode}`, {
      error,
    });
  } else if (errorCode === "UNPROCESSABLE_CONTENT") {
    logger.warn(`middleware intercepted error with code ${errorCode}`, {
      error,
    });
  } else {
    logger.error(`middleware intercepted error with code ${errorCode}`, {
      error,
    });
  }
};

// global error handling
const withErrorHandling = t.middleware(async ({ ctx, next }) => {
  const res = await next({ ctx }); // pass the context to the next middleware

  if (!res.ok) {
    if (res.error.cause instanceof ClickHouseResourceError) {
      // Surface ClickHouse errors using an advice message
      // which is supposed to provide a bit of guidance to the user.
      logErrorByCode("UNPROCESSABLE_CONTENT", res.error);
      res.error = new TRPCError({
        code: "UNPROCESSABLE_CONTENT",
        message: ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
      });
    } else {
      // Throw a new TRPC error with:
      // - The same error code as the original error
      // - Either the original error message OR "Internal error" if it's a 5xx error
      const { code, httpStatus } = resolveError(res.error);
      const isSafeToExpose = httpStatus >= 400 && httpStatus < 500;
      const errorMessage = isLangfuseCloud
        ? "We have been notified and are working on it."
        : "Please check error logs in your self-hosted deployment.";

      logErrorByCode(code, res.error);
      res.error = new TRPCError({
        code,
        cause: null, // do not expose stack traces
        message: isSafeToExpose
          ? res.error.message
          : "Internal error. " + errorMessage,
      });
    }
  }

  return res;
});

// otel setup with proper context propagation
const withOtelInstrumentation = t.middleware(async (opts) => {
  // In tRPC v11, input is lazy-loaded and must be accessed via getRawInput()
  const actualInput = await opts.getRawInput();

  const baggageCtx = contextWithLangfuseProps({
    headers: opts.ctx.headers,
    userId: opts.ctx.session?.user?.id,
    projectId: (actualInput as Record<string, string>)?.projectId,
  });

  // Execute the next middleware/procedure with our context
  return opentelemetry.context.with(baggageCtx, () => opts.next());
});

// otel setup
const withOtelTracingProcedure = t.procedure
  .use(withOtelInstrumentation)
  .use(tracing({ collectInput: true, collectResult: true }));

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */

export const publicProcedure = withOtelTracingProcedure.use(withErrorHandling);

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
export const authenticatedProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceUserIsAuthed);

export const protectedProcedureWithoutTracing = t.procedure
  .use(withErrorHandling)
  .use(enforceUserIsAuthed);

const inputProjectSchema = z.object({
  projectId: z.string(),
});

/**
 * Protected (authenticated) procedure with project role
 */

const enforceUserIsAuthedAndProjectMember = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const actualInput = await opts.getRawInput();
  const parsedInput = inputProjectSchema.safeParse(actualInput);
  if (!parsedInput.success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid input, projectId is required",
    });

  // check that the user is a member of this project
  const projectId = parsedInput.data.projectId;
  const sessionProject = ctx.session.user.organizations
    .flatMap((org) =>
      org.projects.map((project) => ({ ...project, organization: org })),
    )
    .find((project) => project.id === projectId);

  if (!sessionProject) {
    if (ctx.session.user.admin === true) {
      // fetch org as it is not available in the session for admins
      const dbProject = await ctx.prisma.project.findFirst({
        select: {
          orgId: true,
        },
        where: {
          id: projectId,
          deletedAt: null,
        },
      });
      if (!dbProject) {
        logger.error(`Project with ${projectId} id not found`);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }
      return next({
        ctx: {
          // infers the `session` as non-nullable
          session: {
            ...ctx.session,
            user: ctx.session.user,
            orgId: dbProject.orgId,
            orgRole: Role.OWNER,
            projectId: projectId,
            projectRole: Role.OWNER,
          },
        },
      });
    }
    // not a member
    logger.warn(`User is not a member of this project with id ${projectId}`);
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User is not a member of this project",
    });
  }

  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: {
        ...ctx.session,
        user: ctx.session.user,
        orgId: sessionProject.organization.id,
        orgRole: sessionProject.organization.role,
        projectId: projectId,
        projectRole: sessionProject.role,
      },
    },
  });
});

export const protectedProjectProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceUserIsAuthedAndProjectMember);

export const protectedProjectProcedureWithoutTracing = t.procedure
  .use(withErrorHandling)
  .use(enforceUserIsAuthedAndProjectMember);

const inputOrganizationSchema = z.object({
  orgId: z.string(),
});

const enforceIsAuthedAndOrgMember = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const actualInput = await opts.getRawInput();
  const result = inputOrganizationSchema.safeParse(actualInput);
  if (!result.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid input, orgId is required",
    });
  }

  const orgId = result.data.orgId;
  const sessionOrg = ctx.session.user.organizations.find(
    (org) => org.id === orgId,
  );

  if (!sessionOrg && ctx.session.user.admin !== true) {
    logger.error(`User ${ctx.session.user.id} is not a member of org ${orgId}`);
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User is not a member of this organization",
    });
  }

  return next({
    ctx: {
      session: {
        ...ctx.session,
        user: ctx.session.user,
        orgId: orgId,
        orgRole:
          ctx.session.user.admin === true ? Role.OWNER : sessionOrg!.role,
      },
    },
  });
});

export const protectedOrganizationProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceIsAuthedAndOrgMember);

/*
 * Protect trace-level getter routes.
 * - Users need to be member of the project to access the trace.
 * - Alternatively, the trace needs to be public.
 */

const inputTraceSchema = z.object({
  traceId: z.string(),
  projectId: z.string(),
  timestamp: z.date().nullish(),
  fromTimestamp: z.date().nullish(),
  truncated: z.boolean().default(false),
  verbosity: z.enum(["compact", "truncated", "full"]).default("full"),
});

const enforceTraceAccess = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const actualInput = await opts.getRawInput();
  const result = inputTraceSchema.safeParse(actualInput);

  if (!result.success) {
    logger.error("Invalid input when parsing request body", result.error);
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid input, ${result.error.message}`,
    });
  }

  const traceId = result.data.traceId;
  const projectId = result.data.projectId;
  const timestamp = result.data.timestamp;
  const fromTimestamp = result.data.fromTimestamp;
  const verbosity = result.data.verbosity;

  const clickhouseTrace = await getTraceById({
    traceId,
    projectId,
    timestamp: timestamp ?? undefined,
    fromTimestamp: fromTimestamp ?? undefined,
    renderingProps: {
      truncated: verbosity === "truncated",
      shouldJsonParse: false, // we do not want to parse the input/output for tRPC
    },
    clickhouseFeatureTag: "tracing-trpc",
  });

  if (!clickhouseTrace) {
    logger.error(`Trace with id ${traceId} not found for project ${projectId}`);
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Trace not found",
    });
  }

  const trace = {
    ...clickhouseTrace,
    input: parseIO(clickhouseTrace.input, verbosity),
    output: parseIO(clickhouseTrace.output, verbosity),
  };

  const sessionProject = ctx.session?.user?.organizations
    .flatMap((org) => org.projects)
    .find(({ id }) => id === projectId);

  const traceSession = !!trace.sessionId
    ? await ctx.prisma.traceSession.findFirst({
        where: {
          id: trace.sessionId,
          projectId,
        },
        select: {
          public: true,
        },
      })
    : null;

  const isSessionPublic = traceSession?.public === true;

  if (
    !trace.public &&
    !sessionProject &&
    !isSessionPublic &&
    ctx.session?.user?.admin !== true
  ) {
    logger.error(
      `User ${ctx.session?.user?.id} is not a member of project ${projectId}`,
    );
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "User is not a member of this project and this trace is not public",
    });
  }
  return next({
    ctx: {
      session: {
        ...ctx.session,
        projectRole:
          ctx.session?.user?.admin === true ? Role.OWNER : sessionProject?.role,
      },
      trace, // pass the trace to the next middleware so we do not need to fetch it again
    },
  });
});

export const protectedGetTraceProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceTraceAccess);

/*
 * Protect session-level getter routes.
 * - Users need to be member of the project to access the trace.
 * - Alternatively, the trace needs to be public.
 */

const inputSessionSchema = z.object({
  sessionId: z.string(),
  projectId: z.string(),
});

const enforceSessionAccess = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const actualInput = await opts.getRawInput();
  const result = inputSessionSchema.safeParse(actualInput);
  if (!result.success)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid input, sessionId is required",
    });

  const { sessionId, projectId } = result.data;

  // trace sessions are stored in postgres. No need to check for clickhouse eligibility.
  const session = await prisma.traceSession.findFirst({
    where: {
      id: sessionId,
      projectId,
    },
    select: {
      public: true,
    },
  });

  if (!session) {
    logger.error(
      `Session with id ${sessionId} not found for project ${projectId}`,
    );
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Session not found",
    });
  }

  const userSessionProject = ctx.session?.user?.organizations
    .flatMap((org) => org.projects)
    .find(({ id }) => id === projectId);

  if (
    !session.public &&
    !userSessionProject &&
    ctx.session?.user?.admin !== true
  ) {
    logger.error(
      `User ${ctx.session?.user?.id} is not a member of project ${projectId}`,
    );
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message:
        "User is not a member of this project and this session is not public",
    });
  }

  return next({
    ctx: {
      session: {
        ...ctx.session,
        projectRole:
          ctx.session?.user?.admin === true
            ? Role.OWNER
            : userSessionProject?.role,
      },
    },
  });
});

export const protectedGetSessionProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceSessionAccess);

const inputAdminSchema = z.object({
  adminApiKey: z.string(),
});

/** Reusable middleware that enforces admin API key authentication */
const enforceAdminAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  const actualInput = await opts.getRawInput();
  const result = inputAdminSchema.safeParse(actualInput);
  if (!result.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid input, adminApiKey is required",
    });
  }

  const adminAuthResult = AdminApiAuthService.verifyAdminAuthFromAuthString(
    result.data.adminApiKey,
  );

  if (!adminAuthResult.isAuthorized) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: adminAuthResult.error,
    });
  }

  return next({
    ctx,
  });
});

/**
 * Admin authenticated procedure
 *
 * This procedure requires a valid admin API key in the Authorization header.
 * It should be used for sensitive operations that require admin-level access.
 */
export const adminProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceAdminAuth);

// Export context types for easier reuse
// Base context from createTRPCContext
export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
// After `enforceUserIsAuthed`: session & user are non-null
export type AuthedSession = NonNullable<TRPCContext["session"]> & {
  user: NonNullable<NonNullable<TRPCContext["session"]>["user"]>;
};
export type AuthedContext = Omit<TRPCContext, "session"> & {
  session: AuthedSession;
};
// After `enforceUserIsAuthedAndProjectMember`: extra fields guaranteed
export type ProjectAuthedContext = Omit<TRPCContext, "session"> & {
  session: AuthedSession & {
    orgId: string;
    orgRole: Role;
    projectId: string;
    projectRole: Role;
  };
};
// After `enforceIsAuthedAndOrgMember`
export type OrgAuthedContext = Omit<TRPCContext, "session"> & {
  session: AuthedSession & {
    orgId: string;
    orgRole: Role;
  };
};

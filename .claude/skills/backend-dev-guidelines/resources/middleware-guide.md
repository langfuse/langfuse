# Middleware Guide - tRPC & Public API Patterns

Complete guide to middleware patterns in Langfuse's Next.js + tRPC architecture.

## Table of Contents

- [tRPC Middleware](#trpc-middleware)
- [Public API Middleware](#public-api-middleware)
- [Authentication Patterns](#authentication-patterns)
- [Error Handling Middleware](#error-handling-middleware)
- [OpenTelemetry Instrumentation](#opentelemetry-instrumentation)
- [Composable Procedures](#composable-procedures)

---

## tRPC Middleware

**File:** `web/src/server/api/trpc.ts`

tRPC middleware in Langfuse is composable and type-safe. Each middleware enriches the context and provides guarantees to subsequent middleware.

### Core tRPC Middlewares

**1. Error Handling Middleware (`withErrorHandling`)**

Intercepts all errors and transforms them into user-friendly tRPC errors:

```typescript
const withErrorHandling = t.middleware(async ({ ctx, next }) => {
  const res = await next({ ctx });

  if (!res.ok) {
    if (res.error.cause instanceof ClickHouseResourceError) {
      // Surface ClickHouse resource errors with advice message
      res.error = new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
      });
    } else {
      // Transform 5xx errors to not expose internals
      const { code, httpStatus } = resolveError(res.error);
      const isSafeToExpose = httpStatus >= 400 && httpStatus < 500;

      res.error = new TRPCError({
        code,
        cause: null, // do not expose stack traces
        message: isSafeToExpose
          ? res.error.message
          : "Internal error. We have been notified and are working on it.",
      });
    }
  }

  return res;
});
```

**2. OpenTelemetry Instrumentation (`withOtelInstrumentation`)**

Propagates OpenTelemetry context with Langfuse-specific baggage:

```typescript
const withOtelInstrumentation = t.middleware(async (opts) => {
  const actualInput = await opts.getRawInput();

  const baggageCtx = contextWithLangfuseProps({
    headers: opts.ctx.headers,
    userId: opts.ctx.session?.user?.id,
    projectId: (actualInput as Record<string, string>)?.projectId,
  });

  return opentelemetry.context.with(baggageCtx, () => opts.next());
});
```

**3. Authentication Middleware (`enforceUserIsAuthed`)**

Ensures user is logged in via NextAuth session:

```typescript
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
```

**4. Project Membership Middleware (`enforceUserIsAuthedAndProjectMember`)**

Validates that the user is a member of the project specified in input:

```typescript
const enforceUserIsAuthedAndProjectMember = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const actualInput = await opts.getRawInput();
  const parsedInput = inputProjectSchema.safeParse(actualInput);

  if (!parsedInput.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid input, projectId is required",
    });
  }

  const projectId = parsedInput.data.projectId;
  const sessionProject = ctx.session.user.organizations
    .flatMap((org) => org.projects.map((project) => ({ ...project, organization: org })))
    .find((project) => project.id === projectId);

  if (!sessionProject) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User is not a member of this project",
    });
  }

  return next({
    ctx: {
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
```

**5. Organization Membership Middleware (`enforceIsAuthedAndOrgMember`)**

Validates organization membership:

```typescript
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
  const sessionOrg = ctx.session.user.organizations.find((org) => org.id === orgId);

  if (!sessionOrg && ctx.session.user.admin !== true) {
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
        orgRole: ctx.session.user.admin === true ? Role.OWNER : sessionOrg!.role,
      },
    },
  });
});
```

**6. Trace Access Middleware (`enforceTraceAccess`)**

Special middleware for trace-level routes that supports public traces:

```typescript
const enforceTraceAccess = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const actualInput = await opts.getRawInput();
  const result = inputTraceSchema.safeParse(actualInput);

  if (!result.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid input" });
  }

  const trace = await getTraceById({
    traceId: result.data.traceId,
    projectId: result.data.projectId,
    timestamp: result.data.timestamp ?? undefined,
  });

  if (!trace) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Trace not found" });
  }

  const sessionProject = ctx.session?.user?.organizations
    .flatMap((org) => org.projects)
    .find(({ id }) => id === result.data.projectId);

  // Allow access if:
  // 1. User is a project member
  // 2. Trace is public
  // 3. User is admin
  if (!trace.public && !sessionProject && ctx.session?.user?.admin !== true) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User is not a member of this project and this trace is not public",
    });
  }

  return next({
    ctx: {
      session: { ...ctx.session, projectRole: sessionProject?.role },
      trace: trace, // pass the trace to avoid refetching
    },
  });
});
```

### tRPC Procedure Types

Langfuse exports composed procedures with middleware chains:

```typescript
// 1. Public procedure (no auth required)
export const publicProcedure = withOtelTracingProcedure.use(withErrorHandling);

// 2. Authenticated procedure (NextAuth session required)
export const authenticatedProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceUserIsAuthed);

// 3. Project-scoped procedure (project membership required)
export const protectedProjectProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceUserIsAuthedAndProjectMember);

// 4. Organization-scoped procedure
export const protectedOrganizationProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceIsAuthedAndOrgMember);

// 5. Trace access procedure (public traces supported)
export const protectedGetTraceProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceTraceAccess);

// 6. Session access procedure
export const protectedGetSessionProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceSessionAccess);

// 7. Admin API key procedure (for admin operations)
export const adminProcedure = withOtelTracingProcedure
  .use(withErrorHandling)
  .use(enforceAdminAuth);
```

---

## Public API Middleware

**Files:** `web/src/features/public-api/server/`

### withMiddlewares Pattern

Wraps all public API routes with CORS, error handling, and OpenTelemetry:

```typescript
export function withMiddlewares(handlers: Handlers) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const ctx = contextWithLangfuseProps({ headers: req.headers });

    return opentelemetry.context.with(ctx, async () => {
      try {
        // 1. CORS middleware
        await runMiddleware(req, res, cors);

        // 2. HTTP method routing
        const method = req.method as HttpMethod;
        if (!handlers[method]) throw new MethodNotAllowedError();

        // 3. Execute handler
        return await handlers[method](req, res);
      } catch (error) {
        // 4. Error handling
        if (error instanceof BaseError) {
          if (error.httpCode >= 500) traceException(error);

          return res.status(error.httpCode).json({
            message: error.message,
            error: error.name,
          });
        }

        if (error instanceof ClickHouseResourceError) {
          return res.status(524).json({
            message: ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
            error: "Request is taking too long to process.",
          });
        }

        if (isZodError(error)) {
          return res.status(400).json({
            message: "Invalid request data",
            error: error.issues,
          });
        }

        traceException(error);
        return res.status(500).json({
          message: "Internal Server Error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
  };
}
```

**Usage:**

```typescript
// web/src/pages/api/public/datasets/[datasetName]/items.ts
export default withMiddlewares({
  GET: getDatasetItemsHandler,
  POST: createDatasetItemHandler,
});
```

### createAuthedProjectAPIRoute Pattern

Factory function for authenticated public API routes with:
- Authentication (Basic auth or Admin API key)
- Rate limiting
- Input/output validation (Zod)
- OpenTelemetry context

```typescript
export const createAuthedProjectAPIRoute = <TQuery, TBody, TResponse>(
  routeConfig: RouteConfig<TQuery, TBody, TResponse>
) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // 1. Authentication (verifyAuth)
    const auth = await verifyAuth(req, routeConfig.isAdminApiKeyAuthAllowed || false);

    // 2. Rate limiting
    const rateLimitResponse = await RateLimitService.getInstance().rateLimitRequest(
      auth.scope,
      routeConfig.rateLimitResource || "public-api"
    );

    if (rateLimitResponse?.isRateLimited()) {
      return rateLimitResponse.sendRestResponseIfLimited(res);
    }

    // 3. Input validation
    const query = routeConfig.querySchema
      ? routeConfig.querySchema.parse(req.query)
      : {};
    const body = routeConfig.bodySchema
      ? routeConfig.bodySchema.parse(req.body)
      : {};

    // 4. Execute with OpenTelemetry context
    const ctx = contextWithLangfuseProps({
      headers: req.headers,
      projectId: auth.scope.projectId,
    });

    return opentelemetry.context.with(ctx, async () => {
      const response = await routeConfig.fn({ query, body, req, res, auth });

      // 5. Response validation (dev only)
      if (env.NODE_ENV === "development" && routeConfig.responseSchema) {
        const parsingResult = routeConfig.responseSchema.safeParse(response);
        if (!parsingResult.success) {
          logger.error("Response validation failed:", parsingResult.error);
        }
      }

      res.status(routeConfig.successStatusCode || 200).json(response);
    });
  };
};
```

**Usage:**

```typescript
// web/src/pages/api/public/traces/[traceId].ts
export default createAuthedProjectAPIRoute({
  name: "Get Trace",
  querySchema: GetTraceV1Query,
  responseSchema: GetTraceV1Response,
  fn: async ({ query, auth }) => {
    const trace = await getTraceById({
      traceId: query.traceId,
      projectId: auth.scope.projectId,
    });

    return transformTraceToApiResponse(trace);
  },
});
```

---

## Authentication Patterns

### tRPC Authentication (NextAuth)

tRPC uses NextAuth sessions stored in JWT cookies:

```typescript
// Context creation with session
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts;
  const session = await getServerAuthSession({ req, res });

  addUserToSpan({
    userId: session?.user?.id,
    email: session?.user?.email ?? undefined,
  });

  return {
    session,
    headers: req.headers,
    prisma,
    DB,
  };
};
```

**Session types:**

```typescript
// Base authenticated context
export type AuthedContext = {
  session: { user: NonNullable<Session["user"]> };
};

// Project-scoped context
export type ProjectAuthedContext = {
  session: AuthedContext["session"] & {
    orgId: string;
    orgRole: Role;
    projectId: string;
    projectRole: Role;
  };
};
```

### Public API Authentication

Public APIs use **Basic Auth** with API keys:

```typescript
async function verifyBasicAuth(authHeader: string | undefined) {
  const regularAuth = await new ApiAuthService(prisma, redis)
    .verifyAuthHeaderAndReturnScope(authHeader);

  if (!regularAuth.validKey) {
    throw { status: 401, message: regularAuth.error };
  }

  if (regularAuth.scope.accessLevel !== "project") {
    throw { status: 401, message: "Access denied - need basic auth with secret key" };
  }

  return regularAuth;
}
```

**Admin API Key Authentication** (self-hosted only):

```typescript
async function verifyAdminApiKeyAuth(req: NextApiRequest) {
  // Requires:
  // 1. Authorization: Bearer <ADMIN_API_KEY>
  // 2. x-langfuse-admin-api-key: <ADMIN_API_KEY>
  // 3. x-langfuse-project-id: <project-id>

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw { status: 403, message: "Admin API key auth not available on Langfuse Cloud" };
  }

  const adminApiKey = env.ADMIN_API_KEY;
  const bearerToken = req.headers.authorization?.replace("Bearer ", "");
  const adminApiKeyHeader = req.headers["x-langfuse-admin-api-key"];

  // Timing-safe comparison
  const isValid =
    crypto.timingSafeEqual(Buffer.from(bearerToken), Buffer.from(adminApiKey)) &&
    crypto.timingSafeEqual(Buffer.from(adminApiKeyHeader), Buffer.from(adminApiKey));

  if (!isValid) throw { status: 401, message: "Invalid admin API key" };

  const projectId = req.headers["x-langfuse-project-id"];
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) throw { status: 404, message: "Project not found" };

  return { validKey: true, scope: { projectId, accessLevel: "project" } };
}
```

---

## Error Handling Middleware

### tRPC Error Transformation

All tRPC errors go through `withErrorHandling` middleware:

**Error types handled:**

1. **ClickHouseResourceError** → `SERVICE_UNAVAILABLE` (524)
2. **BaseError** → Preserves httpCode and message
3. **5xx errors** → Sanitized as "Internal error" (hides stack traces)
4. **4xx errors** → Original error message preserved

**Example:**

```typescript
if (!res.ok) {
  if (res.error.cause instanceof ClickHouseResourceError) {
    res.error = new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
    });
  } else {
    const { code, httpStatus } = resolveError(res.error);
    const isSafeToExpose = httpStatus >= 400 && httpStatus < 500;

    res.error = new TRPCError({
      code,
      cause: null,
      message: isSafeToExpose ? res.error.message : "Internal error.",
    });
  }
}
```

### Public API Error Handling

Public API uses `withMiddlewares` for error handling:

```typescript
catch (error) {
  // 1. BaseError (custom application errors)
  if (error instanceof BaseError) {
    if (error.httpCode >= 500) traceException(error);
    return res.status(error.httpCode).json({
      message: error.message,
      error: error.name,
    });
  }

  // 2. ClickHouseResourceError (query timeouts, memory limits)
  if (error instanceof ClickHouseResourceError) {
    return res.status(524).json({
      message: ClickHouseResourceError.ERROR_ADVICE_MESSAGE,
      error: "Request is taking too long to process.",
    });
  }

  // 3. Zod validation errors
  if (isZodError(error)) {
    return res.status(400).json({
      message: "Invalid request data",
      error: error.issues,
    });
  }

  // 4. Prisma errors
  if (isPrismaException(error)) {
    traceException(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: "An unknown error occurred",
    });
  }

  // 5. Unknown errors
  traceException(error);
  return res.status(500).json({
    message: "Internal Server Error",
    error: error instanceof Error ? error.message : "Unknown error",
  });
}
```

---

## OpenTelemetry Instrumentation

All requests (tRPC and public API) propagate OpenTelemetry context with Langfuse-specific baggage.

### Context Propagation Pattern

```typescript
import { contextWithLangfuseProps } from "@langfuse/shared/src/server";
import * as opentelemetry from "@opentelemetry/api";

// Create context with Langfuse baggage
const ctx = contextWithLangfuseProps({
  headers: req.headers,
  userId: session?.user?.id,
  projectId: input?.projectId,
});

// Execute with context
return opentelemetry.context.with(ctx, async () => {
  // All instrumented code inside here will have access to baggage
  return await handler();
});
```

**Baggage includes:**
- `userId` - User ID from session
- `projectId` - Project ID from input
- `headers` - Request headers for trace propagation

### tRPC Instrumentation

```typescript
const withOtelInstrumentation = t.middleware(async (opts) => {
  const actualInput = await opts.getRawInput();

  const baggageCtx = contextWithLangfuseProps({
    headers: opts.ctx.headers,
    userId: opts.ctx.session?.user?.id,
    projectId: (actualInput as Record<string, string>)?.projectId,
  });

  return opentelemetry.context.with(baggageCtx, () => opts.next());
});

// Used with Baselime tracing
const withOtelTracingProcedure = t.procedure
  .use(withOtelInstrumentation)
  .use(tracing({ collectInput: true, collectResult: true }));
```

---

## Composable Procedures

tRPC procedures are composed by chaining middleware:

### Composition Pattern

```typescript
// Base procedure with tracing + error handling
const baseProcedure = withOtelTracingProcedure.use(withErrorHandling);

// Add authentication
const authedProcedure = baseProcedure.use(enforceUserIsAuthed);

// Add project scoping
const projectProcedure = authedProcedure.use(enforceUserIsAuthedAndProjectMember);
```

### Using Procedures in Routers

```typescript
import { protectedProjectProcedure } from "@/src/server/api/trpc";

export const tracesRouter = createTRPCRouter({
  // Input automatically validated against Zod schema
  all: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        page: z.number().optional(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // ctx.session.projectId is guaranteed to exist
      // ctx.session.projectRole contains user's role

      const traces = await getTraces({
        projectId: input.projectId,
        page: input.page ?? 0,
        limit: input.limit ?? 50,
      });

      return traces;
    }),

  byId: protectedGetTraceProcedure
    .input(
      z.object({
        traceId: z.string(),
        projectId: z.string(),
        timestamp: z.date().nullish(),
      })
    )
    .query(async ({ input, ctx }) => {
      // ctx.trace is guaranteed to exist (fetched by middleware)
      // No need to refetch
      return ctx.trace;
    }),
});
```

### Middleware Execution Order

Middleware executes in the order it's chained:

```typescript
protectedProjectProcedure
  .use(withErrorHandling)              // 1. Wraps entire execution
  .use(enforceUserIsAuthed)            // 2. Validates session exists
  .use(enforceUserIsAuthedAndProjectMember)  // 3. Validates project membership
  .input(schema)                       // 4. Validates input
  .query(async ({ input, ctx }) => {   // 5. Executes query
    // ...
  });
```

**Context enrichment:**

Each middleware can enrich the context:

```typescript
// After enforceUserIsAuthed:
ctx.session.user // NonNullable<User>

// After enforceUserIsAuthedAndProjectMember:
ctx.session.projectId   // string
ctx.session.projectRole // Role (OWNER | ADMIN | MEMBER | VIEWER)
ctx.session.orgId       // string
ctx.session.orgRole     // Role

// After enforceTraceAccess:
ctx.trace // TraceRecord (pre-fetched)
```

---

**Related Files:**

- [SKILL.md](../SKILL.md) - Main backend development guidelines
- [architecture-overview.md](architecture-overview.md) - System architecture
- [async-and-errors.md](async-and-errors.md) - Error handling patterns

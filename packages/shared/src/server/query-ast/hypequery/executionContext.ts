/**
 * Per-compile tenancy and routing context. Product code never writes
 * `project_id` predicates; {@link compile} injects them from this object.
 *
 * An empty or missing `projectId` is unscoped and fails closed.
 */
export type ExecutionContext = {
  projectId: string;
};

export function assertExecutionContext(
  ctx: ExecutionContext | null | undefined,
): asserts ctx is ExecutionContext {
  if (
    !ctx ||
    typeof ctx.projectId !== "string" ||
    ctx.projectId.trim() === ""
  ) {
    throw new UnscopedQueryError(
      "compile() requires ExecutionContext.projectId; unscoped queries cannot be compiled",
    );
  }
}

export class UnscopedQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnscopedQueryError";
  }
}

export class TenantInjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantInjectionError";
  }
}

export class TypeIncompatibleTransformationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeIncompatibleTransformationError";
  }
}

export class ViewColumnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViewColumnError";
  }
}

export class QueryCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryCompileError";
  }
}

export class UnscopedRelationError extends QueryCompileError {
  constructor(message: string) {
    super(message);
    this.name = "UnscopedRelationError";
  }
}

export class TypeCompatibilityError extends QueryCompileError {
  constructor(message: string) {
    super(message);
    this.name = "TypeCompatibilityError";
  }
}

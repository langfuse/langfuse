export class BaseError extends Error {
  public readonly name: string;
  public readonly httpCode: number;
  public readonly isOperational: boolean;

  constructor(
    name: string,
    httpCode: number,
    description: string,
    isOperational: boolean,
  ) {
    super(description);
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain

    this.name = name;
    this.httpCode = httpCode;
    this.isOperational = isOperational; // if error is part of known errors that our application can anticipate

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }

  public isUserError(): boolean {
    return this.httpCode >= 400 && this.httpCode < 500;
  }
}

export const isBaseError = (error: unknown): error is BaseError => {
  if (error instanceof BaseError) return true;
  if (!(error instanceof Error)) return false;

  const candidate = error as Partial<BaseError>;

  return (
    typeof candidate.httpCode === "number" &&
    typeof candidate.isOperational === "boolean" &&
    typeof candidate.isUserError === "function"
  );
};

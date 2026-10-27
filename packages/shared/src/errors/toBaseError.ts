/* eslint-disable @typescript-eslint/no-use-before-define */
import { BadGatewayError } from "./BadGatewayError";
import { type BaseError } from "./BaseError";
import { LangfuseConflictError } from "./ConflictError";
import { ForbiddenError } from "./ForbiddenError";
import { GatewayTimeoutError } from "./GatewayTimeoutError";
import { InternalServerError } from "./InternalServerError";
import { InvalidRequestError } from "./InvalidRequestError";
import { MethodNotAllowedError } from "./MethodNotAllowedError";
import { LangfuseNotFoundError } from "./NotFoundError";
import { NotImplementedError } from "./NotImplementedError";
import { ServiceUnavailableError } from "./ServiceUnavailableError";
import { TooManyRequestsError } from "./TooManyRequestsError";
import { UnauthorizedError } from "./UnauthorizedError";

const errorsByStatus: Partial<Record<number, BaseErrorClass>> = {
  400: InvalidRequestError,
  401: UnauthorizedError,
  403: ForbiddenError,
  404: LangfuseNotFoundError,
  405: MethodNotAllowedError,
  409: LangfuseConflictError,
  429: TooManyRequestsError,
  500: InternalServerError,
  501: NotImplementedError,
  502: BadGatewayError,
  503: ServiceUnavailableError,
  504: GatewayTimeoutError,
};

/** toBaseError maps an HTTP status to its base error, using the error's default message when none is given. */
export function toBaseError(status: number, message?: string): BaseError {
  const ErrorClass = errorsByStatus[status] ?? fallbackErrorClass(status);
  return new ErrorClass(message);
}

/** fallbackErrorClass is InternalServerError for unmapped 5xx statuses and InvalidRequestError otherwise. */
function fallbackErrorClass(status: number): BaseErrorClass {
  if (status >= 500) return InternalServerError;
  return InvalidRequestError;
}

/** BaseErrorClass is a base error constructor taking an optional message. */
type BaseErrorClass = new (description?: string) => BaseError;

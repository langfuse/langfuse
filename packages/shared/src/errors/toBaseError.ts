import { BadGatewayError } from "./BadGatewayError";
import { BaseError } from "./BaseError";
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

const errorsByStatus = {
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
} as const;

/** toBaseError maps an HTTP status to its base error, or to a plain BaseError with that status when none is mapped. */
export function toBaseError<Status extends number>(
  status: Status,
  message?: string,
): BaseErrorForStatus<Status> {
  const ErrorClass: BaseErrorClass | undefined =
    errorsByStatus[status as keyof ErrorsByStatus];
  if (!ErrorClass) {
    return new BaseError(
      "HttpError",
      status,
      message ?? `HTTP ${status}`,
      true,
    ) as BaseErrorForStatus<Status>;
  }
  return new ErrorClass(message) as BaseErrorForStatus<Status>;
}

/** ErrorsByStatus is the status-to-class table toBaseError reads. */
type ErrorsByStatus = typeof errorsByStatus;

/** BaseErrorForStatus is the error class mapped to a literal status, and BaseError for any other status. */
type BaseErrorForStatus<Status extends number> =
  Status extends keyof ErrorsByStatus
    ? InstanceType<ErrorsByStatus[Status]>
    : BaseError;

/** BaseErrorClass is a base error constructor taking an optional message. */
type BaseErrorClass = new (description?: string) => BaseError;

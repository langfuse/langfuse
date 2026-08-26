import { BaseError } from "@langfuse/shared";
import type {
  UnstablePublicApiErrorCodeType,
  UnstablePublicApiErrorDetailsType,
} from "./structuredPublicApiErrorSchema";

export class UnstablePublicApiError extends BaseError {
  public readonly code: UnstablePublicApiErrorCodeType;
  public readonly details?: UnstablePublicApiErrorDetailsType;

  constructor(params: {
    httpCode: number;
    code: UnstablePublicApiErrorCodeType;
    message: string;
    details?: UnstablePublicApiErrorDetailsType;
  }) {
    super("UnstablePublicApiError", params.httpCode, params.message, true);
    this.code = params.code;
    this.details = params.details;
  }
}

export function createUnstablePublicApiError(params: {
  httpCode: number;
  code: UnstablePublicApiErrorCodeType;
  message: string;
  details?: UnstablePublicApiErrorDetailsType;
}) {
  return new UnstablePublicApiError(params);
}

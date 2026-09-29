import { BaseError } from "@langfuse/shared";
import type {
  StructuredPublicApiErrorCodeType,
  StructuredPublicApiErrorDetailsType,
} from "./structuredPublicApiErrorSchema";

export class StructuredPublicApiError extends BaseError {
  public readonly code: StructuredPublicApiErrorCodeType;
  public readonly details?: StructuredPublicApiErrorDetailsType;

  constructor(params: {
    httpCode: number;
    code: StructuredPublicApiErrorCodeType;
    message: string;
    details?: StructuredPublicApiErrorDetailsType;
  }) {
    super("StructuredPublicApiError", params.httpCode, params.message, true);
    this.code = params.code;
    this.details = params.details;
  }
}

export function createStructuredPublicApiError(params: {
  httpCode: number;
  code: StructuredPublicApiErrorCodeType;
  message: string;
  details?: StructuredPublicApiErrorDetailsType;
}) {
  return new StructuredPublicApiError(params);
}

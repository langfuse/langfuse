import { type NextApiResponse } from "next";

import {
  PayloadTooLargeError,
  type ApiDeprecationInfo,
} from "@langfuse/shared";

import { attachDeprecation } from "./deprecations";

// Next's res.json uses JSON.stringify; V8 throws this when the JSON string
// exceeds the engine limit. Keep this check scoped to the response write.
export const isJsonStringTooLargeError = (
  error: unknown,
): error is RangeError =>
  error instanceof RangeError && error.message === "Invalid string length";

export type PublicApiResponseWriter<TResponse> = (params: {
  response: TResponse;
  res: NextApiResponse;
  deprecation?: ApiDeprecationInfo;
  statusCode: number;
}) => void | Promise<void>;

/**
 * Preserve a status code selected by the route handler while applying the
 * configured success status to responses that have not selected one yet.
 */
export function getPublicApiSuccessStatusCode(
  res: NextApiResponse,
  successStatusCode?: number,
) {
  return res.statusCode !== 200 ? res.statusCode : successStatusCode || 200;
}

/**
 * Write an already-selected JSON status and body. Keeping this small helper
 * separate lets streamed writers reuse the status/deprecation conventions
 * without going through Next's whole-body JSON serialization.
 */
export function sendPublicApiJsonResponse(params: {
  res: NextApiResponse;
  statusCode: number;
  body: unknown;
  deprecation?: ApiDeprecationInfo;
}) {
  return params.res
    .status(params.statusCode)
    .json(attachDeprecation(params.body, params.deprecation));
}

/** The default response writer used by authenticated public API routes. */
export const sendPublicApiJsonSuccessResponse: PublicApiResponseWriter<
  unknown
> = ({ response, res, deprecation, statusCode }) => {
  try {
    sendPublicApiJsonResponse({
      res,
      statusCode,
      body: response || { message: "OK" },
      deprecation,
    });
  } catch (error) {
    if (isJsonStringTooLargeError(error)) {
      throw new PayloadTooLargeError();
    }

    throw error;
  }
};

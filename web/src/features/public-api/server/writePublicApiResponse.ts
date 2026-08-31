import type { NextApiRequest, NextApiResponse } from "next";

export type PublicApiWriteResponse = (params: {
  req: NextApiRequest;
  res: NextApiResponse;
  body: unknown;
  statusCode: number;
}) => void;

/**
 * Writes JSON by default. Routes with a non-JSON wire format pass
 * `writeResponse` (for example OTLP/HTTP).
 */
export function writePublicApiResponse({
  req,
  res,
  body,
  statusCode,
  writeResponse,
}: {
  req: NextApiRequest;
  res: NextApiResponse;
  body: unknown;
  statusCode: number;
  writeResponse?: PublicApiWriteResponse;
}): void {
  if (writeResponse) {
    writeResponse({ req, res, body, statusCode });
    return;
  }

  res.status(statusCode).json(body);
}

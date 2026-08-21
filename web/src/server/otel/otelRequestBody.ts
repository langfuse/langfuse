import type { IncomingMessage } from "node:http";
import { gunzip } from "node:zlib";

import getRawBody from "raw-body";

export class OtelRequestBodyTooLargeError extends Error {
  constructor(
    public readonly maxBytes: number,
    public readonly afterDecompression = false,
  ) {
    const maxMiB = maxBytes / (1024 * 1024);
    const limit = Number.isInteger(maxMiB)
      ? `${maxMiB} MiB`
      : `${maxBytes} bytes`;
    const suffix = afterDecompression ? " after decompression" : "";

    super(`OTel request body exceeds the ${limit} limit${suffix}`);
    this.name = "OtelRequestBodyTooLargeError";
  }
}

type RawBodyError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

function isRawBodyTooLargeError(error: unknown): error is RawBodyError {
  if (!(error instanceof Error)) return false;

  const rawBodyError = error as RawBodyError;
  return (
    rawBodyError.status === 413 ||
    rawBodyError.statusCode === 413 ||
    rawBodyError.type === "entity.too.large"
  );
}

export async function readOtelRequestBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  try {
    return await getRawBody(req, {
      length: req.headers["content-length"],
      limit: maxBytes,
    });
  } catch (error) {
    if (isRawBodyTooLargeError(error)) {
      throw new OtelRequestBodyTooLargeError(maxBytes);
    }

    throw error;
  }
}

export function gunzipOtelRequestBody(
  body: Buffer,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gunzip(body, { maxOutputLength: maxBytes }, (error, result) => {
      if (!error) {
        resolve(result);
        return;
      }

      if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") {
        reject(new OtelRequestBodyTooLargeError(maxBytes, true));
        return;
      }

      reject(error);
    });
  });
}

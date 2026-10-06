import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import http from "node:http";
import https from "node:https";
import type { AdminIssueName } from "../adminIssueDefinitions";
import { DEFAULT_SEED_API_KEY } from "../../../../scripts/seeder/utils/postgres-seed-constants";

const BASE_URL = "http://localhost:3000";
const BODY_LIMIT_BYTES = 512 * 1024 * 1024;
const authorization = `Basic ${Buffer.from(
  `${DEFAULT_SEED_API_KEY.public}:${DEFAULT_SEED_API_KEY.secret}`,
).toString("base64")}`;

const sendOversizedOtelRequest = async (): Promise<void> => {
  const url = new URL(`${BASE_URL}/api/public/otel/v1/traces`);
  const requestClient = url.protocol === "https:" ? https : http;

  return new Promise<void>((resolve, reject) => {
    const request = requestClient.request(
      url,
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Length": String(BODY_LIMIT_BYTES + 1),
          "Content-Type": "application/x-protobuf",
          Connection: "close",
        },
      },
      (response) => {
        const responseChunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => responseChunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const responseBody = Buffer.concat(responseChunks).toString("utf8");
          stdout.write(`HTTP ${response.statusCode ?? "unknown"}\n`);
          if (responseBody.length > 0) stdout.write(`${responseBody}\n`);

          if (response.statusCode === 413) {
            stdout.write(
              `The request was rejected above the ${BODY_LIMIT_BYTES}-byte limit.\n`,
            );
            resolve();
            return;
          }

          reject(
            new Error(
              `Expected HTTP 413 from ${url}, received ${response.statusCode ?? "no status"}. Check the server, demo API key, project seed, and body limit.`,
            ),
          );
        });
      },
    );

    request.on("error", reject);
    // raw-body rejects an oversized declared length before reading a body.
    request.end();
  });
};

const exceedRateLimit = async (): Promise<void> => {
  const url = `${BASE_URL}/api/public/v2/metrics?query=invalid`;
  const maxRequests = 150;
  const batchSize = 10;

  for (let sent = 0; sent < maxRequests; sent += batchSize) {
    const responses = await Promise.all(
      Array.from({ length: Math.min(batchSize, maxRequests - sent) }, () =>
        fetch(url, { headers: { Authorization: authorization } }),
      ),
    );
    const limited = responses.find((response) => response.status === 429);
    await Promise.all(responses.map((response) => response.body?.cancel()));
    if (limited) {
      stdout.write(
        `HTTP 429 after at most ${sent + responses.length} requests\n`,
      );
      stdout.write(
        `Retry-After: ${limited.headers.get("retry-after")} seconds\n`,
      );
      return;
    }

    const unexpected = responses.find((response) => response.status !== 400);
    if (unexpected) {
      throw new Error(
        `Expected validation or rate-limit response, received HTTP ${unexpected.status} from ${url}`,
      );
    }
  }

  throw new Error(
    `No HTTP 429 after ${maxRequests} requests. Check the local rate-limit setup in README.md.`,
  );
};

const demoIssues: Array<{
  name: AdminIssueName;
  description: string;
  warning: string;
  run: () => Promise<void>;
}> = [
  {
    name: "Oversized ingestion request",
    description: "Send an OTEL request above the configured body limit",
    warning:
      "This sends only an oversized Content-Length header. No large body is uploaded.",
    run: sendOversizedOtelRequest,
  },
  {
    name: "Rate limit exceeded",
    description: "Request the metrics API until it returns 429",
    warning: "This sends up to 150 local GET requests in batches of 10.",
    run: exceedRateLimit,
  },
];

async function main() {
  const readline = createInterface({ input: stdin, output: stdout });

  try {
    while (true) {
      stdout.write("Admin issue live demo\n");
      stdout.write(`Server: ${BASE_URL}\n\n`);

      for (const [index, demoIssue] of demoIssues.entries()) {
        stdout.write(`${index + 1}) ${demoIssue.name}\n`);
        stdout.write(`   ${demoIssue.description}\n`);
      }
      stdout.write("q) Quit\n");

      const selection = (await readline.question("\nChoose an issue: "))
        .trim()
        .toLowerCase();
      if (selection === "q" || selection === "quit") return;

      const selectedIssue = demoIssues[Number(selection) - 1];
      if (!selectedIssue) {
        stdout.write("Choose one of the listed numbers, or q to quit.\n\n");
        continue;
      }

      stdout.write(`${selectedIssue.warning}\n`);
      try {
        await selectedIssue.run();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Demo failed: ${message}\n`);
      }
    }
  } finally {
    readline.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Admin issue demo failed: ${message}`);
  process.exitCode = 1;
});

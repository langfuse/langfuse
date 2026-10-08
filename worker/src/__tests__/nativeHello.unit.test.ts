import { execFileSync } from "node:child_process";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hello, initTelemetry } from "@langfuse/native";

// The addon sends DogStatsD datagrams itself, so capture them on a throwaway
// UDP socket instead of mocking anything on the Node side.
const socket = createSocket("udp4");
const received: string[] = [];
socket.on("message", (message) => {
  received.push(...message.toString("utf8").split("\n"));
});

type Metric = { name: string; value: number; type: string; tags: string[] };

const parseDogStatsD = (line: string): Metric => {
  const [nameAndValue, type, ...rest] = line.split("|");
  const [name, value] = nameAndValue.split(":");
  const tags =
    rest
      .find((part) => part.startsWith("#"))
      ?.slice(1)
      .split(",")
      .sort() ?? [];
  return { name, value: Number(value), type, tags };
};

const helloCalls = () =>
  received
    .filter((line) => line.startsWith("langfuse.native.hello_calls:"))
    .map(parseDogStatsD);

const sumBySource = (source: string) =>
  helloCalls()
    .filter((metric) => metric.tags.includes(`source:${source}`))
    .reduce((sum, metric) => sum + metric.value, 0);

const waitUntil = async (condition: () => boolean, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(
        `timed out; datagrams so far: ${JSON.stringify(received)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

describe("@langfuse/native telemetry", () => {
  beforeAll(async () => {
    socket.bind(0, "127.0.0.1");
    await once(socket, "listening");
    // Global tags are read from the environment at init, like dd-trace does.
    process.env.DD_SERVICE = "langfuse-worker-test";
    process.env.DD_ENV = "unit";
    process.env.DD_TAGS = "team:data-platform";
    initTelemetry({
      dogstatsdAddress: `127.0.0.1:${socket.address().port}`,
      flushIntervalMs: 50,
    });
  });

  afterAll(() => {
    socket.close();
  });

  it("counts hello calls straight into DogStatsD, tagged like dd-trace metrics", async () => {
    hello("startup");
    hello("health");
    hello("health");

    await waitUntil(
      () => sumBySource("startup") >= 1 && sumBySource("health") >= 2,
    );

    expect(sumBySource("startup")).toBe(1);
    expect(sumBySource("health")).toBe(2);
    for (const metric of helloCalls()) {
      expect(metric.type).toBe("c");
      expect(metric.tags).toEqual(
        expect.arrayContaining([
          "env:unit",
          "service:langfuse-worker-test",
          "team:data-platform",
        ]),
      );
    }
  });

  it("logs to stdout as JSON in the worker logger's shape", () => {
    // A child process, because the log subscriber is installed once per
    // process and this one already has it configured for text output.
    const addonPath = createRequire(import.meta.url).resolve(
      "@langfuse/native",
    );
    const script = [
      `const { initTelemetry, hello } = require(${JSON.stringify(addonPath)});`,
      // Port 9 is the discard port; no agent listens there.
      `initTelemetry({ dogstatsdAddress: "127.0.0.1:9" });`,
      `hello("startup");`,
    ].join("\n");
    const stdout = execFileSync(process.execPath, ["-e", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        LANGFUSE_LOG_FORMAT: "json",
        LANGFUSE_LOG_LEVEL: "debug",
      },
    });

    const lines = stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const helloLine = lines.find(
      (line) => line.message === "hello from the native addon",
    );
    expect(helloLine).toMatchObject({ level: "DEBUG", source: "startup" });
    expect(typeof helloLine?.timestamp).toBe("string");
  });
});

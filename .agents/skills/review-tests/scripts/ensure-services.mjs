#!/usr/bin/env node
// Guarantees the service stack a review depends on. Every axiom-1 flag is
// confirmed by stubbing a function and running the tests that exercise it, and
// most of this repository's tests need Postgres, ClickHouse, Redis and MinIO.
// A review that could not run them would rest on inference; this script makes
// that state unreachable: it brings the stack up or fails the run.
//
//   node .agents/skills/review-tests/scripts/ensure-services.mjs [--check]
//
//   --check   probe only; exit 1 if anything is down, never start containers
//
// Ports and host follow docker-compose.dev.yml and the same environment
// variables it reads. Prints one JSON line on success.

import { spawnSync } from "node:child_process";
import net from "node:net";

const HOST = process.env.HOST_IP ?? "127.0.0.1";
const SERVICES = [
  { name: "postgres", port: Number(process.env.POSTGRES_HOST_PORT ?? 5432) },
  {
    name: "clickhouse",
    port: Number(process.env.CLICKHOUSE_HTTP_PORT ?? 8123),
  },
  { name: "redis", port: Number(process.env.REDIS_HOST_PORT ?? 6379) },
  { name: "minio", port: Number(process.env.MINIO_API_PORT ?? 9090) },
];
const COMPOSE_FILE = "docker-compose.dev.yml";
const WAIT_TIMEOUT_SECONDS = 180;

const reachable = (port) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });

async function probe() {
  const status = {};
  for (const s of SERVICES) status[s.name] = await reachable(s.port);
  return status;
}

const down = (status) => Object.keys(status).filter((k) => !status[k]);

function startStack() {
  const args = [
    "compose",
    "-f",
    COMPOSE_FILE,
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    String(WAIT_TIMEOUT_SECONDS),
    ...SERVICES.map((s) => s.name),
  ];
  process.stderr.write(
    `review-tests: starting ${down.name ?? "services"}: docker ${args.join(" ")}\n`,
  );
  const result = spawnSync("docker", args, {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.error) {
    return `docker is not available (${result.error.message}); install Docker or start the stack another way`;
  }
  if (result.status !== 0) {
    return `docker compose exited with ${result.status}`;
  }
  return null;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  let status = await probe();
  let started = false;

  if (down(status).length) {
    if (checkOnly) {
      process.stderr.write(
        `review-tests: services down: ${down(status).join(", ")} (host ${HOST})\n`,
      );
      process.exit(1);
    }
    const failure = startStack();
    if (failure) {
      process.stderr.write(
        `review-tests: cannot bring up the service stack: ${failure}\n`,
      );
      process.exit(1);
    }
    started = true;
    status = await probe();
    if (down(status).length) {
      process.stderr.write(
        `review-tests: stack started but still unreachable: ${down(status).join(", ")} on ${HOST}\n`,
      );
      process.exit(1);
    }
  }

  process.stdout.write(
    `${JSON.stringify({ ok: true, started, host: HOST, services: status })}\n`,
  );
}

main();

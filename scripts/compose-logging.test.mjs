// Run with: node scripts/compose-logging.test.mjs (Docker Compose v2, no daemon needed).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function config(files, input) {
  return JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        "/dev/null",
        "--project-name",
        "langfuse-logging-test",
        ...files.flatMap((file) => ["-f", file]),
        "config",
        "--format",
        "json",
        "--no-interpolate",
      ],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
        input,
      },
    ),
  );
}

const base = config(["docker-compose.yml"]);
assert.deepEqual(
  config([]),
  base,
  "Logging must remain opt-in with default discovery",
);
const services = Object.keys(base.services);
assert.ok(services.length > 0);
for (const name of services) {
  assert.equal(
    base.services[name].logging,
    undefined,
    `${name}: daemon defaults`,
  );
}

const bounded = config(["docker-compose.yml", "docker-compose.logging.yml"]);
assert.deepEqual(Object.keys(bounded.services), services);
for (const name of services) {
  assert.deepEqual(bounded.services[name].logging, {
    driver: "json-file",
    options: { "max-size": "10m", "max-file": "3" },
  });
  delete bounded.services[name].logging;
}
delete bounded["x-logging"];
assert.deepEqual(
  bounded,
  base,
  "The logging override must not change other settings",
);

for (const driver of ["journald", "syslog", "fluentd"]) {
  const logging = { driver, options: { tag: "langfuse" } };
  const override = {
    services: Object.fromEntries(services.map((name) => [name, { logging }])),
  };
  const custom = config(["docker-compose.yml", "-"], JSON.stringify(override));
  for (const name of services) {
    assert.deepEqual(custom.services[name].logging, logging);
  }
}

console.log(
  `Compose logging: ${services.length} services preserve daemon defaults; opt-in bounds and 3 custom drivers passed.`,
);

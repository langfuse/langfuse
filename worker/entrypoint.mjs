// Shell-less port of entrypoint.sh for the hardened enterprise image, whose
// runtime has no /bin/sh. Keep the behavior in sync with entrypoint.sh.
import { spawn } from "node:child_process";
import os from "node:os";

const env = process.env;

if (!env.DATABASE_URL) {
  if (
    env.DATABASE_HOST &&
    env.DATABASE_USERNAME &&
    env.DATABASE_PASSWORD &&
    env.DATABASE_NAME
  ) {
    // Construct DATABASE_URL from the provided variables
    env.DATABASE_URL = `postgresql://${env.DATABASE_USERNAME}:${env.DATABASE_PASSWORD}@${env.DATABASE_HOST}/${env.DATABASE_NAME}`;
  } else {
    console.error(
      "Error: Required database environment variables are not set. Provide a postgres url for DATABASE_URL.",
    );
    process.exit(1);
  }
  if (env.DATABASE_ARGS) {
    env.DATABASE_URL = `${env.DATABASE_URL}?${env.DATABASE_ARGS}`;
  }
}

// Run the command passed to the docker image on start
const argv = process.argv.slice(2);
if (argv.length === 0) process.exit(0);
const [command, ...args] = argv;
const child = spawn(command === "node" ? process.execPath : command, args, {
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exit(127);
});
for (const signal of ["SIGTERM", "SIGINT", "SIGQUIT", "SIGHUP"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  process.exit(code ?? 128 + (os.constants.signals[signal] ?? 0));
});

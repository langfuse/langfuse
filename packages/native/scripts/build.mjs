// Builds the @langfuse/native addon for the machine running this script.
//
// Strategies, chosen automatically or forced with LANGFUSE_NATIVE_BUILD:
//   local   A Rust toolchain is on PATH: run `napi build`. This is the path CI
//           and the worker Docker image take, and what Rust developers use.
//   docker  No toolchain, but Docker is running: cross-compile inside the
//           pinned builder image (builder.Dockerfile) and copy the binary back
//           into this package. For developers who never touch the Rust code.
//
// The docker strategy does not regenerate index.js / index.d.ts; those are
// committed and only change when the Rust exports change, which requires the
// local strategy anyway.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf8"),
);
const binaryName = packageJson.napi.binaryName;
const crateLibName = binaryName.replaceAll("-", "_");
// The builder image installs this exact Rust version, so the pin lives only in
// rust-toolchain.toml.
const rustVersion = readFileSync(
  join(packageDir, "rust-toolchain.toml"),
  "utf8",
).match(/^channel\s*=\s*"([^"]+)"/m)?.[1];
if (!rustVersion) {
  throw new Error("rust-toolchain.toml does not declare a channel");
}
const release = process.argv.includes("--release");

const log = (message) => console.log(`[@langfuse/native] ${message}`);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status}`,
    );
  }
};

const commandWorks = (command, args) =>
  spawnSync(command, args, { stdio: "ignore", cwd: tmpdir() }).status === 0;

// --- local -----------------------------------------------------------------

const buildLocal = () => {
  const args = ["exec", "napi", "build", "--platform"];
  if (release) args.push("--release");
  run("pnpm", args, { cwd: packageDir });
};

// --- docker ----------------------------------------------------------------

const isMusl = () => {
  if (process.platform !== "linux") return false;
  const header = process.report?.getReport()?.header;
  return header ? header.glibcVersionRuntime === undefined : false;
};

// Maps the host to the Rust target the builder container compiles for. Linux
// glibc targets pin glibc 2.17 through Zig so the binary runs on any distro.
const hostTarget = () => {
  const key = `${process.platform}-${process.arch}`;
  switch (key) {
    case "darwin-arm64":
      return {
        triple: "aarch64-apple-darwin",
        napi: "darwin-arm64",
        ext: "dylib",
      };
    case "darwin-x64":
      return {
        triple: "x86_64-apple-darwin",
        napi: "darwin-x64",
        ext: "dylib",
      };
    case "linux-x64":
      return isMusl()
        ? {
            triple: "x86_64-unknown-linux-musl",
            napi: "linux-x64-musl",
            ext: "so",
          }
        : {
            triple: "x86_64-unknown-linux-gnu.2.17",
            cargoTarget: "x86_64-unknown-linux-gnu",
            napi: "linux-x64-gnu",
            ext: "so",
          };
    case "linux-arm64":
      return isMusl()
        ? {
            triple: "aarch64-unknown-linux-musl",
            napi: "linux-arm64-musl",
            ext: "so",
          }
        : {
            triple: "aarch64-unknown-linux-gnu.2.17",
            cargoTarget: "aarch64-unknown-linux-gnu",
            napi: "linux-arm64-gnu",
            ext: "so",
          };
    default:
      throw new Error(
        `The docker build strategy cannot target ${key}; it covers macOS and Linux hosts. ` +
          "Install a Rust toolchain (https://rustup.rs) or, on Windows, work inside WSL2.",
      );
  }
};

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });

// Everything that influences the compiled binary, so an unchanged crate skips
// the container round trip on the next `pnpm run dev`.
const sourceHash = (target) => {
  const hash = createHash("sha256");
  hash.update(target.triple);
  const inputs = [
    "Cargo.toml",
    "Cargo.lock",
    "build.rs",
    "builder.Dockerfile",
    "rust-toolchain.toml",
    ...listFiles(join(packageDir, "src")).map((p) => relative(packageDir, p)),
  ].sort();
  for (const file of inputs) {
    hash.update(file);
    hash.update(readFileSync(join(packageDir, file)));
  }
  return hash.digest("hex");
};

const ensureBuilderImage = () => {
  const dockerfile = readFileSync(join(packageDir, "builder.Dockerfile"));
  const imageHash = createHash("sha256")
    .update(dockerfile)
    .update(rustVersion)
    .digest("hex")
    .slice(0, 12);
  const tag = `langfuse-native-builder:${imageHash}`;
  const exists =
    spawnSync("docker", ["image", "inspect", tag], { stdio: "ignore" })
      .status === 0;
  if (!exists) {
    log(`building builder image ${tag} (one-off, a few minutes)`);
    // Stdin context: the Dockerfile copies nothing from the package directory.
    run(
      "docker",
      [
        "build",
        "--tag",
        tag,
        "--build-arg",
        `RUST_VERSION=${rustVersion}`,
        "-",
      ],
      { input: dockerfile, stdio: ["pipe", "inherit", "inherit"] },
    );
  }
  return tag;
};

// On macOS hosts, mount the local SDK so rustc finds it (no xcrun warning,
// and crates may link Apple frameworks). Pure-Rust crates link fine without
// one thanks to Zig's bundled libSystem stubs, so a missing SDK is not fatal.
const findMacSdk = () => {
  if (process.platform !== "darwin") return undefined;
  const override = process.env.LANGFUSE_NATIVE_SDKROOT;
  if (override) {
    if (existsSync(override)) return realpathSync(override);
    log(`LANGFUSE_NATIVE_SDKROOT=${override} does not exist, ignoring`);
    return undefined;
  }
  // xcode-select is a real binary that never triggers the "install developer
  // tools" prompt; only ask xcrun once we know the tools are there.
  if (spawnSync("xcode-select", ["-p"], { stdio: "ignore" }).status !== 0) {
    return undefined;
  }
  const xcrun = spawnSync("xcrun", ["--sdk", "macosx", "--show-sdk-path"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const path = xcrun.status === 0 ? xcrun.stdout.trim() : "";
  return path && existsSync(path) ? realpathSync(path) : undefined;
};

// Docker Desktop shares only some host directories by default, and the SDK
// lives under /Library, so check the mount before relying on it.
const canMount = (image, path) =>
  spawnSync(
    "docker",
    ["run", "--rm", "--volume", `${path}:/sdk:ro`, image, "true"],
    { stdio: "ignore" },
  ).status === 0;

const buildDocker = () => {
  const target = hostTarget();
  const outFile = `${binaryName}.${target.napi}.node`;
  const outPath = join(packageDir, outFile);
  const hashPath = `${outPath}.sha256`;
  const hash = sourceHash(target);

  if (
    existsSync(outPath) &&
    existsSync(hashPath) &&
    readFileSync(hashPath, "utf8").trim() === hash
  ) {
    log(`${outFile} is up to date, skipping container build`);
    return;
  }

  const image = ensureBuilderImage();
  const cargoTarget = target.cargoTarget ?? target.triple;
  const args = [
    "run",
    "--rm",
    "--volume",
    `${packageDir}:/io`,
    // Cargo caches live in named volumes so rebuilds are incremental and the
    // host's target/ directory is never touched by the container.
    "--volume",
    "langfuse-native-cargo-registry:/usr/local/cargo/registry",
    "--volume",
    "langfuse-native-target:/io/target",
    "--workdir",
    "/io",
  ];
  const sdk = findMacSdk();
  if (sdk) {
    if (canMount(image, sdk)) {
      log(`using macOS SDK at ${sdk}`);
      args.push("--volume", `${sdk}:/sdk:ro`, "--env", "SDKROOT=/sdk");
    } else {
      log(
        `Docker cannot mount the macOS SDK at ${sdk} (check Docker Desktop file sharing); building without it`,
      );
    }
  }
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  const chown =
    uid !== undefined && gid !== undefined
      ? `chown ${uid}:${gid} "/io/${outFile}" || true`
      : "true";
  args.push(
    image,
    "sh",
    "-ec",
    [
      `cargo zigbuild --release --target ${target.triple}`,
      `cp "target/${cargoTarget}/release/lib${crateLibName}.${target.ext}" "/io/${outFile}"`,
      chown,
    ].join("\n"),
  );

  log(`cross-compiling ${target.triple} in ${image}`);
  run("docker", args);
  writeFileSync(hashPath, `${hash}\n`);
  log(`wrote ${outFile}`);
};

// --- main ------------------------------------------------------------------

const chooseStrategy = () => {
  const forced = process.env.LANGFUSE_NATIVE_BUILD;
  if (forced === "local" || forced === "docker") return forced;
  if (forced) {
    throw new Error(
      `LANGFUSE_NATIVE_BUILD must be "local" or "docker", got "${forced}"`,
    );
  }
  if (commandWorks("cargo", ["--version"])) return "local";
  if (commandWorks("docker", ["version", "--format", "{{.Server.Version}}"]))
    return "docker";
  throw new Error(
    [
      "Cannot build @langfuse/native: neither cargo nor a running Docker daemon was found.",
      "Install Rust (https://rustup.rs) to build locally, or start Docker to build in a container.",
    ].join("\n"),
  );
};

const strategy = chooseStrategy();
log(`strategy: ${strategy}`);
if (strategy === "local") buildLocal();
else buildDocker();

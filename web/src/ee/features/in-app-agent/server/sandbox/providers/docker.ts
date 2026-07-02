import { PassThrough } from "node:stream";

import Docker from "dockerode";
import tar from "tar-stream";

import type { SandboxSnapshotStore } from "../snapshotStore";
import type { SandboxFile, SandboxProvider } from "../types";

type DockerExecResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

export function createDockerSandboxProvider(params: {
  image: string;
  snapshotStore: SandboxSnapshotStore;
}): SandboxProvider {
  const docker = new Docker();
  const containers = new Map<string, true>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const ensureContainer = async (containerId: string) => {
    const container = docker.getContainer(containerId);
    await container.inspect();
    containers.set(containerId, true);
    return container;
  };

  const createContainer = async (snapshotKey: string) => {
    const container = await docker.createContainer({
      Image: params.image,
      Cmd: ["sh", "-lc", "mkdir -p /workspace && tail -f /dev/null"],
      WorkingDir: "/workspace",
      AttachStdout: true,
      AttachStderr: true,
      NetworkDisabled: true,
      Tty: false,
    });
    await container.start();

    const snapshot = await params.snapshotStore.getSnapshot(snapshotKey);
    if (snapshot) {
      await container.putArchive(Buffer.from(snapshot), { path: "/" });
    }

    containers.set(container.id, true);
    return container;
  };

  return {
    name: "dangerous-docker",
    async ensureSession({ sessionId, snapshotKey }) {
      if (sessionId) {
        const timer = timers.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          timers.delete(sessionId);
        }

        try {
          await ensureContainer(sessionId);
          return { sessionId };
        } catch {
          containers.delete(sessionId);
        }
      }

      const container = await createContainer(snapshotKey);
      return { sessionId: container.id };
    },
    async syncReadonlyFiles({ sessionId, files }) {
      const container = await ensureContainer(sessionId);
      await execInContainer(container, [
        "node",
        "-e",
        `
          const fs = require("node:fs");
          fs.rmSync("/workspace/tool_calls", { recursive: true, force: true });
        `,
      ]);
      const archive = await buildToolCallsArchive(files);
      await container.putArchive(archive, { path: "/workspace" });
      await execInContainer(container, [
        "node",
        "-e",
        `
          const fs = require("node:fs");
          const path = require("node:path");
          const root = "/workspace/tool_calls";
          const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const entryPath = path.join(dir, entry.name);
              if (entry.isDirectory()) walk(entryPath);
              else fs.chmodSync(entryPath, 0o444);
            }
          };
          if (fs.existsSync(root)) walk(root);
        `,
      ]);
    },
    async read({ sessionId, path }) {
      const container = await ensureContainer(sessionId);
      const result = await execJsonInContainer(container, [
        "node",
        "-e",
        `
          const fs = require("node:fs");
          const filePath = process.argv[1];
          const content = fs.existsSync(filePath)
            ? fs.readFileSync(filePath, "utf8")
            : null;
          process.stdout.write(JSON.stringify({ path: filePath, content }));
        `,
        path,
      ]);

      return result;
    },
    async write({ sessionId, path, content }) {
      const container = await ensureContainer(sessionId);
      return await execJsonInContainer(container, [
        "node",
        "-e",
        `
          const fs = require("node:fs");
          const pathLib = require("node:path");
          const filePath = process.argv[1];
          const content = process.argv[2];
          fs.mkdirSync(pathLib.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, content, "utf8");
          process.stdout.write(JSON.stringify({ path: filePath, bytesWritten: Buffer.byteLength(content, "utf8") }));
        `,
        path,
        content,
      ]);
    },
    async edit({ sessionId, path, oldText, newText }) {
      const container = await ensureContainer(sessionId);
      return await execJsonInContainer(container, [
        "node",
        "-e",
        `
          const fs = require("node:fs");
          const filePath = process.argv[1];
          const oldText = process.argv[2];
          const newText = process.argv[3];
          const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
          const replaced = current.includes(oldText);
          if (replaced) fs.writeFileSync(filePath, current.replace(oldText, newText), "utf8");
          process.stdout.write(JSON.stringify({ path: filePath, replaced }));
        `,
        path,
        oldText,
        newText,
      ]);
    },
    async bash({ sessionId, command, timeoutMs }) {
      const container = await ensureContainer(sessionId);
      const result = await execInContainer(container, ["sh", "-lc", command], timeoutMs);
      return result;
    },
    async scheduleSuspension({ sessionId, snapshotKey, expiresAt }) {
      const existingTimer = timers.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const delayMs = Math.max(0, expiresAt.getTime() - Date.now());
      const timer = setTimeout(async () => {
        try {
          const container = await ensureContainer(sessionId);
          const archive = await container.getArchive({ path: "/workspace" });
          await params.snapshotStore.putSnapshot(
            snapshotKey,
            await readStreamToUint8Array(archive),
          );
          await container.remove({ force: true, v: true }).catch(() => undefined);
        } finally {
          containers.delete(sessionId);
          timers.delete(sessionId);
        }
      }, delayMs);
      timers.set(sessionId, timer);
    },
  };
}

async function buildToolCallsArchive(files: ReadonlyArray<SandboxFile>) {
  const pack = tar.pack();
  pack.entry({ name: "tool_calls/", type: "directory", mode: 0o755 });

  for (const file of files) {
    pack.entry({ name: file.path, mode: 0o444 }, file.content);
  }

  pack.finalize();
  return Buffer.from(await readStreamToUint8Array(pack));
}

async function execJsonInContainer(
  container: Docker.Container,
  cmd: string[],
  timeoutMs?: number,
) {
  const result = await execInContainer(container, cmd, timeoutMs);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || "Container command failed");
  }
  return JSON.parse(result.stdout || "null") as unknown;
}

async function execInContainer(
  container: Docker.Container,
  cmd: string[],
  timeoutMs?: number,
): Promise<DockerExecResult> {
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: "/workspace",
  });
  const stream = await exec.start({ Tty: false });

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  container.modem.demuxStream(stream, stdout, stderr);

  const timeoutId = timeoutMs
    ? setTimeout(() => stream.destroy(new Error(`Sandbox command timed out after ${timeoutMs}ms`)), timeoutMs)
    : undefined;

  try {
    const [stdoutBytes, stderrBytes, inspect] = await Promise.all([
      readStreamToUint8Array(stdout),
      readStreamToUint8Array(stderr),
      waitForStreamEnd(stream).then(() => exec.inspect()),
    ]);

    return {
      exitCode: inspect.ExitCode ?? 1,
      stdout: Buffer.from(stdoutBytes).toString("utf8"),
      stderr: Buffer.from(stderrBytes).toString("utf8"),
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function readStreamToUint8Array(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function waitForStreamEnd(stream: NodeJS.ReadableStream) {
  await new Promise<void>((resolve, reject) => {
    stream.once("end", resolve);
    stream.once("error", reject);
    stream.once("close", resolve);
  });
}

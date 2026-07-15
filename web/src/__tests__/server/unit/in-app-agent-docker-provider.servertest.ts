import { PassThrough } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeContainerState = {
  containersById: Map<string, FakeContainer>;
  containersByName: Map<string, FakeContainer>;
  createCount: number;
};

const fakeDockerState: FakeContainerState = {
  containersById: new Map(),
  containersByName: new Map(),
  createCount: 0,
};

class MissingContainer {
  constructor(private readonly identifier: string) {}

  get id() {
    return this.identifier;
  }

  modem = {
    demuxStream: () => undefined,
  };

  async exec() {
    throw createMissingContainerError(this.identifier);
  }

  async getArchive() {
    throw createMissingContainerError(this.identifier);
  }

  async inspect() {
    throw createMissingContainerError(this.identifier);
  }

  async logs() {
    throw createMissingContainerError(this.identifier);
  }

  async putArchive() {
    throw createMissingContainerError(this.identifier);
  }

  async remove() {
    throw createMissingContainerError(this.identifier);
  }

  async start() {
    throw createMissingContainerError(this.identifier);
  }
}

class FakeContainer {
  readonly modem = {
    demuxStream: (
      stream: NodeJS.ReadableStream,
      stdout: NodeJS.WritableStream,
    ) => {
      stream.pipe(stdout);
    },
  };

  running = false;

  constructor(
    public readonly id: string,
    private readonly name: string,
  ) {}

  async exec(options: { Cmd: string[] }) {
    const payload =
      options.Cmd[3] === undefined
        ? JSON.stringify({ status: "ok" })
        : JSON.stringify({ result: { command: "ok" } });

    return {
      inspect: async () => ({ ExitCode: 0 }),
      start: async () => {
        const stream = new PassThrough();
        queueMicrotask(() => {
          stream.end(payload);
        });
        return stream;
      },
    };
  }

  async getArchive() {
    const stream = new PassThrough();
    stream.end("");
    return stream;
  }

  async inspect() {
    if (!fakeDockerState.containersById.has(this.id)) {
      throw createMissingContainerError(this.id);
    }

    return {
      State: {
        ExitCode: this.running ? 0 : 1,
        Running: this.running,
        Status: this.running ? "running" : "exited",
      },
    };
  }

  async logs() {
    return Buffer.from("");
  }

  async putArchive() {}

  async remove() {
    fakeDockerState.containersById.delete(this.id);
    fakeDockerState.containersByName.delete(this.name);
  }

  async start() {
    this.running = true;
  }
}

class DockerMock {
  async createContainer(options: { name: string }) {
    fakeDockerState.createCount += 1;
    const container = new FakeContainer(
      `container-${fakeDockerState.createCount}`,
      options.name,
    );
    fakeDockerState.containersById.set(container.id, container);
    fakeDockerState.containersByName.set(options.name, container);
    return container;
  }

  getContainer(identifier: string) {
    return (
      fakeDockerState.containersById.get(identifier) ??
      fakeDockerState.containersByName.get(identifier) ??
      new MissingContainer(identifier)
    );
  }
}

function createMissingContainerError(identifier: string) {
  const error = new Error(`No such container: ${identifier}`) as Error & {
    statusCode: number;
  };
  error.statusCode = 404;
  return error;
}

vi.mock("dockerode", () => ({
  default: DockerMock,
}));

describe("in-app agent docker sandbox provider", () => {
  beforeEach(() => {
    fakeDockerState.containersById.clear();
    fakeDockerState.containersByName.clear();
    fakeDockerState.createCount = 0;
  });

  it("recreates the named container when it was manually removed", async () => {
    const { createDockerSandboxProvider } =
      await import("@/src/ee/features/in-app-agent/server/sandbox/providers/docker");
    const provider = await createDockerSandboxProvider({
      image: "langfuse-in-app-agent-sandbox:latest",
    });

    const session = await provider.ensureSession({
      conversationId: "conversation-1",
      sessionId: "old-container-id",
    });

    expect(session.sessionId).toBe("conversation-1");
    expect(fakeDockerState.createCount).toBe(1);

    const container = Array.from(fakeDockerState.containersById.values())[0];
    expect(container).toBeDefined();
    await container?.remove();

    await expect(session.sandbox.bash({ command: "ls" })).resolves.toEqual({
      command: "ok",
    });
    expect(fakeDockerState.createCount).toBe(2);
  });
});

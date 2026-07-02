export type SandboxFile = {
  path: string;
  content: string;
};

// ponytail: keep the provider boundary tiny so the agent code does not learn
// Lambda or Docker details. If the sandbox grows, keep new behavior portable.
export type SandboxProvider = {
  name: string;
  ensureSession(params: {
    sessionId?: string | null;
    snapshotKey: string;
  }): Promise<{ sessionId: string }>;
  syncReadonlyFiles(params: {
    sessionId: string;
    files: ReadonlyArray<SandboxFile>;
  }): Promise<void>;
  read(params: { sessionId: string; path: string }): Promise<unknown>;
  write(params: {
    sessionId: string;
    path: string;
    content: string;
  }): Promise<unknown>;
  edit(params: {
    sessionId: string;
    path: string;
    oldText: string;
    newText: string;
  }): Promise<unknown>;
  bash(params: {
    sessionId: string;
    command: string;
    timeoutMs?: number;
  }): Promise<unknown>;
  scheduleSuspension?(params: {
    sessionId: string;
    snapshotKey: string;
    expiresAt: Date;
  }): Promise<void> | void;
};

export type InAppAgentSandbox = {
  read: (params: { path: string }) => Promise<unknown>;
  write: (params: { path: string; content: string }) => Promise<unknown>;
  edit: (params: {
    path: string;
    oldText: string;
    newText: string;
  }) => Promise<unknown>;
  bash: (params: { command: string; timeoutMs?: number }) => Promise<unknown>;
  onTurnEnded: () => Promise<void>;
};

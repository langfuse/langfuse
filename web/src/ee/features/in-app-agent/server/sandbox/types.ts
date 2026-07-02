import type { SandboxFile } from "@repo/in-app-agent-sandbox-server";

export type SandboxProvider = {
  ensureSession(params: {
    conversationId: string;
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
  suspendSession?(params: {
    sessionId: string;
    snapshotKey: string;
  }): Promise<void> | void;
  terminateSession?(params: { sessionId: string }): Promise<void> | void;
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

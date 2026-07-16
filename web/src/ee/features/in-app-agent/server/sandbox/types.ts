export type SandboxFile = {
  path: string;
  content: string;
};

export type InAppAgentSandboxProviderType =
  | "dangerous-docker"
  | "lambda-microvm";

/**
 * Session-bound sandbox execution handle returned by a provider.
 * Implementations close over the backing runtime session so callers only pass
 * per-operation inputs.
 */
export type SandboxSession = {
  /**
   * Refreshes the readonly tool-call files exposed to the current session.
   */
  syncReadonlyFiles(params: {
    files: ReadonlyArray<SandboxFile>;
  }): Promise<void>;
  /**
   * Executes a sandbox `read` operation within the session workspace.
   */
  read(params: { path: string }): Promise<unknown>;
  /**
   * Executes a sandbox `write` operation within the session workspace.
   */
  write(params: { path: string; content: string }): Promise<unknown>;
  /**
   * Executes a sandbox `edit` operation within the session workspace.
   */
  edit(params: {
    path: string;
    oldText: string;
    newText: string;
  }): Promise<unknown>;
  /**
   * Executes a sandbox shell command within the session workspace.
   */
  bash(params: { command: string; timeoutMs?: number }): Promise<unknown>;
};

/**
 * Low-level sandbox runtime contract backed by a concrete provider.
 * Implementations own sandbox creation and return session-bound execution
 * handles for isolated workspaces.
 */
export type SandboxProvider = {
  /**
   * Reuses an existing sandbox session when possible or creates a new one,
   * then returns a session-bound sandbox handle for tool execution.
   */
  ensureSession(params: {
    conversationId: string;
    sessionId?: string | null;
  }): Promise<{ sessionId: string; sandbox: SandboxSession }>;
  /**
   * Persists session state for later reuse and releases any live runtime
   * resources associated with the session.
   */
  suspendSession?(params: { sessionId: string }): Promise<void> | void;
  /**
   * Permanently tears down the backing runtime session without saving state.
   */
  terminateSession?(params: { sessionId: string }): Promise<void> | void;
};

/**
 * Conversation-scoped sandbox handle exposed to the in-app agent turn logic.
 * This wraps a provider-backed session so callers only pass per-operation
 * inputs instead of raw session identifiers.
 */
export type InAppAgentSandbox = {
  read: (params: { path: string }) => Promise<unknown>;
  write: (params: { path: string; content: string }) => Promise<unknown>;
  edit: (params: {
    path: string;
    oldText: string;
    newText: string;
  }) => Promise<unknown>;
  bash: (params: { command: string; timeoutMs?: number }) => Promise<unknown>;
};

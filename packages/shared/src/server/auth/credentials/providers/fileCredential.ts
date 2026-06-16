import fs from "fs";
import type { ManagedAccessToken, ManagedCredentialProvider } from "../types";

const DEFAULT_FILE_TTL_MS = 10 * 60_000; // 10 minutes

export interface FileCredentialProviderOptions {
  /** Path to a file whose contents are the current token / password. */
  path: string;
  /** Username / principal to present alongside the token, if required. */
  username?: string;
  /**
   * Advisory lifetime of the file's contents. The {@link RefreshingTokenManager}
   * uses it to schedule re-reads / re-AUTH, since a plain file carries no expiry.
   */
  ttlMs?: number;
}

/**
 * Cloud-agnostic, zero-dependency credential provider.
 *
 * Reads the token (password) from a file that an *external* mechanism keeps
 * fresh — HashiCorp Vault Agent templating, the Kubernetes CSI Secrets Store
 * driver, a cloud workload-identity sidecar, or any rotation job. The file is
 * re-read on every fetch, so the manager picks up rotations transparently and
 * Langfuse never has to bundle a cloud SDK. This is the recommended path for
 * regulated environments that already run such a refresher.
 */
export class FileCredentialProvider implements ManagedCredentialProvider {
  public readonly name = "file";
  public readonly username?: string;
  private readonly path: string;
  private readonly ttlMs: number;

  constructor(options: FileCredentialProviderOptions) {
    this.path = options.path;
    this.username = options.username;
    this.ttlMs = options.ttlMs ?? DEFAULT_FILE_TTL_MS;
  }

  public async fetchToken(): Promise<ManagedAccessToken> {
    const contents = await fs.promises.readFile(this.path, "utf8");
    const token = contents.trim();
    if (!token) {
      throw new Error(`Credential file "${this.path}" is empty`);
    }
    return {
      token,
      expiresOnTimestamp: Date.now() + this.ttlMs,
    };
  }
}

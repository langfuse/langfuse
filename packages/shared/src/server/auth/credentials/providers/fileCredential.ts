import fs from "fs";
import type { ManagedAccessToken, ManagedCredentialProvider } from "../types";

const DEFAULT_FILE_TTL_MS = 10 * 60_000; // 10 minutes

export interface FileCredentialProviderOptions {
  /** Path to a file whose contents are the current token / password. */
  path: string;
  /** Username / principal to present alongside the token, if required. */
  username?: string;
  /** Advisory lifetime; the manager uses it to schedule re-reads. */
  ttlMs?: number;
}

/**
 * Zero-dependency provider that reads the password from a file kept fresh by an
 * external rotator (Vault Agent, the k8s CSI Secrets Store driver, a
 * workload-identity sidecar). Re-read on every fetch so rotations are picked up.
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

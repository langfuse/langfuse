import type { SandboxProvider } from "../types";

export function createDisabledSandboxProvider(name: string): SandboxProvider {
  const error = () => new Error(`${name} sandbox provider is not implemented yet.`);

  return {
    name,
    async ensureSession() {
      throw error();
    },
    async syncReadonlyFiles() {
      throw error();
    },
    async read() {
      throw error();
    },
    async write() {
      throw error();
    },
    async edit() {
      throw error();
    },
    async bash() {
      throw error();
    },
  };
}

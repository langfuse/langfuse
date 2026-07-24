# Enterprise Edition (EE) code in @langfuse/shared

All content in this directory (`packages/shared/src/ee/`) is licensed under
the license defined in the repository's `ee/LICENSE`, not the MIT license
that applies to the rest of `@langfuse/shared`. See the root `LICENSE` file
for the authoritative list of EE-licensed directories.

Code lives here (instead of `web/src/ee/` or `worker/src/ee/`) when an
EE feature must be consumed by more than one app — e.g. the in-app-agent
runtime, which web's foreground adapter and the worker's background-execution
processor both import so the executor is never duplicated.

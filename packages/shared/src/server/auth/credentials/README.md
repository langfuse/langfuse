# Short-lived infrastructure credentials (POC)

Opt-in support for **identity-based, short-lived credentials** for Langfuse's
infrastructure dependencies, instead of only static username/password secrets.
Primary use case: **Azure Managed Identity**; designed to extend to AWS IAM and
GCP Workload Identity. See discussion
[langfuse/langfuse#14278](https://github.com/orgs/langfuse/discussions/14278).

This POC wires the abstraction into **Redis** end-to-end. Postgres is sketched
in the design notes below (it needs a Prisma driver-adapter change and is left
out of this PR on purpose to keep it small).

## Design

Three layers, mirroring the official Redis `@redis/entraid` package
(`IdentityProvider → TokenManager → CredentialsProvider`) and Grafana's
per-cloud `auth type → factory → provider` pattern:

| Layer | File | Responsibility |
| --- | --- | --- |
| **Provider** | `providers/*.ts` | Mint a fresh token from one backend. Cloud-specific, but tiny and behind a generic interface. |
| **Manager** | `RefreshingTokenManager.ts` | Cache + refresh-ahead + single-flight. Provider-agnostic. |
| **Binding** | `redisCredentials.ts` | Wire a provider/manager into a concrete client (ioredis). |

```
ManagedCredentialProvider.fetchToken()  ──►  RefreshingTokenManager  ──►  consumer (Redis today, Postgres next)
   (azure-managed-identity | file)            refresh @ 80% of TTL          set password + live re-AUTH
```

### Backward compatibility

`REDIS_AUTH_METHOD` defaults to `static`. In that case
`getRedisManagedCredentialProviderFromEnv()` returns `null` and the existing
username/password code path runs **verbatim** — no behavioural change.

### Providers shipped in this POC

- **`azure-managed-identity`** — `AzureManagedIdentityCredentialProvider`, wraps
  `@azure/identity` (`DefaultAzureCredential` / `ManagedIdentityCredential`).
  `@azure/identity` is the only net-new dependency (AWS/GCP SDKs are already in
  the tree) and is **lazy-loaded** (dynamic `import`) so it never loads unless
  this method is selected.
- **`file`** — `FileCredentialProvider`, **zero dependencies**. Reads the token
  from a file kept fresh by an external rotator (Vault Agent, k8s CSI Secrets
  Store, a workload-identity sidecar). The cloud-agnostic, no-lock-in path.

### Azure specifics

- Redis scope: `https://redis.azure.com/.default`; username = the identity's
  **object id** (set via `REDIS_USERNAME`).
- Postgres scope (for the future Postgres path):
  `https://ossrdbms-aad.database.windows.net/.default`.

## Env vars (opt-in)

| Var | Default | Notes |
| --- | --- | --- |
| `REDIS_AUTH_METHOD` | `static` | `static` \| `azure-managed-identity` \| `file` |
| `REDIS_AZURE_CLIENT_ID` | – | user-assigned MI client id (omit for system-assigned) |
| `REDIS_AZURE_SCOPE` | `https://redis.azure.com/.default` | Entra scope |
| `REDIS_AUTH_FILE` | – | required when method = `file` |

## ioredis caveat

ioredis v5 has **no native credentials-provider hook** (unlike node-redis). We
drive it externally per the documented Azure/ElastiCache pattern: install the
first token as `options.password` (with `lazyConnect`), then on each refresh
update `options.password` (covers reconnects) **and** issue a live `AUTH`
(covers the open connection). Cluster/Sentinel paths are not wired in this POC.

## Postgres (design, not in this PR)

Prisma's default engine reads the connection string once, so it can't rotate a
token. The clean, GA path is **Prisma driver adapters** (`@prisma/adapter-pg`)
with a `pg.Pool` whose `password` is an async callback — `pg` invokes it on each
new physical connection, so `RefreshingTokenManager.getToken()` plugs straight
in. Connection lifetime must be capped below the token TTL. Alternatively, a
sidecar proxy (cloud-sql-proxy / RDS Proxy) keeps the app credential-free.

## Tests

`credentials.test.ts` — runs fully local (mocks `@azure/identity`, uses fake
timers, a temp file for the file provider). No cloud resources required.

```bash
pnpm --filter shared exec vitest run src/server/auth/credentials/credentials.test.ts
```

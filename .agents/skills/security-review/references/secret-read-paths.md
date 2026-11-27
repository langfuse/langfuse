# Secret Read Paths

## Threat

Feature read scopes (`automations:read`, `integrations:read`, and siblings) are
held by **every** project role, VIEWER included. Anything a read path returns is
therefore readable by the least-privileged member of the project and ships to
the browser.

Config blobs stored as JSON columns mix display fields with credentials in the
same object: a webhook config carries `secretKey` next to `displaySecretKey`, a
repository-dispatch config carries `githubToken` next to `displayGitHubToken`,
integration configs carry encrypted request headers next to their display
values. Encryption at rest does not make such a field safe to return. The
ciphertext still widens the blast radius of an `ENCRYPTION_KEY` compromise, and
the repo's own standard — visible in the sibling fields that are stripped — is
that these never reach a client.

The recurring shape of the bug: sanitization is written per type, wired into the
write path, and the read path keeps a catch-all fallback for "other types". The
fallback silently ships the next type's credentials, and the type assertion on
it hides the omission from the compiler.

## Canonical Helpers

- Per-type allowlist sanitizers, e.g.
  [`convertToSafeWebhookConfig` / `convertToSafeGitHubDispatchConfig`](../../../../packages/shared/src/domain/automations.ts)
  — they name every field that may leave the server, so a newly added field is
  absent from responses until someone adds it deliberately.
- `Safe*` schemas defined as `FullSchema.omit({ <secret fields> })`, so the safe
  type and the field allowlist (`Object.keys(SafeXSchema.shape)`) stay derived
  from one declaration.
- The paired-accessor convention in
  [`automation-repository.ts`](../../../../packages/shared/src/server/repositories/automation-repository.ts):
  `getActionById` returns the sanitized config for anything client-facing,
  `getActionByIdWithSecrets` returns the raw row and is reserved for execution
  paths (worker delivery, config helpers).
- Column-level secrets: the client-wide `omit` block in
  [`db.ts`](../../../../packages/shared/src/db.ts) excludes secret-bearing
  columns from every Prisma result by default; delivery paths opt back in with
  an explicit `select`. Prefer this over hand-stripping when the secret is its
  own column rather than a JSON field.

## Required Defenses

1. **Sanitize in the shared repository or domain converter, not in the route.**
   One converter must serve every read route *and* the create/update responses.
   A router-level sanitizer only covers the surfaces its author remembered.
2. **Dispatch exhaustively over the type union.** Use a `switch` whose `default`
   assigns to `never`:

   ```ts
   default: {
     const unhandledActionType: never = actionType;
     throw new InternalServerError(`unhandled type ${unhandledActionType}`);
   }
   ```

   A new union member is then a compile error until it has a sanitizer. Never
   write a fallback that returns the stored value for "other or future types".
3. **Build the safe object by allowlist, not by deleting known secrets.** A
   deny-list is only as current as the last person who added a field.
4. **Fail closed on values that do not parse.** Project the stored object onto
   the safe schema's keys instead of passing it through — legacy and
   hand-edited rows are exactly the ones that skip a parse-gated sanitizer.
   Prefer projection over throwing: reads stay available while secrets still
   cannot survive.
5. **Add a negative test on the read path, as the least-privileged role.**
   Assert `expect(config).not.toHaveProperty("<secret>")` for a VIEWER caller
   against both the list route and the single-item route. A clean
   create/update response proves nothing about the read path — that asymmetry
   is how this class of bug survives review.

## Known-Good Call Sites (Copy These)

- [`convertActionToDomain`](../../../../packages/shared/src/server/repositories/automation-repository.ts)
  — exhaustive switch, per-type allowlist sanitizer, allowlist projection as
  the parse-failure fallback; the single converter behind the automations read
  routes and the create/update responses in
  [`router.ts`](../../../../web/src/features/automations/server/router.ts).
- `describe("automations read path secret redaction")` in
  [`automations-trpc.servertest.ts`](../../../../web/src/__tests__/server/automations-trpc.servertest.ts)
  — VIEWER-role read-path negative tests, including a config that fails to
  parse.

## Anti-Patterns to Flag in Review

- **A type assertion standing in for sanitization**: `config: row.config as
  SafeActionConfig`. The name claims the invariant while the cast suppresses
  the only check that would enforce it. Flag every `as Safe*`, `as Public*`,
  `as Redacted*`. If the type carries a security invariant, consider branding
  it so that only the converter can produce a value of that type and a bare
  cast stops compiling.
- **Fallback branches that admit what they do**: a comment along the lines of
  "for X (or future types) return config as-is" is the finding, not context for
  it.
- **Writing a sanitized value back to the database.** Round-tripping a `Safe*`
  config into `prisma.<model>.update({ data: { config } })` persists the
  stripped shape and silently drops the fields the sanitizer removed
  (encrypted headers, stored secrets). Re-read the raw row for writes.
- **Tests that only cover the mutation response**, leaving the read route — the
  one a read-only role can reach — unasserted.

# Web source structure audit

The domain map is a good fit for the application, with targeted ownership work
still needed. Keep recognizable domains directly under `src`, sibling sessions
and tracing, shared AI and analytics, root framework adapters, and the enterprise
mirror under `src/ee`. Relocation improves navigation; it does not by itself
remove framework dependencies or existing import cycles.

This audit compared pre-move `e6e7e35f80` with relocation snapshot `ce8ee22799`
for [PR 18791](https://github.com/langfuse/langfuse/pull/18791), then verified
focused tooling and test repairs. It covered source/import preservation,
framework discovery, backend/API/SDK contracts, frontend flows, ownership and
licensing, security alerts, and the usefulness of the resulting domain boundaries.
The [placement guide](source-structure.md) remains the current contract; the
original structure RFC was not changed.

## Preservation evidence

- All **4,260** original web JS/TS files had mapped destinations. AST comparison
  found 4,228 equivalent pairs and 32 exceptions, inspected separately. Production
  exceptions were equivalent early-return braces and necessary path adjustments.
- A stricter literal comparison excluded actual module references only. Its only
  production non-module string changes were the two relocated font paths; runtime
  URL predicates, payload strings, and templates were preserved.
- **23,453 module references** were compared with resolved pre/post identities,
  import order, and type-only flags. No product module target or type-only flag
  changed. Existing cycles therefore must not be attributed to renamed folders.
- All **225 framework source files** retained their mapped paths and adapter
  behavior. Public API endpoint paths remained **113 → 113**; five App API routes,
  26 public API schema files, 100 enterprise source files, 45 server infrastructure
  files, and eight SDK files were AST-equivalent after path normalization.
- Generated clients, SDK generation scripts, worker/shared/native/enterprise
  package runtime, and queue contracts were unchanged. Fern changes were source
  location comments, not contract changes.
- All 102 enterprise web files remained under `src/ee`; license files were
  unchanged. CODEOWNERS comparison across 6,996 tracked files found no changed
  owner sets. All 299 stories/MDX retained discovery and title grouping; 882 named
  test files remained inside configured discovery roots.

## Repairs made during the audit

- **Shared ownership:** longest matching declared ownership now distinguishes
  nested shared folders from enclosing capabilities in both structure detectors
  and dependency-cruiser scopes. A deeper explicit capability still owns its own
  subtree. Comparing the same graph through old and corrected detectors produced
  zero lost/gained findings for audited placement, import-boundary, server-safety,
  cycle, routing, frozen-primitive, test-isolation, and orphan-export checks.
- **Nested ownership guard:** runtime JS/TS below `src` must have a declared
  capability/shared owner or an explicit infrastructure exemption. Merely living
  inside `ai`, `app`, or `ee` no longer bypasses ownership. Failing-first fixtures
  cover undeclared modules, registered equivalents, and infrastructure/bootstrap
  exceptions. Work-item ranking also uses the registry instead of legacy paths.
- **Scaffolding and lint:** explicit shadcn `aliases.ui` points to
  `src/app/design-system/legacy-primitives`, preventing a duplicate primitive tree.
  Root `instrumentation.ts` retains ten formerly src-wide lint rules. Effective
  lint comparison found only two remaining differences, both stricter rules
  inherited by assistant availability code; no rule exemptions were broadened.
- **Guidance:** active frontend/backend/navigation instructions now describe the
  approved paths and distinguish application `src/app` from Next.js `web/app`.
  Worker/shared layouts were preserved; agent synchronization checks passed.
- **Test synchronization:** the sign-in test now waits for persisted SSO email
  inside its existing `waitFor`. Seeing an immediate sign-in mock call did not
  imply that the storage hook's passive effect had run. Assertions and production
  behavior were preserved; the repaired isolated suite passed all 27 tests.

## Security alert interpretation

The two reviewed CodeQL alerts reappeared because moved paths changed alert
identity, despite identical primary-location fingerprints, query versions, and
security-relevant behavior. An analysis upload succeeding and the results gate
passing are separate checks. Reviewed per-alert decisions were retained; no query,
folder, test category, severity threshold, or required check was broadly disabled.

The password-hash alert was a genuine false positive: the reported value was a
public project ID used in a deterministic experiment ID, not a password. CodeQL
classified the complete result of `createOrgProjectAndApiKey` as sensitive based
on its name. The dataset fixture now generates the project ID separately and
passes it into that factory. Production hashing and API-key creation are unchanged.
A fresh CodeQL analysis is needed to verify removal from raw SARIF; the successful
results check at the audited snapshot predates this fixture adjustment.

The legacy anonymous feedback endpoint really permits wildcard CORS. Its accepted
risk is arbitrary feedback submissions and related abuse, not credentialed
cross-origin data disclosure. Six local CORS assertions passed without outbound
requests. Keep this as a narrow accepted-risk decision, not a false-positive claim;
reassess if authentication, sensitive responses, or privileged actions are added.

## Executed checks and coverage limits

| Check                  | Verified result                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Forced lint            | `Tasks: 9 successful, 9 total`; `Cached: 0 cached, 9 total`                                      |
| Forced typecheck       | `Tasks: 10 successful, 10 total`; `Cached: 0 cached, 10 total`                                   |
| Structure regressions  | `tests 26`, `pass 26`, `fail 0`                                                                  |
| Current layout         | `Source layout: 97 declared capabilities, no legacy feature wrappers`                            |
| Backend unit coverage  | `Test Files 19 passed (19)`; `Tests 241 passed (241)`                                            |
| SDK client coverage    | `Test Files 3 passed (3)`; `Tests 15 passed (15)`                                                |
| Full client suite      | `Test Files 533 passed, 1 skipped (534)`; `Tests 5110 passed, 51 skipped (5161)`                 |
| Clean production build | `Compiled successfully`; `Generating static pages … (87/87)`; OTel worker built and smoke tested |
| Production client scan | `scanned 565 files`; `clean: every referenced identifier is declared or a known global`          |

The full client suite initially exposed the sign-in synchronization failure above;
the post-repair full run passed. Database-backed API suites were not rerun against
the shared local database, which was behind
current migrations; no shared database migration or seed was performed.

Fresh standalone startup, sign-in/sign-up navigation, styles, and both font
weights worked. A negative FIPS startup check exited 1 with the expected provider
error, proving relocated instrumentation executes and retains its guard. Framework
manifests covered the authored routes; traced documentation, ELK, and OTel assets
were present. Earlier standalone HTTP checks also exercised documentation,
rewrites, workers, and unauthenticated API responses.

Authenticated preview coverage included **12 top-level and seven detail/settings
routes, with zero page errors**: populated prompts/scores/charts, prompt tabs,
prompt-to-playground navigation, split playground, assistant opening, and a mobile
prompt view. A real browser Blob worker parsed nested JSON successfully. Populated
trace, session, experiment-comparison, and annotation-item flows remain unverified:
the preview lacked suitable records and expired AWS SSO prevented seeding. No
model inference, billing operation, or external-provider mutation was exercised.

Both clean production builds were then compared under Node 24.16.0 with matching
locked dependencies and build environment. Routes, rendering modes, headers,
rewrites, redirects, CSS, fonts, 16 HTTP probes, and sign-in/sign-up behavior
matched. All 227 trace manifests in each build had zero missing targets; 11,917
server source-map entries matched after relocation/hash normalization. Both client
bundle scans passed. An initial 404-title discrepancy was disproved by this
control: the temporary baseline had selected Node 26. No unrelated metadata
cleanup was retained. Pin runtime versions when comparing future builds.

## Ownership follow-ups, not implemented

1. Move LLM connection forms/tables from `src/public-api/components` to
   `src/ai/provider-connections/components`. Eight of fourteen production modules
   in the former folder concern upstream provider credentials. Keep Langfuse API
   authentication separate. Shared model-parameter UI belongs with AI contracts.
2. Flatten `src/ai/gateway/management-ui` into `src/ai/gateway`: it contains 29
   production server modules, including request authentication and API handlers.
3. Establish server/browser seams: relocate server-only API-key, export, and
   process-runtime modules into explicit server homes; split access-control
   predicates, React hooks, and tRPC exception adapters. Colocate central product
   routers incrementally while keeping tRPC composition in `src/server/api`.
4. Fold small roots only when responsibility supports it: consider
   `operations/background-migrations` → `migrations/background` and
   `developer-experience` → `public-api/developer-tools`. Feature flags/previews
   could live under `app`. Keep `billing`, `entitlements`, and `sdk`: their shared
   contracts, enterprise mirror, or explicit responsibility justify small roots.

Keep generic shell/design-system/search/table infrastructure under `app`, package
boundaries intact, and enterprise implementations under `src/ee`. Do not merge
scores, annotations, evaluators, and experiments merely because review flows
compose them, or create barrels that mix browser UI with server execution.

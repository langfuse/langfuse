# Nothing arrives, and nothing says so

Root causes of bugs that shipped in the coding-agent integrations;
corroborated in: claude-code, codex, opencode, pi. Each section is one
failure class — read the one the symptom table names.

The integration reports success and no telemetry reaches Langfuse: wiring,
transport, configuration scope, and every path that swallows the reason.

## Bootstrap, configuration and transport

- Bind the Langfuse tracer provider explicitly (setLangfuseTracerProvider) instead of relying on the OpenTelemetry global-registry fallback, keep provider.register() for the AsyncLocalStorage context manager, document why both are required, and test the wiring behaviourally with the global registry already occupied — never by asserting on source text, which a bundler can tree-shake.
- Acquire the tracer from the registered provider after registration, never from the global API before it.
- Construct the provider with an explicit resource merged defaultResource() -> integration default service.name -> the SDK's envDetector, plus an explicit sampler and explicit span limits, so ambient OTEL_* variables cannot silently unsample spans or strip attributes; verify the resource on the wire and prove a malformed OTEL_RESOURCE_ATTRIBUTES costs zero traces.
- Resolve configuration narrowest-scope-first and source-first across all spellings of a setting (never grouped by name), document which storage scope each channel actually has, and log the sources — never the values — when one resolved config draws from more than one.
- Use the canonical Langfuse env var names and assert the exact spellings in a test; keep the endpoint default in exactly one place and change the code default, the manifest default, the test pin and the docs in the same commit.
- Parse and validate a configuration value outside the try/except that protects the operation it configures, and fall back to the documented default with a log line; a config-file parse failure must be logged and must never be able to silently disable tracing or discard credentials, with a stale-key regression test for every removed key.
- Route every user-settable option through the config schema and the README, never read an undocumented env var directly in tracing code, and keep per-run context (traceparent, parent ids) in process-scoped variables outside the merged config schema.
- Resolve the hook entrypoint through a host-provided substitution the host expands itself, with no shell syntax and no plugin version in the command string, and assert on the shipped artifact that the command contains no unexpanded shell syntax.
- Never mutate PATH from a hook command; detect the missing runtime and name the interpreter and PATH in the log, and verify by measurement which env vars the host actually forwards before relying on one.
- Declare every transport extra the SDK may need (SOCKS, HTTP/2) in the pinned dependency block, and delegate TLS verification to the OS trust store so a locally trusted CA needs no configuration.
- Make every module the code imports a declared direct dependency, bundle runtime dependencies into the published artifact instead of relying on the host installer to resolve a tree, keep the OTel API unbundled as a singleton with a documented reason, and install the packed artifact with the host's own installer flags before release.
- Run the host's own manifest validator in CI, do not mark a config field required when the runtime already fails open, and document every gate between install and first trace (host hook trust and its re-review, the host's debug log) as a first-class no-traces cause.
- Keep the declared interpreter floor at or above the strictest requires_python of every pinned dependency, and pin the SDK at or above the floor the product docs require for the current data model.

## Fail-open that reports success

- Every code path that ends a run without exporting must write exactly one default-visible line naming the reason; never gate that line behind a debug flag.
- Never report 'trace sent' or 'processed N turns' without evidence of a successful export, and distinguish three states in the status line: disabled by switch, unconfigured, rejected by ingest.
- Initialise logging before any third-party import, and keep everything above the import guard stdlib-only and parseable by the oldest interpreter the entrypoint may be launched under.
- Never read the debug switch only from the configuration channel whose failure the switch exists to explain; read it from the plain environment as well.
- When configuration is missing, log the identity/scope the integration was loaded under and which sources the resolved config came from (never the values), so a delivery-path mismatch is distinguishable from an unconfigured user.
- Surface exporter-background-thread and OTel diag failures in the integration's own log before reporting success.
- Validation that cannot trust telemetry must drop only the field it distrusts and log at a default-visible level; never discard a whole usage payload, span, or export batch silently.
- Contain exceptions per attribute inside any export-time masking or serialisation callback, because an unhandled throw there drops the entire batch.
- Log a discovery miss at the point where discovery could have happened, not only where an already-known id failed to resolve.
- Ship an explicit enable/disable switch checked before any work, plus a documented fail_on_error switch that turns swallowed failures into hook failures for debugging.
- Test a diagnostic by driving the real entrypoint with the failure condition and asserting on the log file or stderr, never by calling the logging helper directly.

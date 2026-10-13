# Client Telemetry and Session Replay Privacy

## Threat

Browser analytics and session replay can export customer-controlled data to a
third party even when the application never sends that value in an explicit
analytics event. Replay recorders observe the rendered DOM, attributes,
portals, network metadata, and optional console/custom events. Input masking
alone does not protect values later rendered as text, and a compliance-sensitive
deployment must not start recording merely because telemetry credentials exist.

## Canonical Langfuse controls

- `web/src/pages/_app.tsx` owns PostHog initialization, deployment gating,
  native/custom input masking, the `ph-no-capture` block class, and network
  body redaction.
- Shared renderers should own `ph-no-capture` whenever they display a value
  whose provenance is customer-controlled. This protects all call sites and
  the subtree's text, attributes, and nested media.
- Portaled hover cards and dialogs need a blocking boundary on the portaled
  content itself; a blocked trigger or logical React parent is insufficient.
- The `posthog-instrumentation` skill owns the implementation and browser-probe
  workflow. Use it together with this review.

## Required review

1. **State the data policy.** Identify what ordinary UI may remain visible,
   what customer-controlled values must never leave the browser, which third
   party receives data, and which deployments/regions are eligible. Escalate
   an ambiguous boundary for product/legal approval.
2. **Trace provenance through every renderer.** Include inputs and outputs,
   dataset records, prompts, generated content, code, identifiers, names,
   tags, comments, metadata, schemas, options, media/URLs, and values copied
   into attributes. Check read-only, edit, history, diff, loading, empty,
   virtualized, hover, and dialog paths.
3. **Enforce at shared boundaries.** Block the smallest shared renderer that
   owns sensitive content. Do not build a fragile page-by-page selector list
   when one editor/viewer component can enforce the rule for every caller.
4. **Follow DOM boundaries.** Treat custom editors, syntax highlighters,
   contenteditable elements, and portaled content independently from native
   inputs. Protect the complete subtree when attributes or nested media can
   carry the same value.
5. **Gate by explicit eligibility.** Default replay to disabled. Use an
   allowlist of approved hosted deployment classes and exclude compliance
   regions and self-hosted/unknown environments. Telemetry keys, hostnames, or
   remote feature flags do not replace the local gate.
6. **Cover non-DOM exports.** Redact request/response bodies and reject raw
   customer values in analytics properties, console capture, custom replay
   events, error breadcrumbs, and URLs.
7. **Test the negative contract.** Add configuration tests for eligible,
   compliance-restricted, and unknown/self-hosted deployments; component tests
   for shared block boundaries; and a real-browser recorder probe with unique
   sentinels. Inspect emitted events and prove forbidden text and attributes
   are absent.

## Findings to raise

- Replay becomes active by default or wherever a telemetry key is configured.
- A customer value is protected while editable but exposed in read-only,
  preview, history, diff, hover, or generated-output form.
- A blocked trigger opens unblocked portaled content.
- A protection covers text but leaves the same value in `title`, `aria-*`, a
  URL, network body, console entry, or custom event.
- A new sensitive renderer relies only on `maskAllInputs`, CSS appearance, or
  a page-specific selector.
- Tests assert configuration or JSX classes without inspecting a representative
  emitted replay after a meaningful recorder-policy change.

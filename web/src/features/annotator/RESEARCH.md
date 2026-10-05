# Annotator UI research notes

## Product hypothesis

Annotation should feel like a focused job, not like a reduced observability
product. The annotator gets one clear task, human-readable evidence, a short
rubric, quiet progress, keyboard shortcuts, and an explicit submit-and-next
action. Guidelines and technical trace detail open on demand.

Administration is a different job. Studio therefore centers on queue health,
workflow setup, preview and publish, and durable activity. It should eventually
surface ambiguity, disagreement, rework, and blocked work—not an annotator
speed leaderboard.

## Patterns worth borrowing

- [Argilla's annotation workflow](https://docs.argilla.io/dev/how_to_guides/annotate/)
  keeps the record and questions together, supports keyboard-driven work, and
  treats distribution as its own concern.
- [Label Studio](https://labelstud.io/guide/setup.html) demonstrates the power
  of declarative labeling configuration, but its XML-like builder also shows
  how configuration complexity can become a product of its own.
- [Prodigy](https://prodigy.ai/docs/api-web-app) optimizes for one decision at a
  time and a tight accept/reject/ignore loop.
- [JSON Forms](https://jsonforms.io/docs/) separates a data schema from a UI
  schema and uses a renderer registry instead of generated application code.
- [A2UI](https://github.com/a2ui-project/a2ui/blob/main/specification/v1_0/docs/a2ui_protocol.md)
  and [json-render](https://github.com/vercel-labs/json-render) are useful
  references for catalog-constrained generative UI.
- [OpenAI's structured-output generative UI sample](https://github.com/openai/openai-structured-outputs-samples/tree/main/generative-ui)
  shows how model output can be validated before rendering.
- [AWS Bedrock structured outputs](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)
  support schema-constrained generation. The model-facing schema should remain
  shallow; richer catalog and product semantics still need application-side
  validation.

Research on [annotator disagreement](https://aclanthology.org/2022.tacl-1.6/)
also argues against reducing quality to a single “gold” answer too early.
Disagreement is often product information: unclear guidance, ambiguous source
material, or a task that needs adjudication.

## Spike decisions

1. Use separate `/annotator` pages and a minimal shell. Hiding the existing
   sidebar is presentation only; it does not create a new authorization role.
2. Bind one workflow to a real annotation queue. A published version drives the
   task evidence layout and response controls.
3. Store immutable workflow versions. A response records the exact version that
   rendered the task.
4. Let AI draft the declarative spec with the configured instance AI model by
   default. Project model connections remain an explicit alternative. Bedrock
   responses are parsed as JSON and validated against the full spec before
   saving; the generated object is never executed as code.
5. Render only a trusted catalog. The v1 contract has two layouts, three fixed
   evidence bindings, four question types, and one fixed submit action. There
   are no scripts, arbitrary HTML, URLs, styles, expressions, JSON paths, or
   custom network actions.
6. Treat legacy score configurations as a future output adapter. They remain
   useful for analytics compatibility, but they do not define the new authoring
   model.

An iframe is unnecessary for the trusted catalog. If arbitrary extensions are
ever introduced, they need a separate-origin sandbox and a typed capability
broker; combining same-origin content with both `allow-scripts` and
`allow-same-origin` defeats the isolation described by
[MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe).

## Explicit next seams

- A real Annotator role with separate setup, annotate, and activity scopes.
- Persisted skip, flag, draft, lease, and recent-undo behavior.
- Multiple independent attempts, overlap, disagreement views, review, and
  adjudication.
- Schema-aware evidence bindings for sessions and observations.
- Semantic diff and approval before publishing an AI-generated version.
- Projection of submitted answers into legacy Scores where compatibility is
  required.

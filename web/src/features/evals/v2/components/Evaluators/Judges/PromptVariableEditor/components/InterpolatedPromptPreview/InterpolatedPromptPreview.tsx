import { Fragment } from "react";

/**
 * The prompt split at its `{{variable}}` boundaries: `text` is a literal run of
 * prompt copy, `variable` is one filled-in placeholder — `value` is the sample
 * data substituted for `{{name}}`. Concatenated, the fragments are the prompt
 * the evaluator will actually send.
 */
export type InterpolatedPromptFragment =
  | { type: "text"; text: string }
  | { type: "variable"; name: string; value: string };

export type InterpolatedPromptPreviewState =
  | { status: "ready"; fragments: InterpolatedPromptFragment[] }
  | { status: "unavailable"; message: string };

/** Displays a resolved prompt while preserving where mapped values were inserted. */
export function InterpolatedPromptPreview({
  state,
}: {
  state: InterpolatedPromptPreviewState;
}) {
  if (state.status === "unavailable") {
    return (
      <p className="text-muted-foreground bg-muted/30 rounded-b-md border p-3 text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <pre className="bg-muted/30 max-h-[60dvh] overflow-y-auto rounded-b-md border p-3 font-sans text-sm whitespace-pre-wrap">
      {state.fragments.map((fragment, index) => (
        <Fragment key={index}>
          {fragment.type === "text" ? (
            fragment.text
          ) : (
            <span
              className="bg-primary-accent/10 rounded px-0.5"
              title={`{{${fragment.name}}}`}
            >
              {fragment.value}
            </span>
          )}
        </Fragment>
      ))}
    </pre>
  );
}

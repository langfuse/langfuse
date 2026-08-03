import { render } from "@testing-library/react";
import {
  ComposerTokens,
  WORD_JOINER,
} from "@/src/features/search-bar/components/ComposerTokens";

/** Rendered text of the draft, with the layout-only word joiners stripped. */
function renderedText(draft: string): string {
  const { container } = render(
    <ComposerTokens draft={draft} showDiagnostics={false} />,
  );
  return (container.textContent ?? "").split(WORD_JOINER).join("");
}

describe("ComposerTokens", () => {
  it("renders a quoted dot-path key without mangling the value", () => {
    // The field/value split must land at the colon OUTSIDE the quoted key
    // segment. A quote-blind `indexOf(":")` would split inside `"foo:bar"` and
    // render the value as `bar":*x*` (the pill would show a different filter
    // than the one committed, and the broken text can re-enter the draft).
    expect(renderedText('metadata."foo:bar":*x*')).toBe(
      'metadata."foo:bar":*x*',
    );
    // Spaced score name (no inner colon) must also round-trip.
    expect(renderedText('scores."Rouge Score":>=1')).toBe(
      'scores."Rouge Score":>=1',
    );
  });
});

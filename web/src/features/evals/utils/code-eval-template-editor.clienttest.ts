import { EditorState } from "@codemirror/state";
import { linter, setDiagnostics } from "@codemirror/lint";
import { EditorView } from "@uiw/react-codemirror";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  commitCodeEvalSourceChange,
  mapCodeEvalDiagnosticsToCodeMirror,
} from "@/src/features/evals/utils/code-eval-template-editor";

const mountedViews: EditorView[] = [];

afterEach(() => {
  while (mountedViews.length > 0) {
    const view = mountedViews.pop();
    view?.destroy();
  }
});

describe("commitCodeEvalSourceChange", () => {
  it("does not echo an unchanged CodeMirror document into form state", () => {
    const currentValueRef = { current: "const score = 1;" };
    const onChange = vi.fn();

    expect(
      commitCodeEvalSourceChange("const score = 1;", currentValueRef, onChange),
    ).toBe(false);

    expect(onChange).not.toHaveBeenCalled();
    expect(currentValueRef.current).toBe("const score = 1;");
  });

  it("propagates a real document change and remembers it", () => {
    const currentValueRef = { current: "const score = 1;" };
    const onChange = vi.fn();

    expect(
      commitCodeEvalSourceChange("const score = 2;", currentValueRef, onChange),
    ).toBe(true);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("const score = 2;");
    expect(currentValueRef.current).toBe("const score = 2;");
  });
});

describe("mapCodeEvalDiagnosticsToCodeMirror", () => {
  it("keeps a diagnostic covering at least one character", () => {
    expect(
      mapCodeEvalDiagnosticsToCodeMirror([
        {
          from: 4,
          to: 4,
          severity: "error",
          message: "missing return",
        },
      ]),
    ).toEqual([
      {
        from: 4,
        to: 5,
        severity: "error",
        message: "missing return",
      },
    ]);
  });

  it("does not change the document when applying lint diagnostics", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "const score = 1;",
        extensions: [linter(null)],
      }),
    });
    mountedViews.push(view);

    const transaction = view.state.update(
      setDiagnostics(
        view.state,
        mapCodeEvalDiagnosticsToCodeMirror([
          {
            from: 6,
            to: 11,
            severity: "error",
            message: "unused variable",
          },
        ]),
      ),
    );

    expect(transaction.docChanged).toBe(false);
    view.dispatch(transaction);
    expect(view.state.doc.toString()).toBe("const score = 1;");
    parent.remove();
  });
});

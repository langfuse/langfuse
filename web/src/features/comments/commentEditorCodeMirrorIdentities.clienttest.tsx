// @vitest-environment jsdom

import { render } from "@testing-library/react";
import type * as ReactCodeMirror from "@uiw/react-codemirror";
import { CommentEditor } from "./components/CommentEditor";

const latestProps = vi.hoisted(() => ({
  current: null as {
    extensions?: unknown;
    onChange?: unknown;
    onUpdate?: unknown;
    onCreateEditor?: unknown;
    editable?: boolean;
    readOnly?: boolean;
  } | null,
}));

vi.mock("@uiw/react-codemirror", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactCodeMirror>();

  return {
    ...actual,
    default: (
      props: (typeof latestProps)["current"] & Record<string, unknown>,
    ) => {
      latestProps.current = props;
      return <div data-testid="comment-editor" />;
    },
  };
});

describe("CommentEditor react-codemirror identities", () => {
  beforeEach(() => {
    latestProps.current = null;
  });

  it("keeps onChange, onUpdate, and extensions stable when parent callbacks churn", () => {
    const { rerender } = render(
      <CommentEditor
        value="Draft comment"
        onChange={() => undefined}
        onCursorChange={() => undefined}
        onKeyDown={() => false}
      />,
    );

    const first = latestProps.current;
    expect(first?.onChange).toEqual(expect.any(Function));
    expect(first?.onUpdate).toEqual(expect.any(Function));
    expect(first?.extensions).toBeDefined();

    rerender(
      <CommentEditor
        value="Draft comment"
        onChange={() => undefined}
        onCursorChange={() => undefined}
        onKeyDown={() => true}
      />,
    );

    expect(latestProps.current?.onChange).toBe(first?.onChange);
    expect(latestProps.current?.onUpdate).toBe(first?.onUpdate);
    expect(latestProps.current?.onCreateEditor).toBe(first?.onCreateEditor);
    expect(latestProps.current?.extensions).toBe(first?.extensions);
  });

  it("still reconfigures editable/readOnly when the editor is disabled", () => {
    const { rerender } = render(
      <CommentEditor value="Draft comment" onChange={() => undefined} />,
    );

    expect(latestProps.current?.editable).toBe(true);
    expect(latestProps.current?.readOnly).toBeFalsy();

    rerender(
      <CommentEditor
        value="Draft comment"
        onChange={() => undefined}
        disabled
      />,
    );

    expect(latestProps.current?.editable).toBe(false);
    expect(latestProps.current?.readOnly).toBe(true);
  });

  it("forwards document and cursor updates through the latest callbacks", () => {
    const firstOnChange = vi.fn();
    const firstOnCursorChange = vi.fn();
    const { rerender } = render(
      <CommentEditor
        value=""
        onChange={firstOnChange}
        onCursorChange={firstOnCursorChange}
      />,
    );

    const stableOnChange = latestProps.current?.onChange as (
      value: string,
    ) => void;
    const stableOnUpdate = latestProps.current?.onUpdate as (update: {
      selectionSet: boolean;
      docChanged: boolean;
      state: { selection: { main: { head: number } } };
    }) => void;
    const nextOnChange = vi.fn();
    const nextOnCursorChange = vi.fn();

    rerender(
      <CommentEditor
        value=""
        onChange={nextOnChange}
        onCursorChange={nextOnCursorChange}
      />,
    );

    stableOnChange("hello");
    stableOnUpdate({
      selectionSet: true,
      docChanged: false,
      state: { selection: { main: { head: 5 } } },
    });

    expect(firstOnChange).not.toHaveBeenCalled();
    expect(firstOnCursorChange).not.toHaveBeenCalled();
    expect(nextOnChange).toHaveBeenCalledWith("hello");
    expect(nextOnCursorChange).toHaveBeenCalledWith(5);
  });

  it("rebuilds extensions when content attributes change", () => {
    const { rerender } = render(
      <CommentEditor
        value=""
        onChange={() => undefined}
        id="comment-content"
      />,
    );
    const firstExtensions = latestProps.current?.extensions;

    rerender(
      <CommentEditor
        value=""
        onChange={() => undefined}
        id="comment-content"
        aria-invalid={true}
      />,
    );

    expect(latestProps.current?.extensions).not.toBe(firstExtensions);
  });
});

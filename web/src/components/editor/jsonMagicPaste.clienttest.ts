import { EditorSelection, EditorState } from "@codemirror/state";

import {
  escapeForJsonStringBody,
  isInsideJsonString,
  isValidJson,
  planMagicPaste,
} from "./jsonMagicPaste";

function jsonState(doc: string, anchor = 0, head = anchor): EditorState {
  return EditorState.create({ doc, selection: { anchor, head } });
}

describe("escapeForJsonStringBody", () => {
  it("escapes quotes, backslashes, and newlines", () => {
    expect(escapeForJsonStringBody('say "hi"\nbye')).toBe('say \\"hi\\"\\nbye');
    expect(escapeForJsonStringBody("a\\b")).toBe("a\\\\b");
    expect(escapeForJsonStringBody("tab\there")).toBe("tab\\there");
  });

  it("is a no-op for text with no JSON-special characters", () => {
    expect(escapeForJsonStringBody("plain text 123")).toBe("plain text 123");
  });

  it("round-trips: wrapping the body in quotes parses back to the input", () => {
    const text = 'multi\nline "quoted" \\ slash';
    expect(JSON.parse(`"${escapeForJsonStringBody(text)}"`)).toBe(text);
  });
});

describe("isValidJson", () => {
  it.each([
    ['{"a":1}', true],
    ['"x"', true],
    ["42", true],
    ["true", true],
    ["hello", false],
    ["", false],
    ["   ", false],
    ['{"a":}', false],
  ] as const)("isValidJson(%j) === %s", (input, expected) => {
    expect(isValidJson(input)).toBe(expected);
  });
});

describe("isInsideJsonString", () => {
  const doc = '{"key": "value"}';

  it("is true inside a string value body", () => {
    const pos = doc.indexOf("value") + 2; // between v-a-l...
    expect(isInsideJsonString(jsonState(doc, pos), pos)).toBe(true);
  });

  it("is true inside a property name", () => {
    const pos = doc.indexOf("key") + 1;
    expect(isInsideJsonString(jsonState(doc, pos), pos)).toBe(true);
  });

  it("is false at a structural position (after the colon)", () => {
    const pos = doc.indexOf(":") + 1;
    expect(isInsideJsonString(jsonState(doc, pos), pos)).toBe(false);
  });

  it("is false on the opening quote boundary", () => {
    const pos = doc.indexOf('"value"'); // on the quote itself
    expect(isInsideJsonString(jsonState(doc, pos), pos)).toBe(false);
  });

  it("is false in an empty document", () => {
    expect(isInsideJsonString(jsonState("", 0), 0)).toBe(false);
  });

  it("treats an unterminated string as open", () => {
    const open = '{"a": "ab';
    const pos = open.length; // caret at EOF, inside the unterminated string
    expect(isInsideJsonString(jsonState(open, pos), pos)).toBe(true);
  });
});

describe("planMagicPaste", () => {
  it("escapes a fragment pasted inside a string value", () => {
    const doc = '{"text": ""}';
    const pos = doc.indexOf('""') + 1; // between the empty string's quotes
    const plan = planMagicPaste(jsonState(doc, pos), 'a "quote"\nline');
    expect(plan).toMatchObject({
      kind: "escape",
      from: pos,
      to: pos,
      insert: 'a \\"quote\\"\\nline',
    });
  });

  it("returns null inside a string when nothing needs escaping", () => {
    const doc = '{"text": ""}';
    const pos = doc.indexOf('""') + 1;
    expect(planMagicPaste(jsonState(doc, pos), "plain words")).toBeNull();
  });

  it("wraps a non-JSON blob pasted into an empty field", () => {
    const text = 'Chapter 1.\nHe said "stop".';
    const plan = planMagicPaste(jsonState("", 0), text);
    expect(plan).toMatchObject({
      kind: "wrap",
      from: 0,
      to: 0,
      insert: JSON.stringify(text),
      raw: text,
    });
    // The wrapped result is valid JSON.
    expect(isValidJson(plan!.insert)).toBe(true);
  });

  it("does not wrap when the pasted blob is already valid JSON", () => {
    expect(planMagicPaste(jsonState("", 0), '{"x": 1}')).toBeNull();
  });

  it("still wraps a blank (whitespace-only) field", () => {
    const plan = planMagicPaste(jsonState("   \n  ", 0), "hi there");
    expect(plan).toMatchObject({ kind: "wrap", insert: '"hi there"' });
  });

  it("does NOT wrap select-all-then-paste over existing content", () => {
    // Wrapping a whole-doc replacement would silently stringify the user's
    // existing structure; leave it to normal paste instead.
    const doc = '{"old": 1}';
    expect(
      planMagicPaste(jsonState(doc, 0, doc.length), "just text"),
    ).toBeNull();
  });

  it("defers multi-cursor pastes to native per-cursor paste", () => {
    const doc = '{"a":"","b":""}';
    const a = doc.indexOf('""') + 1;
    const b = doc.lastIndexOf('""') + 1;
    const state = EditorState.create({
      doc,
      selection: EditorSelection.create([
        EditorSelection.cursor(a),
        EditorSelection.cursor(b),
      ]),
      // basicSetup enables this in the real editor; needed for >1 range to stick.
      extensions: [EditorState.allowMultipleSelections.of(true)],
    });
    expect(state.selection.ranges.length).toBe(2);
    expect(planMagicPaste(state, 'x"y')).toBeNull();
  });

  it("leaves a mid-document structural paste alone", () => {
    const doc = '{"a": 1, "b": 2}';
    const pos = doc.indexOf(", ") + 1; // structural position between properties
    expect(planMagicPaste(jsonState(doc, pos), "garbage")).toBeNull();
  });

  it("escapes a selection wholly inside one string value", () => {
    const doc = '{"a": "hello"}';
    const from = doc.indexOf("hello"); // start of the value text
    const to = from + "hello".length; // end, still inside the same string
    const plan = planMagicPaste(jsonState(doc, from, to), 'x"y');
    expect(plan).toMatchObject({ kind: "escape", from, to, insert: 'x\\"y' });
  });

  it("does NOT escape a selection that spans two different strings", () => {
    // Selecting from inside the first value, across `","b":"`, into the second
    // would collapse the two keys if escaped. Must be left to normal paste. Use a
    // paste that needs escaping so the no-op short-circuit doesn't mask the gate.
    const doc = '{"a":"1","b":"2"}';
    const from = doc.indexOf("1"); // inside the first value
    const to = doc.indexOf("2"); // inside the second value
    expect(planMagicPaste(jsonState(doc, from, to), 'x"y')).toBeNull();
  });

  it("does NOT escape when the caret sits mid-escape (after a lone backslash)", () => {
    // doc `"a\nb"` is valid JSON (string a + newline + b); caret between `\` and
    // `n`. Escaping there would split the `\n` and corrupt the JSON.
    const doc = '"a\\nb"';
    const pos = doc.indexOf("\\") + 1; // right after the backslash
    expect(planMagicPaste(jsonState(doc, pos), '"')).toBeNull();
  });

  it("returns null for an empty paste", () => {
    expect(planMagicPaste(jsonState("", 0), "")).toBeNull();
  });
});

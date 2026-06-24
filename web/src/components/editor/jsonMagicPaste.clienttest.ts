import { EditorState } from "@codemirror/state";

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

  it("wraps when the paste replaces the whole document", () => {
    const doc = '{"old": 1}';
    const plan = planMagicPaste(jsonState(doc, 0, doc.length), "just text");
    expect(plan).toMatchObject({ kind: "wrap", from: 0, to: doc.length });
  });

  it("leaves a mid-document structural paste alone", () => {
    const doc = '{"a": 1, "b": 2}';
    const pos = doc.indexOf(", ") + 1; // structural position between properties
    expect(planMagicPaste(jsonState(doc, pos), "garbage")).toBeNull();
  });

  it("returns null for an empty paste", () => {
    expect(planMagicPaste(jsonState("", 0), "")).toBeNull();
  });
});

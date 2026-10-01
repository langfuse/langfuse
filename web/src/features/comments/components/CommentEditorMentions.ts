import { StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@uiw/react-codemirror";
import { MENTION_USER_PREFIX } from "@/src/features/comments/lib/mentionParser";

class MentionWidget extends WidgetType {
  constructor(
    private readonly displayName: string,
    private readonly userId: string,
  ) {
    super();
  }

  eq(other: MentionWidget) {
    return (
      other.displayName === this.displayName && other.userId === this.userId
    );
  }

  toDOM() {
    const chip = document.createElement("span");
    chip.textContent = `@${this.displayName.replace(/\s+/g, " ")}`;
    chip.dataset.userId = this.userId;
    chip.contentEditable = "false";
    chip.className =
      "bg-accent text-accent-foreground rounded px-1 py-0.5 font-bold";
    return chip;
  }

  ignoreEvent() {
    return false;
  }
}

function decorateMentions(state: EditorState): DecorationSet {
  // Keep the wire-format boundaries aligned with mentionParser, including
  // bracketed and multiline display names. Only the chip normalizes whitespace.
  const pattern = new RegExp(
    `@\\[([\\s\\S]{1,100}?)\\]\\(${MENTION_USER_PREFIX}([a-z0-9_-]{1,30})\\)`,
    "gi",
  );
  const ranges = Array.from(state.doc.toString().matchAll(pattern), (match) =>
    Decoration.replace({
      widget: new MentionWidget(match[1]!, match[2]!),
    }).range(match.index, match.index + match[0].length),
  );
  return Decoration.set(ranges);
}

// A state field supplies decorations before layout, so a mention can replace
// line breaks in its stored display name as well as ordinary inline text.
export const commentEditorMentions = StateField.define<DecorationSet>({
  create: decorateMentions,
  update: (decorations, transaction) =>
    transaction.docChanged ? decorateMentions(transaction.state) : decorations,
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

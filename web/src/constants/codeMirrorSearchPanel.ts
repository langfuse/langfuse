import { search } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@uiw/react-codemirror";

const KEYBOARD_NAVIGATION_CLASS = "cm-keyboard-navigation";

const keyboardNavigation = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      view.dom.addEventListener("keydown", this.handleKeyDown, true);
      view.dom.addEventListener("mousedown", this.handleMouseDown, true);
    }

    private readonly handleKeyDown = () => {
      this.view.dom.classList.add(KEYBOARD_NAVIGATION_CLASS);
    };

    private readonly handleMouseDown = () => {
      this.view.dom.classList.remove(KEYBOARD_NAVIGATION_CLASS);
    };

    destroy() {
      this.view.dom.removeEventListener("keydown", this.handleKeyDown, true);
      this.view.dom.removeEventListener(
        "mousedown",
        this.handleMouseDown,
        true,
      );
    }
  },
);

const searchPanelTheme = EditorView.theme({
  ".cm-panels-top": {
    borderBottom: "1px solid hsl(var(--border))",
  },
  ".cm-panel.cm-search": {
    position: "relative",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "4px",
    padding: "6px 40px 6px 8px",
    backgroundColor: "hsl(var(--secondary))",
    color: "hsl(var(--secondary-foreground))",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
  },
  ".cm-panel.cm-search br": {
    display: "none",
  },
  ".cm-panel.cm-search input[name=search], .cm-panel.cm-search input[name=replace]":
    {
      boxSizing: "border-box",
      width: "min(220px, 100%)",
      height: "32px",
      margin: "0",
      border: "1px solid hsl(var(--input))",
      borderRadius: "6px",
      backgroundColor: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      padding: "4px 8px",
      fontFamily: "var(--font-sans)",
      fontSize: "var(--text-sm)",
      outline: "none",
    },
  ".cm-panel.cm-search input[name=search]:focus, .cm-panel.cm-search input[name=replace]:focus":
    {
      borderColor: "hsl(var(--ring))",
    },
  ".cm-panel.cm-search button": {
    boxSizing: "border-box",
    height: "32px",
    margin: "0",
    border: "1px solid hsl(var(--border-contrast))",
    borderRadius: "6px",
    backgroundColor: "hsl(var(--background))",
    backgroundImage: "none",
    color: "hsl(var(--foreground))",
    padding: "0 12px",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
    lineHeight: "30px",
    textTransform: "capitalize",
    cursor: "pointer",
  },
  ".cm-panel.cm-search button:hover": {
    backgroundColor: "hsl(var(--accent))",
    color: "hsl(var(--accent-foreground))",
  },
  ".cm-panel.cm-search button:focus-visible": {
    outline: "2px solid hsl(var(--ring))",
    outlineOffset: "2px",
  },
  ".cm-panel.cm-search button:disabled": {
    cursor: "not-allowed",
    opacity: "0.5",
  },
  ".cm-panel.cm-search label": {
    display: "inline-flex",
    height: "32px",
    alignItems: "center",
    gap: "4px",
    margin: "0",
    borderRadius: "6px",
    color: "hsl(var(--muted-foreground))",
    padding: "0 4px",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-xs)",
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  ".cm-panel.cm-search label:hover": {
    backgroundColor: "hsl(var(--accent))",
    color: "hsl(var(--accent-foreground))",
  },
  ".cm-panel.cm-search input[type=checkbox]": {
    boxSizing: "border-box",
    display: "inline-flex",
    width: "16px",
    height: "16px",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    margin: "0",
    appearance: "none",
    border: "1px solid hsl(var(--control-border))",
    borderRadius: "4px",
    backgroundColor: "transparent",
    outline: "none",
    cursor: "pointer",
  },
  "&.cm-keyboard-navigation .cm-panel.cm-search input[type=checkbox]:focus": {
    outline: "2px solid hsl(var(--ring))",
    outlineOffset: "2px",
  },
  ".cm-panel.cm-search input[type=checkbox]:checked": {
    borderColor: "hsl(var(--control-fill))",
    backgroundColor: "hsl(var(--control-fill))",
  },
  ".cm-panel.cm-search input[type=checkbox]:checked::after": {
    width: "12px",
    height: "12px",
    backgroundColor: "hsl(var(--primary-foreground))",
    content: "''",
    maskImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20 6 9 17l-5-5' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
  },
  ".cm-panel.cm-search button[name=close]": {
    position: "absolute",
    top: "6px",
    right: "8px",
    width: "32px",
    borderColor: "transparent",
    backgroundColor: "transparent",
    padding: "0",
    fontSize: "16px",
    lineHeight: "30px",
  },
});

/** Shared top-mounted search panel for prompt and code editors. */
export const codeMirrorSearchPanel: Extension = [
  search({ top: true }),
  keyboardNavigation,
  searchPanelTheme,
];

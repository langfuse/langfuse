import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { type Extension } from "@codemirror/state";

const javascriptExtensions: Extension[] = [javascript()];
const pythonExtensions: Extension[] = [python()];
const shellExtensions: Extension[] = [StreamLanguage.define(shell)];
const textExtensions: Extension[] = [];

export function getSkillFileLanguageExtensions(path: string): Extension[] {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  switch (extension) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return javascriptExtensions;
    case ".py":
      return pythonExtensions;
    case ".sh":
    case ".bash":
    case ".zsh":
      return shellExtensions;
    default:
      return textExtensions;
  }
}

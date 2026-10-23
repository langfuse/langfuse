import { type JsonViewState } from "../JsonViewController";

export function getJsonViewContentKind(state: JsonViewState) {
  if (state.largeStringValue !== null) return "large-string";
  if (state.currentView === "json") return "json";
  if (state.isEmpty) return "empty";
  if (state.isMarkdown) return "markdown";
  if (state.isChatML) return "json";
  return "table";
}

import preview from "../../../../.storybook/preview";
import { SemanticTokens as SemanticTokensPage } from "./SemanticTokens";

const meta = preview.meta({
  component: SemanticTokensPage,
  parameters: {
    layout: "fullscreen",
  },
});

// Display name matches the file title so Storybook's single-story hoisting
// collapses Design / Semantic tokens into one sidebar leaf.
export const SemanticTokens = meta.story({ name: "Semantic tokens" });

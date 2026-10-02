import preview from "../../../../.storybook/preview";
import { ComposerTokens } from "./ComposerTokens";

const meta = preview.meta({
  component: ComposerTokens,
  args: { showDiagnostics: false },
  // ComposerTokens returns inline content; host it in a bar-like box so the
  // tokens render in a representative context.
  decorators: [
    (Story) => (
      <div className="border-input bg-background max-w-2xl rounded-md border px-3 py-2 font-mono text-xs leading-6">
        <Story />
      </div>
    ),
  ],
});

export const Default = meta.story({
  args: { draft: "level:ERROR -environment:dev latency:>2" },
});

export const Empty = meta.story({
  args: { draft: "" },
});

export const AnyOfGroup = meta.story({
  args: { draft: "level:(ERROR OR WARNING) type:GENERATION" },
});

export const FreeTextAndScopes = meta.story({
  args: { draft: "timeout input:refund scores.accuracy:>0.8" },
});

export const InvalidRevealed = meta.story({
  args: { draft: "level:ERROR nope:1", showDiagnostics: true },
});

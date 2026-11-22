/* eslint-disable @repo/no-style-props */
import { type ComponentProps } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/src/utils/tailwind";
import { MarkdownViewController } from "./MarkdownViewController";
import { MarkdownViewContent } from "./MarkdownViewContent";

export { prependBasePathToInternalHref } from "./MarkdownViewContent";

export function MarkdownView({
  markdown,
  audio,
  media,
  className,
}: Pick<
  ComponentProps<typeof MarkdownViewController>,
  "markdown" | "audio" | "media"
> & {
  className?: string;
}) {
  const { forcedTheme, resolvedTheme } = useTheme();
  const theme = forcedTheme ?? resolvedTheme;

  return (
    <MarkdownViewController markdown={markdown} audio={audio} media={media}>
      {(state) => (
        <div
          className={cn(
            "io-message-content ph-no-capture px-1 pt-1 pb-2",
            className,
          )}
          key={theme}
        >
          <MarkdownViewContent state={state} />
        </div>
      )}
    </MarkdownViewController>
  );
}

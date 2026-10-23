import { type ReactNode } from "react";
import {
  type OpenAIContentSchema,
  type OpenAIOutputAudioType,
  isOpenAITextContentPart,
} from "@langfuse/shared";
import { type z } from "zod";
import { type MediaReturnType } from "@/src/features/media";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  filterAlreadyRenderedMedia,
  getRenderedInlineMediaIds,
  getStandaloneMediaReferenceStrings,
} from "./markdown-media.utils";
import {
  classifyMediaValue,
  splitStringByMediaReferences,
} from "./media/mediaUtils";

export function MarkdownViewController({
  markdown,
  audio,
  media,
  children,
}: {
  /** Keep media references unparsed so content-part guards can recognize them. */
  markdown: string | z.input<typeof OpenAIContentSchema>;
  audio?: OpenAIOutputAudioType;
  media?: MediaReturnType[];
  children: (state: MarkdownViewState) => ReactNode;
}) {
  const markdownContent =
    typeof markdown === "string"
      ? markdown
      : (markdown ?? [])
          .map((item) => {
            if (typeof item === "string") return item;
            if (item.type === "text") return item.text;
            if (item.type === "image_url")
              return `![image](${item.image_url.url})`;
            if (item.type === "input_audio")
              return `![audio](${item.input_audio.data})`;
            return undefined;
          })
          .join("\n");

  // Media references and base64 payloads must not count towards prompt length.
  const textContent =
    typeof markdown === "string"
      ? splitStringByMediaReferences(markdown)
          .filter((part) => part.type === "text")
          .map((part) => part.value)
          .join("")
          .trim()
      : (markdown ?? [])
          .filter(isOpenAITextContentPart)
          .map((part) => part.text)
          .join("\n");

  return children({
    markdown,
    audio,
    textContent,
    copy: () => copyTextToClipboard(markdownContent),
    standaloneMediaDescriptor:
      typeof markdown === "string" ? classifyMediaValue(markdown) : null,
    inlineMediaReferenceStrings:
      typeof markdown === "string"
        ? getStandaloneMediaReferenceStrings(markdown)
        : [],
    remainingMedia: filterAlreadyRenderedMedia(
      media,
      getRenderedInlineMediaIds({ markdown, audio }),
    ),
  });
}

export type MarkdownViewState = {
  markdown: string | z.input<typeof OpenAIContentSchema>;
  audio: OpenAIOutputAudioType | undefined;
  textContent: string;
  copy: () => void;
  standaloneMediaDescriptor: ReturnType<typeof classifyMediaValue>;
  inlineMediaReferenceStrings: string[];
  remainingMedia: MediaReturnType[];
};

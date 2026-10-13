import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { type MediaReturnType } from "@/src/features/media";

// SectionMedia props
export interface SectionMediaProps {
  media: MediaReturnType[];
}

/**
 * SectionMedia renders media attachments at the bottom of the message list.
 */
export function SectionMedia({ media }: SectionMediaProps) {
  return (
    <>
      <div className="io-message-header px-1 py-1 text-base font-bold">
        Media
      </div>
      <div className="ph-no-capture flex flex-wrap gap-2 pb-4">
        {media.map((m) => (
          <LangfuseMediaView
            mediaAPIReturnValue={m}
            variant={m.contentType.startsWith("image") ? "inline" : "icon"}
            key={m.mediaId}
          />
        ))}
      </div>
    </>
  );
}

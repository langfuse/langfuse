import { IOSection } from "@/src/components/ui/IOSection";
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
    <IOSection title="Media" variant="media">
      <div className="flex flex-wrap gap-2">
        {media.map((m) => (
          <LangfuseMediaView
            mediaAPIReturnValue={m}
            variant={m.contentType.startsWith("image") ? "inline" : "icon"}
            key={m.mediaId}
          />
        ))}
      </div>
    </IOSection>
  );
}

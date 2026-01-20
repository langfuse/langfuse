import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { type MediaReturnType } from "@/src/features/media/validation";

// SectionMedia props
export interface SectionMediaProps {
  media: MediaReturnType[];
}

/**
 * SectionMedia renders media attachments at the bottom of the message list.
 */
export function SectionMedia({ media }: SectionMediaProps) {
  if (media.length === 0) {
    return null;
  }

  return (
    <>
      <div className="my-1 px-2 py-1 text-xs text-muted-foreground">Media</div>
      <div className="flex flex-wrap gap-2 p-4 pt-1">
        {media.map((m) => (
          <LangfuseMediaView
            mediaAPIReturnValue={m}
            asFileIcon={true}
            key={m.mediaId}
          />
        ))}
      </div>
    </>
  );
}

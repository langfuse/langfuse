/* eslint-disable @repo/no-null-render */
import { LangfuseMediaView } from "@/src/components/ui/LangfuseMediaView";
import { type MediaReturnType } from "@/src/features/media/validation";
import { useTranslations } from "next-intl";

// SectionMedia props
export interface SectionMediaProps {
  media: MediaReturnType[];
}

/**
 * SectionMedia renders media attachments at the bottom of the message list.
 */
export function SectionMedia({ media }: SectionMediaProps) {
  const t = useTranslations("coreObservability.ioPreview");
  if (media.length === 0) {
    return null;
  }

  return (
    <>
      <div className="text-muted-foreground my-1 px-2 py-1 text-xs">
        {t("media")}
      </div>
      <div className="ph-no-capture flex flex-wrap gap-2 px-2 pt-1 pb-4">
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

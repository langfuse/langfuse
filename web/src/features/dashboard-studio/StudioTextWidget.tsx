import { MarkdownView } from "@/src/components/ui/MarkdownView";

export function StudioTextWidget({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <div className="ph-no-capture flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-5">
      {title ? (
        <h3 className="text-lg font-bold tracking-tight">{title}</h3>
      ) : null}
      <MarkdownView markdown={content} />
    </div>
  );
}

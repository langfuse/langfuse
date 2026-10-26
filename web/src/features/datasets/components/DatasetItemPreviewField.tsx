import { type ReactNode } from "react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";

export function DatasetItemPreviewField({
  label,
  value,
  feedback,
}: {
  label: string;
  value: unknown;
  feedback: ReactNode;
}) {
  return (
    <section className="ph-no-capture bg-background flex flex-col overflow-hidden rounded-md border">
      <h4 className="border-b px-3 py-2 text-xs font-bold">{label}</h4>
      <div className="max-h-64 overflow-auto">
        {value === undefined ? (
          <p className="text-muted-foreground p-3 text-xs">No value</p>
        ) : (
          <JSONView json={value} className="text-xs" />
        )}
      </div>
      {feedback}
    </section>
  );
}

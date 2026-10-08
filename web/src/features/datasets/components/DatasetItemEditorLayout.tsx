import { type ReactNode } from "react";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";

export function DatasetItemEditorLayout({
  selector,
  children,
  preview,
  previewDescription,
}: {
  selector: ReactNode;
  children: ReactNode;
  preview: ReactNode;
  previewDescription: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b p-4">{selector}</div>
      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
        <div className="flex min-w-0 flex-col gap-6 p-4 md:overflow-y-auto">
          {children}
        </div>
        <aside className="bg-muted/20 flex min-w-0 flex-col gap-4 border-t p-4 md:overflow-y-auto md:border-t-0 md:border-l">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-bold">Dataset item preview</h3>
            <p className="text-muted-foreground text-xs">
              {previewDescription}
            </p>
          </div>
          {preview}
        </aside>
      </div>
    </div>
  );
}

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

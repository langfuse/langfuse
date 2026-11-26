import { type ReactNode } from "react";

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

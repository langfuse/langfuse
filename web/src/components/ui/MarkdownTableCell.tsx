import { IOPreview } from "@/src/components/trace/IOPreview";
import { IOTableCell, JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";

export const MarkdownTableCell = ({
  data,
  isLoading = false,
  className,
  singleLine = true,
}: {
  data: unknown;
  isLoading?: boolean;
  className?: string;
  singleLine?: boolean;
}) => {
  if (isLoading) {
    return <JsonSkeleton className="h-full w-full overflow-hidden px-2 py-1" />;
  }

  return (
    // <IOPreview input={data.input} output={data.output} currentView="pretty" />
    <IOTableCell
      data={data}
      className={className}
      singleLine={singleLine}
      isPretty={true}
    />
  );
};

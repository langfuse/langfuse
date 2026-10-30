import { IOTableCell } from "@/src/components/design-system/table/components/IOTableCell/IOTableCell";
import { useBoundRowHeightIO } from "@/src/components/table/data-table-row-height-switch";
import { type MediaDescriptor } from "@/src/components/ui/media/mediaUtils";

const renderMediaReference = (descriptor: MediaDescriptor) => {
  if (descriptor.kind === "langfuseRef") return descriptor.referenceString;
  if (descriptor.kind === "s3") return descriptor.uri;
  return descriptor.src;
};

export function MetadataTableCell({
  value,
  isLoading = false,
  singleLine = false,
}: {
  value?: unknown;
  isLoading?: boolean;
  singleLine?: boolean;
}) {
  const bound = useBoundRowHeightIO(true, singleLine, false);
  return (
    <div className="ph-no-capture h-full w-full min-w-0">
      {isLoading ? (
        <IOTableCell
          isLoading
          singleLine={bound.singleLine}
          enableExpandOnHover={bound.enableExpandOnHover}
          renderMediaReference={renderMediaReference}
        />
      ) : (
        <IOTableCell
          data={JSON.stringify(value)}
          singleLine={bound.singleLine}
          enableExpandOnHover={bound.enableExpandOnHover}
          renderMediaReference={renderMediaReference}
        />
      )}
    </div>
  );
}

import { memo } from "react";

import { IOTableCell } from "@/src/components/design-system/table/components/IOTableCell/IOTableCell";
import { useBoundRowHeightIO } from "@/src/components/table/data-table-row-height-switch";
import { MediaReferenceTag } from "@/src/components/ui/media/MediaReferenceTag";
import { type MediaDescriptor } from "@/src/components/ui/media/mediaUtils";

type WithoutMediaRenderer<Props> = Props extends unknown
  ? Omit<Props, "renderMediaReference">
  : never;

type ConnectedIOTableCellProps = WithoutMediaRenderer<
  Parameters<typeof IOTableCell>[0]
> & {
  /**
   * Follow the table's row height. Defaults to true. Pass false to keep
   * `singleLine` in charge, including inside a data table. Outside a data
   * table, `singleLine` is used either way.
   */
  followRowHeight?: boolean;
};

const renderMediaReference = (descriptor: MediaDescriptor) => (
  <MediaReferenceTag descriptor={descriptor} />
);

/**
 * Production adapter that binds the tRPC-backed media renderer to the pure
 * IOTableCell. Keep this split so the design-system component remains usable
 * in Storybook with an API-free renderer; this connected component must not be
 * imported by stories or moved into the design-system directory.
 */
export const ConnectedIOTableCell = memo(function ConnectedIOTableCell(
  props: ConnectedIOTableCellProps,
) {
  const bound = useBoundRowHeightIO(
    props.followRowHeight ?? true,
    props.singleLine,
    props.enableExpandOnHover,
  );
  const presentationProps = {
    enableExpandOnHover: bound.enableExpandOnHover,
    singleLine: bound.singleLine,
    size: props.size,
    variant: props.variant,
  };

  if (props.isLoading) {
    return (
      <IOTableCell
        {...presentationProps}
        isLoading
        renderMediaReference={renderMediaReference}
      />
    );
  }

  return (
    <IOTableCell
      {...presentationProps}
      data={props.data}
      renderMediaReference={renderMediaReference}
    />
  );
});

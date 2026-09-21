import { memo } from "react";

import { IOTableCell } from "@/src/components/design-system/table/components/IOTableCell/IOTableCell";
import { MediaReferenceTag } from "@/src/components/ui/media/MediaReferenceTag";
import { type MediaDescriptor } from "@/src/components/ui/media/mediaUtils";

type WithoutMediaRenderer<Props> = Props extends unknown
  ? Omit<Props, "renderMediaReference">
  : never;

type ConnectedIOTableCellProps = WithoutMediaRenderer<
  Parameters<typeof IOTableCell>[0]
>;

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
  const presentationProps = {
    enableExpandOnHover: props.enableExpandOnHover,
    singleLine: props.singleLine,
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

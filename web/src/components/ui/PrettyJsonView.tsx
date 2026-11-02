import { type ComponentProps } from "react";
import { JsonViewController } from "./JsonViewController";
import { PrettyJsonViewContent } from "./PrettyJsonViewContent";

export function PrettyJsonView({
  json,
  parsedJson,
  isLoading,
  isParsing,
  media,
  currentView,
  externalExpansionState,
  onExternalExpansionChange,
  showNullValues,
  title,
  collapseStringsAfterLength,
  scrollable,
  borderless,
  stickyTopLevelKey,
  showObservationTypeBadge,
  rowActions,
}: Pick<
  ComponentProps<typeof JsonViewController>,
  | "json"
  | "parsedJson"
  | "isLoading"
  | "isParsing"
  | "media"
  | "currentView"
  | "externalExpansionState"
  | "onExternalExpansionChange"
  | "showNullValues"
> &
  Pick<
    ComponentProps<typeof PrettyJsonViewContent>,
    | "title"
    | "collapseStringsAfterLength"
    | "scrollable"
    | "borderless"
    | "stickyTopLevelKey"
    | "showObservationTypeBadge"
    | "rowActions"
  >) {
  return (
    <JsonViewController
      json={json}
      parsedJson={parsedJson}
      isLoading={isLoading}
      isParsing={isParsing}
      media={media}
      currentView={currentView}
      externalExpansionState={externalExpansionState}
      onExternalExpansionChange={onExternalExpansionChange}
      showNullValues={showNullValues}
    >
      {(state) => (
        <PrettyJsonViewContent
          state={state}
          title={title}
          collapseStringsAfterLength={collapseStringsAfterLength}
          scrollable={scrollable}
          borderless={borderless}
          stickyTopLevelKey={stickyTopLevelKey}
          showObservationTypeBadge={showObservationTypeBadge}
          rowActions={rowActions}
        />
      )}
    </JsonViewController>
  );
}

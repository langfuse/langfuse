import type { ReactNode } from "react";
import { Radio } from "@langfuse/icons";
import { type TopicFacet } from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Input } from "@/src/components/design-system/Input/Input";
import { TopicSliceFields } from "./TopicSliceFields";
import { TopicsErrorMessage } from "./TopicsErrorMessage";

/** The New map dialog without data fetching; stories render it directly. */
export function NewMapDialogView({
  name,
  onNameChange,
  filterField,
  facets,
  facetIds,
  onFacetIdsChange,
  disabledReason,
  samplingField,
  canStart,
  starting,
  errors,
  onStart,
}: NewMapDialogViewProps) {
  return (
    <Dialog
      title="New map"
      size="md"
      actions={[
        {
          label: "Create map",
          disabled: !canStart || Boolean(disabledReason),
          loading: starting,
          onClick: onStart,
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="ph-no-capture flex flex-col gap-6">
          <TopicSliceFields.Section label="Name">
            <Input
              aria-label="Map name"
              placeholder="e.g. Support agent"
              value={name}
              maxLength={100}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </TopicSliceFields.Section>
          <TopicSliceFields.Facets
            facets={facets}
            selectedIds={facetIds}
            onChange={onFacetIdsChange}
          />
          {filterField}
          {samplingField}
          {disabledReason ? (
            <div className="bg-light-yellow text-dark-yellow rounded-md px-4 py-2.5 text-sm">
              {disabledReason} Create a snapshot instead.
            </div>
          ) : (
            <div className="bg-light-blue text-dark-blue flex items-center gap-2 rounded-md px-4 py-2.5 text-sm">
              <Radio size="base" aria-hidden="true" />
              Analyzes new matching traces as they arrive and refits nightly.
              Your first topics appear in a few minutes.
            </div>
          )}
          {errors.map((message) => (
            <TopicsErrorMessage key={message} message={message} />
          ))}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

type NewMapDialogViewProps = {
  name: string;
  onNameChange: (name: string) => void;
  /** The tracing filter with its matching preview. */
  filterField: ReactNode;
  facets: TopicFacet[];
  facetIds: string[];
  onFacetIdsChange: (facetIds: string[]) => void;
  /** Why no map can be created, e.g. the project's limit. */
  disabledReason?: string;
  /** The share of new matching traces the map analyzes. */
  samplingField: ReactNode;
  canStart: boolean;
  starting: boolean;
  errors: string[];
  onStart: () => void;
};

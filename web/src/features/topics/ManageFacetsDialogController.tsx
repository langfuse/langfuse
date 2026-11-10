import { type ReactNode } from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { api } from "@/src/utils/api";
import { type TopicFacet, type TopicRule } from "@langfuse/shared/topics";
import { ManageFacetsDialog } from "./ManageFacetsDialog";

const MAX_ENABLED_FACETS = 5;

/** Owns the Manage facets dialog; facet on/off writes the project's Topics rule. */
export function ManageFacetsDialogController({
  projectId,
  canWrite,
  facets,
  rule,
  children,
}: {
  projectId: string;
  canWrite: boolean;
  facets: TopicFacet[];
  rule: TopicRule | null;
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const utils = api.useUtils();
  const invalidate = () =>
    Promise.all([
      utils.topics.facets.invalidate({ projectId }),
      utils.topics.rules.invalidate({ projectId }),
    ]);
  const saveFacet = api.topics.saveFacet.useMutation({ onSuccess: invalidate });
  const saveRule = api.topics.saveRule.useMutation({ onSuccess: invalidate });
  const enabledIds = new Set(rule?.facetIds ?? []);
  const managed = facets.flatMap((facet) => {
    const latest = facet.versions[0];
    if (!latest) return [];
    return [
      {
        id: facet.id,
        name: facet.name,
        description: facet.description,
        prompt: latest.prompt,
        version: latest.version,
        isBuiltIn: facet.isBuiltIn,
        enabled: enabledIds.has(facet.id),
      },
    ];
  });

  return (
    <DialogController
      renderDialog={() => (
        <ManageFacetsDialog
          facets={managed}
          canWrite={canWrite}
          maxEnabled={rule ? MAX_ENABLED_FACETS : null}
          onSave={async (draft) => {
            await saveFacet.mutateAsync({ projectId, ...draft });
          }}
          onEnabledChange={async (facetId, enabled) => {
            if (!rule) return;
            await saveRule.mutateAsync({
              projectId,
              id: rule.id,
              name: rule.name,
              filter: rule.filter,
              facetIds: enabled
                ? [...rule.facetIds, facetId]
                : rule.facetIds.filter((id) => id !== facetId),
            });
          }}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog: () => openDialog() })}
    </DialogController>
  );
}

// PROTOTYPE — throwaway route. Variants exploring how to reveal each role's full
// permission set on the create-key form, on
// /organization/[organizationId]/api-key-permissions-prototype (?variant=A..D).

import { useState } from "react";
import { useRouter } from "next/router";

import ContainerPage from "@/src/components/layouts/container-page";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import {
  PrototypeSwitcher,
  type VariantMeta,
} from "@/src/features/public-api/components/prototype/PrototypeSwitcher";
import {
  type ApiKeyDraft,
  type ProjectOption,
  emptyDraft,
  resolveExpiry,
  resolvedPermissionIds,
} from "@/src/features/public-api/components/prototype/permissionCatalog";
import {
  VariantDialog,
  variantDialogMeta,
} from "@/src/features/public-api/components/prototype-permissions/VariantDialog";
import {
  VariantDisclosure,
  variantDisclosureMeta,
} from "@/src/features/public-api/components/prototype-permissions/VariantDisclosure";
import {
  VariantHover,
  variantHoverMeta,
} from "@/src/features/public-api/components/prototype-permissions/VariantHover";
import {
  VariantSplit,
  variantSplitMeta,
} from "@/src/features/public-api/components/prototype-permissions/VariantSplit";

const variantMetas: VariantMeta[] = [
  variantHoverMeta,
  variantDisclosureMeta,
  variantSplitMeta,
  variantDialogMeta,
];

const ApiKeyPermissionsPrototypePage = () => {
  const router = useRouter();
  const organization = useQueryOrganization();
  const [draft, setDraft] = useState<ApiKeyDraft>(emptyDraft);

  const current = (router.query.variant as string) ?? "A";

  if (!organization) return null;

  const projects: ProjectOption[] = organization.projects.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  const shared = { projects, draft, setDraft };

  return (
    <ContainerPage headerProps={{ title: "API key permissions — prototype" }}>
      <div className="flex flex-col gap-6 pb-28">
        {current === "A" && <VariantHover {...shared} />}
        {current === "B" && <VariantDisclosure {...shared} />}
        {current === "C" && <VariantSplit {...shared} />}
        {current === "D" && <VariantDialog {...shared} />}
        <StateInspector draft={draft} />
      </div>
      <PrototypeSwitcher variants={variantMetas} current={current} />
    </ContainerPage>
  );
};

const StateInspector = ({ draft }: { draft: ApiKeyDraft }) => (
  <div className="mx-auto w-full max-w-3xl">
    <JSONView
      title="Draft state (would be sent to the create mutation)"
      json={{
        name: draft.name || null,
        description: draft.description || null,
        expiresAt: resolveExpiry(draft),
        projects: draft.allProjects ? "ALL" : draft.projectIds,
        role: draft.preset,
        permissions: resolvedPermissionIds(draft),
      }}
    />
  </div>
);

export default ApiKeyPermissionsPrototypePage;

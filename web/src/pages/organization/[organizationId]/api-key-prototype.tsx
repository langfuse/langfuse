// PROTOTYPE — throwaway route. Three variants of the new org API-key create form,
// switchable via ?variant=, on /organization/[organizationId]/api-key-prototype.

import { useState } from "react";
import { useRouter } from "next/router";

import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import ContainerPage from "@/src/components/layouts/container-page";
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
  VariantA,
  variantAMeta,
} from "@/src/features/public-api/components/prototype/VariantA";
import {
  VariantB,
  variantBMeta,
} from "@/src/features/public-api/components/prototype/VariantB";
import {
  VariantC,
  variantCMeta,
} from "@/src/features/public-api/components/prototype/VariantC";
import {
  VariantD,
  variantDMeta,
} from "@/src/features/public-api/components/prototype/VariantD";
import {
  VariantE,
  variantEMeta,
} from "@/src/features/public-api/components/prototype/VariantE";
import {
  VariantF,
  variantFMeta,
} from "@/src/features/public-api/components/prototype/VariantF";

const variantMetas: VariantMeta[] = [
  variantAMeta,
  variantBMeta,
  variantCMeta,
  variantDMeta,
  variantEMeta,
  variantFMeta,
];

const ApiKeyPrototypePage = () => {
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
    <ContainerPage headerProps={{ title: "API key create — prototype" }}>
      <div className="flex flex-col gap-6 pb-28">
        {current === "A" && <VariantA {...shared} />}
        {current === "B" && <VariantB {...shared} />}
        {current === "C" && <VariantC {...shared} />}
        {current === "D" && <VariantD {...shared} />}
        {current === "E" && <VariantE {...shared} />}
        {current === "F" && <VariantF {...shared} />}
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

export default ApiKeyPrototypePage;

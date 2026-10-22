import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { Card } from "@/src/components/ui/card";
import { DeleteSsoConfigDialogController } from "../DeleteSsoConfigDialogController";
import { SsoConfigDialogController } from "../SsoConfigDialogController";
import {
  SsoConfigsTable,
  type SsoConfigRow,
  type SsoConfigTableRow,
} from "./SsoConfigsTable";

export function ConnectedSsoConfigsTable({ orgId }: { orgId: string }) {
  const verifiedDomainsQuery = api.verifiedDomain.list.useQuery({ orgId });
  const ssoConfigsQuery = api.ssoConfig.get.useQuery({ orgId });

  const verifiedDomains = useMemo(
    () =>
      verifiedDomainsQuery.data?.filter(
        (domain) => domain.verifiedAt != null,
      ) ?? [],
    [verifiedDomainsQuery.data],
  );
  const configByDomain = useMemo(() => {
    const map = new Map<string, SsoConfigRow>();
    ssoConfigsQuery.data?.forEach((config) => map.set(config.domain, config));
    return map;
  }, [ssoConfigsQuery.data]);

  const data: SsoConfigTableRow[] = verifiedDomains.map((domain) => ({
    domain: domain.domain,
    config: configByDomain.get(domain.domain) ?? null,
  }));

  if (verifiedDomains.length === 0) {
    return (
      <Card className="overflow-hidden">
        <p className="text-muted-foreground px-6 py-12 text-center text-sm">
          Verify a domain in the section above to configure SSO for it.
        </p>
      </Card>
    );
  }

  return (
    <SsoConfigDialogController orgId={orgId}>
      {({ openDialog: openConfigDialog }) => (
        <DeleteSsoConfigDialogController orgId={orgId}>
          {({ openDialog: openDeleteDialog }) => (
            <SsoConfigsTable
              data={data}
              onConfigure={openConfigDialog}
              onDelete={openDeleteDialog}
            />
          )}
        </DeleteSsoConfigDialogController>
      )}
    </SsoConfigDialogController>
  );
}

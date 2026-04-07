/**
 * DEV ONLY
 *
 * This route intentionally bypasses auth via the app layout path-classification
 * rules so design work can happen against mock data. Do not use it as product
 * behavior and remove or rework it before shipping a redesign PR.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { DevProjectPreviewShell } from "@/src/features/dev/components/DevProjectPreviewShell";
import { OrganizationOverviewView } from "@/src/features/organizations/components/OrganizationOverviewView";
import {
  organizationOverviewPlaygroundScenarios,
  type OrganizationOverviewPlaygroundScenario,
} from "@/src/features/organizations/playground/organizationOverviewScenarios";

const defaultScenario = organizationOverviewPlaygroundScenarios[0];

export default function OrganizationOverviewDevPage() {
  const router = useRouter();
  const [scenario, setScenario] =
    useState<OrganizationOverviewPlaygroundScenario>(defaultScenario);
  const [search, setSearch] = useState(defaultScenario.initialSearch ?? "");

  useEffect(() => {
    setSearch(scenario.initialSearch ?? "");
  }, [scenario]);

  return (
    <DevProjectPreviewShell currentPath={router.pathname} title="Organizations">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Organization Overview Playground</CardTitle>
            <CardDescription>
              Switch between seeded states while iterating on the organization
              landing experience.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {organizationOverviewPlaygroundScenarios.map((item) => (
              <Button
                key={item.key}
                variant={scenario.key === item.key ? "default" : "secondary"}
                onClick={() => setScenario(item)}
              >
                {item.label}
              </Button>
            ))}
            <p className="text-muted-foreground basis-full text-sm">
              {scenario.description}
            </p>
          </CardContent>
        </Card>

        <OrganizationOverviewView
          organizations={scenario.organizations}
          canCreateOrg={scenario.canCreateOrg}
          search={search}
          selectedOrganizationId={scenario.selectedOrganizationId}
          onSearchChange={setSearch}
        />
      </div>
    </DevProjectPreviewShell>
  );
}

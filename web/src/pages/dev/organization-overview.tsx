/**
 * DEV ONLY
 *
 * This route intentionally bypasses auth via the app layout path-classification
 * rules so design work can happen against mock data. Do not use it as product
 * behavior and remove or rework it before shipping a redesign PR.
 */

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { OrganizationOverviewView } from "@/src/features/organizations/components/OrganizationOverviewView";
import {
  organizationOverviewPlaygroundScenarios,
  type OrganizationOverviewPlaygroundScenario,
} from "@/src/features/organizations/playground/organizationOverviewScenarios";

const defaultScenario = organizationOverviewPlaygroundScenarios[0];

export default function OrganizationOverviewDevPage() {
  const [scenario, setScenario] =
    useState<OrganizationOverviewPlaygroundScenario>(defaultScenario);
  const [search, setSearch] = useState(defaultScenario.initialSearch ?? "");

  useEffect(() => {
    setSearch(scenario.initialSearch ?? "");
  }, [scenario]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Organization Overview Playground</CardTitle>
          <CardDescription>
            Dev-only design sandbox. Switch between mocked states without auth,
            backend data, or session dependencies.
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
  );
}

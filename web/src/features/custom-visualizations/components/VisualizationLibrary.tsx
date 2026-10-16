import Link from "next/link";
import type { ReactNode } from "react";
import { Eye, Layers3, Pencil, Plus, Sparkles } from "lucide-react";
import type { FilterState } from "@langfuse/shared";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  VisualizationDefinitionSchema,
  type VisualizationDefinition,
} from "../types";
import { VisualizationFilterTokens } from "./VisualizationFilterTokens";

const filterValue = (filters: FilterState, column: string) =>
  filters.find((filter) => filter.column === column)?.value;

const audienceLabel = (definition: VisualizationDefinition) => {
  if (definition.match.entity === "TRACE") return "Root traces";
  const filters = definition.match.filters;
  if (filters.length === 0) return "Every observation";

  const type = filterValue(filters, "type");
  const name = filterValue(filters, "name");
  const isRoot = filterValue(filters, "isRootObservation");
  if (Array.isArray(type) && type.length === 1 && type[0] === "TOOL") {
    return name ? `Tool calls named “${String(name)}”` : "Tool calls";
  }
  if (name) return `Observations named “${String(name)}”`;
  if (isRoot === true) return "Root observations";
  if (Array.isArray(type) && type.length === 1) {
    return `${String(type[0]).toLowerCase()} observations`;
  }
  return `Observations matching ${filters.length} ${
    filters.length === 1 ? "condition" : "conditions"
  }`;
};

const placementLabel = (definition: VisualizationDefinition) => {
  if (definition.placement.surface === "TRACE") return "Trace · custom tab";
  const destinations = definition.placement.destinations
    .map((destination) =>
      destination === "SESSION" ? "Session" : "Trace detail",
    )
    .join(" + ");
  if (definition.binding.source === "OBSERVATION_INPUT") {
    return `${destinations} · after input`;
  }
  if (definition.binding.source === "OBSERVATION_OUTPUT") {
    return `${destinations} · after output`;
  }
  return destinations;
};

function VisualizationCard({
  projectId,
  visualization,
}: {
  projectId: string;
  visualization: RouterOutputs["customVisualizations"]["list"][number];
}) {
  const latestVersion = visualization.versions[0];
  const parsed = VisualizationDefinitionSchema.safeParse(
    latestVersion?.definition ?? visualization.activeVersion?.definition,
  );
  if (!latestVersion || !parsed.success) {
    return (
      <Card className="border-destructive/30 p-5 text-sm">
        {visualization.name} has an invalid saved definition.
      </Card>
    );
  }

  const activeVersion = visualization.activeVersion;
  const hasNewerDraft = Boolean(
    activeVersion && activeVersion.id !== latestVersion.id,
  );
  const definition = parsed.data;

  return (
    <Card className="hover:border-foreground/20 p-5 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            className="truncate text-base font-bold"
            title={visualization.name}
          >
            {visualization.name}
          </h2>
          <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  activeVersion ? "bg-emerald-500" : "bg-muted-foreground/40"
                }`}
              />
              {activeVersion ? `Live v${activeVersion.version}` : "Not live"}
            </span>
            {hasNewerDraft ? (
              <span>· Draft v{latestVersion.version}</span>
            ) : null}
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link
            href={`/project/${projectId}/visualizations/${visualization.id}`}
          >
            <Pencil className="icon-base mr-2" /> Edit
          </Link>
        </Button>
      </div>

      <VisualizationFilterTokens
        filters={definition.match.filters}
        entity={definition.match.entity}
        variant="card"
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">For </span>
          <span className="font-bold">{audienceLabel(definition)}</span>
          <span className="text-muted-foreground">, show this in </span>
          <span className="font-bold">{placementLabel(definition)}</span>
        </div>
        <div className="text-muted-foreground text-xs">
          {Object.keys(definition.spec.elements).length} components ·{" "}
          {visualization.versions.length}{" "}
          {visualization.versions.length === 1 ? "version" : "versions"}
        </div>
      </div>
    </Card>
  );
}

export function VisualizationLibrary({ projectId }: { projectId: string }) {
  const hasAdminAccess = useHasProjectAccess({
    projectId,
    scope: "project:update",
  });
  const visualizations = api.customVisualizations.list.useQuery(
    { projectId },
    { enabled: hasAdminAccess },
  );

  if (!hasAdminAccess) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-md p-6 text-center">
          <h1 className="text-lg font-bold">
            Custom UI is for Langfuse admins
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Enable the employee preview to create and inspect Custom UI.
          </p>
        </Card>
      </div>
    );
  }

  const live =
    visualizations.data?.filter((item) => item.activeVersionId) ?? [];
  const notLive =
    visualizations.data?.filter((item) => !item.activeVersionId) ?? [];

  const renderContent = (): ReactNode => {
    if (visualizations.isLoading) {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      );
    }
    if (visualizations.isError) {
      return <Card className="p-6 text-sm">Could not load Custom UI.</Card>;
    }
    if (visualizations.data?.length === 0) {
      return (
        <Card className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
          <Sparkles className="text-muted-foreground icon-lg" />
          <h2 className="mt-4 font-bold">No Custom UI yet</h2>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Start with a real trace or observation. AI will propose a focused
            view that you can refine before anyone sees it.
          </p>
          <Button asChild className="mt-5">
            <Link href={`/project/${projectId}/visualizations/new`}>
              Create Custom UI
            </Link>
          </Button>
        </Card>
      );
    }
    return (
      <div className="space-y-9">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Eye className="icon-base" />
            <h2 className="font-bold">Live</h2>
            <Badge variant="outline">{live.length}</Badge>
          </div>
          {live.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {live.map((visualization) => (
                <VisualizationCard
                  key={visualization.id}
                  projectId={projectId}
                  visualization={visualization}
                />
              ))}
            </div>
          ) : (
            <Card className="text-muted-foreground p-5 text-sm">
              Nothing is live. Saved drafts are invisible in trace and session
              views until you publish one.
            </Card>
          )}
        </section>

        {notLive.length > 0 ? (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Layers3 className="icon-base" />
              <h2 className="font-bold">Not live</h2>
              <Badge variant="outline">{notLive.length}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {notLive.map((visualization) => (
                <VisualizationCard
                  key={visualization.id}
                  projectId={projectId}
                  visualization={visualization}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  };

  return (
    <main className="mx-auto w-full max-w-6xl p-6 lg:p-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Custom UI</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Turn trace and session data into focused, reusable views.
          </p>
        </div>
        <Button asChild>
          <Link href={`/project/${projectId}/visualizations/new`}>
            <Plus className="icon-base mr-2" /> New Custom UI
          </Link>
        </Button>
      </div>

      {renderContent()}
    </main>
  );
}

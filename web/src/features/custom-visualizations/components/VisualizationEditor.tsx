import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { api } from "@/src/utils/api";
import { VisualizationDefinitionSchema } from "../types";
import { VisualizationStudio } from "./VisualizationStudio";

export function VisualizationEditor({
  projectId,
  visualizationId,
}: {
  projectId: string;
  visualizationId: string;
}) {
  const visualizations = api.customVisualizations.list.useQuery({ projectId });

  if (visualizations.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-16" />
        <Skeleton className="h-[70vh]" />
      </div>
    );
  }

  const visualization = visualizations.data?.find(
    (item) => item.id === visualizationId,
  );
  const latestVersion = visualization?.versions[0];
  const parsed = VisualizationDefinitionSchema.safeParse(
    latestVersion?.definition,
  );

  if (!visualization || !latestVersion || !parsed.success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md p-6 text-center">
          <h1 className="font-bold">Visualization not found</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            It may have been removed or its latest version is invalid.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href={`/project/${projectId}/visualizations`}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to visualizations
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <VisualizationStudio
      key={`${visualization.id}:${latestVersion.id}`}
      projectId={projectId}
      mode="edit"
      visualizationId={visualization.id}
      versionId={latestVersion.id}
      initialDefinition={parsed.data}
    />
  );
}

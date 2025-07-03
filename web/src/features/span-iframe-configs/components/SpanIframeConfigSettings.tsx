import { useState } from "react";
import { PlusCircle, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Badge } from "@/src/components/ui/badge";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { SpanIframeConfigDialog } from "./SpanIframeConfigDialog";
import { DeleteDialog } from "@/src/components/DeleteDialog";
import { LoadingSpinner } from "@/src/components/LoadingSpinner";

interface SpanIframeConfigSettingsProps {
  projectId: string;
}

export function SpanIframeConfigSettings({ projectId }: SpanIframeConfigSettingsProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [deletingConfig, setDeletingConfig] = useState<string | null>(null);

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });

  const { data: configs, isLoading, refetch } = api.spanIframeConfigs.all.useQuery({
    projectId,
  });

  const deleteConfigMutation = api.spanIframeConfigs.delete.useMutation({
    onSuccess: () => {
      void refetch();
      setDeletingConfig(null);
    },
  });

  const handleDelete = async (id: string) => {
    await deleteConfigMutation.mutateAsync({
      id,
      projectId,
    });
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading iframe configurations..." />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Span Iframe Configurations</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Configure custom iframe renderers for span data. These will appear as additional view options in the span details.
            </p>
          </div>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            disabled={!hasAccess}
            className="flex items-center gap-2"
          >
            <PlusCircle className="h-4 w-4" />
            Add Configuration
          </Button>
        </CardHeader>
        <CardContent>
          {configs && configs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Span Filter</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {config.description || "—"}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {config.url.length > 50 
                          ? `${config.url.substring(0, 50)}...` 
                          : config.url
                        }
                      </code>
                    </TableCell>
                    <TableCell>
                      {config.spanName ? (
                        <Badge variant="secondary">{config.spanName}</Badge>
                      ) : (
                        <Badge variant="outline">All spans</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingConfig(config.id)}
                          disabled={!hasAccess}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingConfig(config.id)}
                          disabled={!hasAccess}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No iframe configurations set up yet.</p>
              <p className="text-sm">Add your first configuration to get started with custom span renderers.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <SpanIframeConfigDialog
        projectId={projectId}
        configId={editingConfig}
        open={isCreateDialogOpen || !!editingConfig}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingConfig(null);
          }
        }}
        onSuccess={() => {
          void refetch();
          setIsCreateDialogOpen(false);
          setEditingConfig(null);
        }}
      />

      <DeleteDialog
        open={!!deletingConfig}
        onOpenChange={(open) => !open && setDeletingConfig(null)}
        itemType="iframe configuration"
        itemName={configs?.find(c => c.id === deletingConfig)?.name || ""}
        isDeleting={deleteConfigMutation.isLoading}
        onDelete={() => deletingConfig && handleDelete(deletingConfig)}
      />
    </div>
  );
}
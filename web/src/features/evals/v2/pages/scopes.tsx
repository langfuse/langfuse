import { useState } from "react";
import { useRouter } from "next/router";
import { Check, Pencil, X } from "lucide-react";

import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { targetObjectLabel } from "@/src/features/evals/v2/components/RunScopeSection";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import {
  EVALS_TABS,
  getEvalsTabs,
} from "@/src/features/navigation/utils/evals-tabs";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export default function RunScopesPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const utils = api.useUtils();

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });

  const runScopes = api.evalsV2.runScopes.useQuery(
    { projectId },
    { enabled: Boolean(projectId) && hasReadAccess },
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");

  const renameRunScope = api.evalsV2.renameRunScope.useMutation({
    onError: (error) => trpcErrorToast(error),
    onSuccess: () => {
      utils.evalsV2.runScopes.invalidate().catch(() => undefined);
      setEditingId(null);
    },
  });

  if (!hasReadAccess) {
    return <SupportOrUpgradePage />;
  }

  return (
    <Page
      headerProps={{
        title: "Evaluators",
        help: {
          description:
            "Run scopes define which data evaluators run on. Scopes are shared: multiple evaluators can reuse the same scope, and changes apply to all of them.",
        },
        tabsProps: {
          tabs: getEvalsTabs(projectId),
          activeTab: EVALS_TABS.SCOPES,
        },
      }}
      scrollable
    >
      {runScopes.data && runScopes.data.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">
          No run scopes yet. Scopes are created when you save an evaluator in
          the new setup flow.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Filters</TableHead>
              <TableHead>Sampling</TableHead>
              <TableHead>Evaluators</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(runScopes.data ?? []).map((scope) => (
              <TableRow key={scope.id}>
                <TableCell>
                  {editingId === scope.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-8 w-56"
                        value={editedName}
                        autoFocus
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editedName.trim()) {
                            renameRunScope.mutate({
                              projectId,
                              runScopeId: scope.id,
                              name: editedName.trim(),
                            });
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Save name"
                        disabled={
                          !editedName.trim() || renameRunScope.isPending
                        }
                        onClick={() =>
                          renameRunScope.mutate({
                            projectId,
                            runScopeId: scope.id,
                            name: editedName.trim(),
                          })
                        }
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Cancel rename"
                        disabled={renameRunScope.isPending}
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="group flex items-center gap-1">
                      <span
                        className="max-w-56 truncate font-medium"
                        title={scope.name}
                      >
                        {scope.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Rename run scope"
                        onClick={() => {
                          setEditingId(scope.id);
                          setEditedName(scope.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>{targetObjectLabel(scope.targetObject)}</TableCell>
                <TableCell>
                  {scope.filter.length > 0 ? (
                    <InlineFilterState
                      filterState={scope.filter}
                      className="ml-0"
                    />
                  ) : (
                    <span className="text-muted-foreground">
                      all {targetObjectLabel(scope.targetObject).toLowerCase()}
                    </span>
                  )}
                </TableCell>
                <TableCell>{Math.round(scope.sampling * 100)}%</TableCell>
                <TableCell>
                  <span
                    className="block max-w-64 truncate"
                    title={scope.jobConfigurations
                      .map((jc) => jc.scoreName)
                      .join(", ")}
                  >
                    {scope._count.jobConfigurations}
                    {scope.jobConfigurations.length > 0 &&
                      ` · ${scope.jobConfigurations
                        .map((jc) => jc.scoreName)
                        .join(", ")}`}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {scope.createdAt.toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Page>
  );
}

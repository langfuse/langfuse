import { type NextPage } from "next";
import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  TestTube,
  Plus,
  FlaskConical,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import Header from "@/src/components/layouts/header";
import { TemplateSelector } from "@/src/features/evals/components/template-selector";
import { useEvaluatorDefaults } from "@/src/features/experiments/hooks/useEvaluatorDefaults";
import { useExperimentEvaluatorData } from "@/src/features/experiments/hooks/useExperimentEvaluatorData";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

const RegressionRunsPage: NextPage = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    datasetId: "",
    totalRuns: 100,
  });
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [runToDelete, setRunToDelete] = useState<any>(null);

  // Fetch data
  const regressionRuns = api.experiments.getAllRegressionRuns.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  const datasets = api.datasets.allDatasetMeta.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  const prompts = api.prompts.filterOptions.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  // Check evaluator access
  const hasEvalReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalTemplate:read",
  });

  // Fetch evaluators for selected dataset
  const evaluators = api.evals.jobConfigsByTarget.useQuery(
    { projectId, targetObject: "dataset" },
    {
      enabled: hasEvalReadAccess && !!formData.datasetId,
    },
  );

  // Fetch eval templates
  const evalTemplates = api.evals.allTemplates.useQuery(
    { projectId },
    {
      enabled: hasEvalReadAccess,
    },
  );

  // Evaluator management
  const { createDefaultEvaluator } = useEvaluatorDefaults();

  const {
    activeEvaluators,
    inActiveEvaluators,
    selectedEvaluatorData,
    showEvaluatorForm,
    handleConfigureEvaluator,
    handleCloseEvaluatorForm,
    handleEvaluatorSuccess,
    handleSelectEvaluator,
  } = useExperimentEvaluatorData({
    datasetId: formData.datasetId,
    createDefaultEvaluator,
    evaluatorsData: evaluators.data,
    evalTemplatesData: evalTemplates.data,
    refetchEvaluators: evaluators.refetch,
  });

  // Create regression run
  const createRegressionRun = api.experiments.createRegressionRun.useMutation({
    onSuccess: () => {
      setShowCreateDialog(false);
      setFormData({ name: "", description: "", datasetId: "", totalRuns: 100 });
      setSelectedPrompts([]);
      regressionRuns.refetch();
    },
  });

  // Delete regression run
  const deleteRegressionRun = api.experiments.deleteRegressionRun.useMutation({
    onSuccess: () => {
      setDeleteDialogOpen(false);
      setRunToDelete(null);
      regressionRuns.refetch();
    },
    onError: (error) => {
      console.error("Failed to delete regression run:", error);
      alert("Failed to delete regression run: " + error.message);
    },
  });

  const handleCreateRegressionRun = () => {
    if (!selectedPrompts.length || !formData.datasetId) return;

    createRegressionRun.mutate({
      projectId,
      name:
        formData.name || `Regression Run ${new Date().toLocaleDateString()}`,
      description: formData.description,
      promptIds: selectedPrompts,
      provider: "gemini", // Default provider
      model: "gemini-pro", // Default model
      modelParams: {
        temperature: 0.7,
        max_tokens: 1000,
      },
      datasetId: formData.datasetId,
      evaluators: activeEvaluators,
      totalRuns: formData.totalRuns,
    });
  };

  const handleDeleteClick = (run: any, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent card click navigation
    setRunToDelete(run);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (runToDelete) {
      deleteRegressionRun.mutate({
        projectId,
        runId: runToDelete.id,
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
        return <Play className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-yellow-100 text-yellow-800";
    }
  };

  return (
    <>
      <Header
        title="Regression Runs"
        actionButtons={
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Regression Run
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Regression Run</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Enter regression run name..."
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Input
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Describe what you're testing..."
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Dataset *</label>
                  <select
                    value={formData.datasetId}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        datasetId: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select a dataset</option>
                    {datasets.data?.map((dataset: any) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </option>
                    ))}
                  </select>
                  {datasets.isLoading && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Loading datasets...
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Select Prompts *
                  </label>
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-md border p-2">
                    {prompts.data?.name?.map((prompt: any) => (
                      <div
                        key={prompt.id}
                        className="flex items-center space-x-2 py-1"
                      >
                        <input
                          type="checkbox"
                          id={`prompt-${prompt.id}`}
                          checked={selectedPrompts.includes(prompt.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPrompts((prev) => [
                                ...prev,
                                prompt.id,
                              ]);
                            } else {
                              setSelectedPrompts((prev) =>
                                prev.filter((id) => id !== prompt.id),
                              );
                            }
                          }}
                          className="rounded"
                        />
                        <label
                          htmlFor={`prompt-${prompt.id}`}
                          className="flex-1 cursor-pointer text-sm"
                        >
                          {prompt.name || prompt.id}
                        </label>
                      </div>
                    ))}
                    {prompts.isLoading && (
                      <p className="text-xs text-muted-foreground">
                        Loading prompts...
                      </p>
                    )}
                    {(!prompts.data?.name ||
                      prompts.data.name.length === 0) && (
                      <p className="text-xs text-muted-foreground">
                        No prompts available
                      </p>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selected: {selectedPrompts.length} prompt(s)
                  </p>
                </div>

                {formData.datasetId && evaluators.data && (
                  <div>
                    <label className="text-sm font-medium">Evaluators</label>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Will run against the LLM outputs
                    </p>
                    <TemplateSelector
                      projectId={projectId}
                      datasetId={formData.datasetId}
                      evalTemplates={evalTemplates.data?.templates ?? []}
                      onConfigureTemplate={handleConfigureEvaluator}
                      onSelectEvaluator={handleSelectEvaluator}
                      activeTemplateIds={activeEvaluators}
                      inactiveTemplateIds={inActiveEvaluators}
                    />
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Runs per prompt</label>
                  <Input
                    type="number"
                    value={formData.totalRuns}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        totalRuns: parseInt(e.target.value) || 100,
                      }))
                    }
                    className="mt-1"
                    min="1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Each of the {selectedPrompts.length} selected prompts will
                    be tested this many times
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateRegressionRun}
                    disabled={
                      !formData.datasetId ||
                      !selectedPrompts.length ||
                      createRegressionRun.isPending
                    }
                  >
                    {createRegressionRun.isPending
                      ? "Creating..."
                      : "Start Regression"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="container mx-auto p-6">
        {regressionRuns.isLoading ? (
          <div className="py-8 text-center">
            <div className="text-muted-foreground">
              Loading regression runs...
            </div>
          </div>
        ) : regressionRuns.data?.length === 0 ? (
          <div className="py-16 text-center">
            <FlaskConical className="mx-auto mb-4 h-16 w-16 opacity-50" />
            <h3 className="mb-2 text-lg font-medium">No regression runs yet</h3>
            <p className="mb-4 text-muted-foreground">
              Create your first regression run to test multiple prompts against
              your dataset
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Regression Run
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {regressionRuns.data?.map((run) => (
              <Card
                key={run.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() =>
                  router.push(
                    `/project/${projectId}/prompts/regression-runs/${run.id}`,
                  )
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <TestTube className="h-4 w-4" />
                        {run.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {run.description || "No description"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(run.status)}
                      <Badge className={getStatusColor(run.status)}>
                        {run.status}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => handleDeleteClick(run, e)}
                            className="text-red-600 hover:text-red-700 focus:text-red-700"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
                    <div>
                      <div className="text-muted-foreground">Prompts</div>
                      <div className="font-medium">
                        {Array.isArray(run.promptVariants)
                          ? run.promptVariants.length
                          : 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Runs/Prompt</div>
                      <div className="font-medium">{run.totalRuns}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Items</div>
                      <div className="font-medium">{run.totalItems || 0}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Progress</div>
                      <div className="font-medium">
                        {run.completedItems || 0} / {run.totalItems || 0}
                        {run.failedItems > 0 && (
                          <span className="ml-1 text-red-600">
                            ({run.failedItems} failed)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Created</div>
                      <div className="font-medium">
                        {new Date(run.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Evaluator configuration dialog */}
      {selectedEvaluatorData && (
        <Dialog
          open={showEvaluatorForm}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseEvaluatorForm();
            }
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedEvaluatorData.evaluator.id ? "Edit" : "Configure"}{" "}
                Evaluator
              </DialogTitle>
            </DialogHeader>
            <EvaluatorForm
              projectId={projectId}
              evalTemplates={evalTemplates.data?.templates ?? []}
              useDialog={false}
              existingEvaluator={selectedEvaluatorData.evaluator}
              onFormSuccess={handleEvaluatorSuccess}
              templateId={selectedEvaluatorData.templateId}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Regression Run</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete &ldquo;{runToDelete?.name}&rdquo;?
              This action cannot be undone and will remove all associated test
              results.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteRegressionRun.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              className="bg-red-600 text-white hover:bg-red-700 focus:bg-red-700"
              disabled={deleteRegressionRun.isPending}
            >
              {deleteRegressionRun.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RegressionRunsPage;

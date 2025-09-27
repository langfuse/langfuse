import { type NextPage } from "next";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  TestTube,
  FlaskConical,
  FolderOpen,
  Search,
  Calendar,
  Hash,
  FileText,
  ChevronRight,
  Plus,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import Header from "@/src/components/layouts/header";
import { TemplateSelector } from "@/src/features/evals/components/template-selector";
import { useEvaluatorDefaults } from "@/src/features/experiments/hooks/useEvaluatorDefaults";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useExperimentEvaluatorData } from "@/src/features/experiments/hooks/useExperimentEvaluatorData";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";

interface ExperimentPrompt {
  id: string;
  name: string;
  content: string;
  rawContent?: any;
  reasoning?: string;
  status: "generating" | "generated" | "error";
  createdAt: string;
}

interface Experiment {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  promptCount: number;
  status: "active" | "completed";
  prompts: ExperimentPrompt[];
}

const PromptExperimentsPage: NextPage = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(
    null,
  );
  const [showRegressionDialog, setShowRegressionDialog] = useState(false);
  const [regressionFormData, setRegressionFormData] = useState({
    name: "",
    description: "",
    datasetId: "",
    totalRuns: 10,
  });

  // Load experiments from localStorage on mount
  useEffect(() => {
    const loadExperiments = () => {
      try {
        const stored = localStorage.getItem("promptExperiments");
        if (stored) {
          const parsed = JSON.parse(stored);
          setExperiments(Array.isArray(parsed) ? parsed : []);
        }
      } catch (error) {
        console.error("Failed to load experiments from localStorage:", error);
      }
    };

    loadExperiments();

    // Set up listener for localStorage changes (in case other tabs modify it)
    const handleStorageChange = () => {
      loadExperiments();
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Fetch datasets for regression run form
  const datasets = api.datasets.allDatasetMeta.useQuery(
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
      enabled: hasEvalReadAccess && !!regressionFormData.datasetId,
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
    datasetId: regressionFormData.datasetId,
    createDefaultEvaluator,
    evaluatorsData: evaluators.data,
    evalTemplatesData: evalTemplates.data,
    refetchEvaluators: evaluators.refetch,
  });

  // Create prompt mutation
  const createPrompt = api.prompts.create.useMutation();

  // Create regression run mutation
  const createRegressionRun = api.experiments.createRegressionRun.useMutation({
    onSuccess: () => {
      setShowRegressionDialog(false);
      setRegressionFormData({
        name: "",
        description: "",
        datasetId: "",
        totalRuns: 10,
      });
      // Navigate to regression runs page to see the results
      void router.push(`/project/${projectId}/prompts/regression-runs`);
    },
  });

  // Delete experiment function
  const deleteExperiment = (experimentId: string) => {
    try {
      const stored = localStorage.getItem("promptExperiments");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((exp: Experiment) => exp.id !== experimentId);
          localStorage.setItem("promptExperiments", JSON.stringify(filtered));
          setExperiments(filtered);
          
          // If deleted experiment was selected, clear selection
          if (selectedExperiment === experimentId) {
            setSelectedExperiment(null);
          }
        }
      }
    } catch (error) {
      console.error("Failed to delete experiment:", error);
    }
  };

  // Clear all experiments function
  const clearAllExperiments = () => {
    if (confirm("Are you sure you want to delete all experiments? This action cannot be undone.")) {
      localStorage.removeItem("promptExperiments");
      setExperiments([]);
      setSelectedExperiment(null);
    }
  };

  // Query utils for fetching existing prompts
  const utils = api.useUtils();

  // Handle regression run creation
  const handleCreateRegressionRun = async () => {
    if (!selectedExp || !regressionFormData.datasetId) return;

    try {
      console.log("Starting regression run for experiment:", selectedExp.name);
      
      // First, check if there are existing prompt versions for this experiment
      const basePromptName = selectedExp.name;
      
      try {
        const existingPrompts = await utils.prompts.allVersions.fetch({
          projectId,
          name: basePromptName,
          limit: 100,
        });
        
        let promptIds: string[] = [];
        
        if (existingPrompts.promptVersions && existingPrompts.promptVersions.length > 0) {
          // Use existing prompt versions
          console.log(`Found ${existingPrompts.promptVersions.length} existing prompt versions for "${basePromptName}"`);
          
          // Take the number of prompt versions that match our experiment's prompt count
          const promptsToUse = existingPrompts.promptVersions.slice(0, selectedExp.prompts.length);
          promptIds = promptsToUse.map(p => p.id);
          
          console.log("Using existing prompt IDs:", promptIds);
        } else {
          throw new Error("No existing prompts found");
        }
        
        console.log("Final prompt IDs for regression run:", promptIds);
        
        // Create regression run with existing prompt IDs
        createRegressionRun.mutate({
          projectId,
          name: regressionFormData.name || `Regression Run - ${selectedExp.name} - ${new Date().toLocaleTimeString()}`,
          description: regressionFormData.description,
          promptIds: promptIds,
          provider: "gemini",
          model: "gemini-pro",
          modelParams: {
            temperature: 0.7,
            max_tokens: 100,
          },
          datasetId: regressionFormData.datasetId,
          evaluators: activeEvaluators,
          totalRuns: regressionFormData.totalRuns,
        });
        
      } catch (fetchError) {
        // If no existing prompts found, create new ones
        console.log("No existing prompts found, creating new prompt versions");
        console.log("Number of prompt versions to create:", selectedExp.prompts.length);

        // Create prompts sequentially to avoid version number conflicts
        const promptIds: string[] = [];
        for (let index = 0; index < selectedExp.prompts.length; index++) {
          const prompt = selectedExp.prompts[index];
          console.log(`Creating prompt version ${index + 1} for:`, basePromptName);
          console.log("Prompt content:", prompt.content);

          const newPrompt = await createPrompt.mutateAsync({
            projectId,
            name: basePromptName, // Use same name for all versions
            prompt: prompt.content,
            config: {
              provider: "gemini",
              model: "gemini-pro",
              modelParams: {
                temperature: 0.7,
                max_tokens: 100,
              },
            },
            tags: [`experiment:${selectedExp.id}`],
            labels: [`auto-sweep-experiment`],
          });
          console.log("Created prompt with ID:", newPrompt.id);
          promptIds.push(newPrompt.id);
        }

        console.log("All new prompt IDs created:", promptIds);
        
        // Now create the regression run with the new prompt IDs
        createRegressionRun.mutate({
          projectId,
          name: regressionFormData.name || `Regression Run - ${selectedExp.name} - ${new Date().toLocaleTimeString()}`,
          description: regressionFormData.description,
          promptIds: promptIds,
          provider: "gemini", // Default provider
          model: "gemini-pro", // Default model
          modelParams: {
            temperature: 0.7,
            max_tokens: 100,
          },
          datasetId: regressionFormData.datasetId,
          evaluators: activeEvaluators,
          totalRuns: regressionFormData.totalRuns,
        });
      }
    } catch (error) {
      console.error("Failed to create regression run:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      alert(`Failed to create regression run: ${errorMessage}`);
    }
  };

  const filteredExperiments = experiments.filter(
    (exp) =>
      exp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedExp = selectedExperiment
    ? experiments.find((exp) => exp.id === selectedExperiment)
    : null;

  return (
    <>
      <Header
        title="Prompt Experiments"
        actionButtons={
          <div className="flex gap-2">
            <Button
              onClick={() => router.push(`/project/${projectId}/generator`)}
              variant="outline"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Experiment
            </Button>
            {experiments.length > 0 && (
              <Button
                onClick={clearAllExperiments}
                variant="outline"
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear All
              </Button>
            )}
            <Button
              onClick={() =>
                router.push(`/project/${projectId}/prompts/regression-runs`)
              }
              className="bg-orange-600 text-white hover:bg-orange-700"
            >
              <FlaskConical className="mr-2 h-4 w-4" />
              Regression Runs
            </Button>
          </div>
        }
      />

      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-80 border-r bg-muted/30">
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search experiments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-2 p-4 pt-0">
              {filteredExperiments.length === 0 ? (
                <div className="py-8 text-center">
                  <TestTube className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery
                      ? "No experiments match your search"
                      : "No experiments created yet"}
                  </p>
                  {!searchQuery && (
                    <Button
                      onClick={() =>
                        router.push(`/project/${projectId}/generator`)
                      }
                      size="sm"
                      className="mt-3"
                    >
                      Create Your First Experiment
                    </Button>
                  )}
                </div>
              ) : (
                filteredExperiments.map((experiment) => (
                  <Card
                    key={experiment.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedExperiment === experiment.id
                        ? "ring-2 ring-primary"
                        : ""
                    }`}
                    onClick={() => setSelectedExperiment(experiment.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="truncate text-sm">
                          {experiment.name}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              experiment.status === "active"
                                ? "default"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {experiment.status}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent card selection
                                }}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    confirm(
                                      `Are you sure you want to delete "${experiment.name}"? This action cannot be undone.`
                                    )
                                  ) {
                                    deleteExperiment(experiment.id);
                                  }
                                }}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <CardDescription className="text-xs">
                        {experiment.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          <span>{experiment.promptCount} variations</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {new Date(
                              experiment.createdAt,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {!selectedExp ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md text-center text-muted-foreground">
                <FolderOpen className="mx-auto mb-4 h-16 w-16 opacity-50" />
                <h3 className="mb-2 text-lg font-medium">
                  Select an Experiment
                </h3>
                <p className="mb-6">
                  Choose an experiment from the sidebar to view its prompt
                  variations and run regression tests
                </p>
                <div className="space-y-2">
                  <Button
                    onClick={() =>
                      router.push(`/project/${projectId}/generator`)
                    }
                    className="w-full"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Experiment
                  </Button>
                  <Button
                    onClick={() =>
                      router.push(
                        `/project/${projectId}/prompts/regression-runs`,
                      )
                    }
                    variant="outline"
                    className="w-full"
                  >
                    <FlaskConical className="mr-2 h-4 w-4" />
                    View Regression Runs
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {/* Experiment Header */}
              <div className="mb-6">
                <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <TestTube className="h-4 w-4" />
                  <span>Experiment</span>
                  <ChevronRight className="h-4 w-4" />
                  <span className="font-medium">{selectedExp.id}</span>
                </div>
                <h1 className="mb-2 text-2xl font-bold">{selectedExp.name}</h1>
                <p className="mb-4 text-muted-foreground">
                  {selectedExp.description}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Created{" "}
                        {new Date(selectedExp.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Hash className="h-4 w-4" />
                      <span>{selectedExp.promptCount} variations</span>
                    </div>
                    <Badge
                      variant={
                        selectedExp.status === "active"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {selectedExp.status}
                    </Badge>
                  </div>

                  <Button
                    onClick={() => {
                      console.log(
                        "Opening regression dialog for experiment:",
                        selectedExp,
                      );
                      setShowRegressionDialog(true);
                    }}
                    className="bg-orange-600 text-white hover:bg-orange-700"
                  >
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Run Regression Test
                  </Button>
                </div>
              </div>

              {/* Prompt Variations */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Prompt Variations</h2>

                <div className="grid gap-4">
                  {selectedExp.prompts.map((prompt) => (
                    <Card
                      key={prompt.id}
                      className="border-l-4 border-l-blue-500"
                    >
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <CardTitle className="text-base">
                              {prompt.name}
                            </CardTitle>
                            <Badge variant="outline" className="text-xs">
                              {prompt.id}
                            </Badge>
                          </div>
                          <Badge
                            variant={
                              prompt.status === "generated"
                                ? "default"
                                : prompt.status === "error"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {prompt.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">
                            {prompt.content}
                          </div>
                          {prompt.reasoning && (
                            <div className="rounded-md bg-blue-50 p-3 text-sm">
                              <p className="mb-1 font-medium text-blue-900">
                                Reasoning:
                              </p>
                              <p className="text-blue-800">
                                {prompt.reasoning}
                              </p>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Created{" "}
                            {new Date(prompt.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Regression Run Dialog */}
      <Dialog
        open={showRegressionDialog}
        onOpenChange={setShowRegressionDialog}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Create Regression Run - {selectedExp?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder={`Regression Run - ${selectedExp?.name || ""}`}
                  value={regressionFormData.name}
                  onChange={(e) =>
                    setRegressionFormData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description for this regression run"
                  value={regressionFormData.description}
                  onChange={(e) =>
                    setRegressionFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {/* Dataset Selection */}
            <div className="space-y-2">
              <Label htmlFor="dataset">Dataset</Label>
              <Select
                value={regressionFormData.datasetId}
                onValueChange={(value) =>
                  setRegressionFormData((prev) => ({
                    ...prev,
                    datasetId: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select dataset for regression testing" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.data?.map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Evaluators */}
            {regressionFormData.datasetId && hasEvalReadAccess && (
              <div className="space-y-2">
                <Label>Evaluators</Label>
                <TemplateSelector
                  projectId={projectId}
                  datasetId={regressionFormData.datasetId}
                  evalTemplates={evalTemplates.data?.templates ?? []}
                  onConfigureTemplate={handleConfigureEvaluator}
                  onSelectEvaluator={handleSelectEvaluator}
                  activeTemplateIds={activeEvaluators}
                  inactiveTemplateIds={inActiveEvaluators}
                />
              </div>
            )}

            {/* Total Runs */}
            <div className="space-y-2">
              <Label htmlFor="totalRuns">Total Runs</Label>
              <Input
                id="totalRuns"
                type="number"
                min="1"
                max="100"
                value={regressionFormData.totalRuns}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 1;
                  const clampedValue = Math.min(Math.max(value, 1), 100);
                  setRegressionFormData((prev) => ({
                    ...prev,
                    totalRuns: clampedValue,
                  }));
                }}
              />
            </div>

            {/* Prompt Summary */}
            {selectedExp && (
              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium">Selected Prompts</h4>
                <p className="text-sm text-muted-foreground">
                  {selectedExp.prompts.length} prompts from &ldquo;
                  {selectedExp.name}&rdquo; will be tested
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowRegressionDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  console.log(
                    "Creating regression run with data:",
                    regressionFormData,
                  );
                  console.log("Selected experiment:", selectedExp);
                  handleCreateRegressionRun().catch((error) => {
                    console.error("Error creating regression run:", error);
                    alert(`Error: ${JSON.stringify(error, null, 2)}`);
                  });
                }}
                disabled={
                  !regressionFormData.datasetId || createRegressionRun.isPending
                }
              >
                {createRegressionRun.isPending
                  ? "Creating..."
                  : "Create Regression Run"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Evaluator Form Dialog */}
      <Dialog
        open={showEvaluatorForm}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseEvaluatorForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedEvaluatorData ? "Edit" : "Create"} Evaluator
            </DialogTitle>
          </DialogHeader>
          <EvaluatorForm
            projectId={projectId}
            evalTemplates={evalTemplates.data?.templates ?? []}
            useDialog={false}
            existingEvaluator={selectedEvaluatorData?.evaluator}
            onFormSuccess={handleEvaluatorSuccess}
            templateId={selectedEvaluatorData?.templateId}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PromptExperimentsPage;

import { type NextPage } from "next";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
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
  TestTube,
  FlaskConical,
  FolderOpen,
  Search,
  Calendar,
  Hash,
  FileText,
  ChevronRight,
  Plus,
} from "lucide-react";
import Header from "@/src/components/layouts/header";

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
                    onClick={() =>
                      router.push(
                        `/project/${projectId}/prompts/regression-runs`,
                      )
                    }
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
    </>
  );
};

export default PromptExperimentsPage;

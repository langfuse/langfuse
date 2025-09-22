import { type NextPage } from "next";
import { useState, useEffect } from "react";
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
import { ScrollArea } from "@/src/components/ui/scroll-area";
import {
  TestTube,
  FolderOpen,
  Search,
  Plus,
  ChevronRight,
  FileText,
  Calendar,
  Hash,
  Trash2,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(
    null,
  );
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  // Load experiments from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("promptExperiments");
    if (saved) {
      try {
        setExperiments(JSON.parse(saved));
      } catch (error) {
        console.error("Failed to parse experiments from localStorage:", error);
        setExperiments([]);
      }
    }
  }, []);

  // Save experiments to localStorage whenever experiments change
  useEffect(() => {
    localStorage.setItem("promptExperiments", JSON.stringify(experiments));
  }, [experiments]);

  // Delete experiment function
  const deleteExperiment = (experimentId: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this experiment? This action cannot be undone.",
      )
    ) {
      setExperiments((prev) => prev.filter((exp) => exp.id !== experimentId));
      if (selectedExperiment === experimentId) {
        setSelectedExperiment(null);
      }
    }
  };

  // Delete individual prompt function
  const deletePrompt = (experimentId: string, promptId: string) => {
    if (
      window.confirm(
        "Are you sure you want to delete this prompt variation? This action cannot be undone.",
      )
    ) {
      setExperiments((prev) =>
        prev.map((exp) =>
          exp.id === experimentId
            ? {
                ...exp,
                prompts: exp.prompts.filter((p) => p.id !== promptId),
                promptCount: exp.prompts.filter((p) => p.id !== promptId)
                  .length,
              }
            : exp,
        ),
      );
    }
  };

  const filteredExperiments = experiments.filter(
    (exp) =>
      exp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.id.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedExp = selectedExperiment
    ? experiments.find((exp) => exp.id === selectedExperiment)
    : null;

  return (
    <>
      <Header
        title="Prompt Experiments"
        help={{
          description:
            "Manage and organize your prompt experiments by ID with all variations stored under each experiment directory.",
        }}
      />

      <div className="flex h-full">
        {/* Experiments Sidebar */}
        <div className="w-80 border-r bg-background">
          <div className="border-b p-4">
            <div className="mb-4 flex items-center gap-2">
              <TestTube className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold">Experiments</h2>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
              <Input
                placeholder="Search experiments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="p-2">
              {filteredExperiments.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <TestTube className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No experiments found</p>
                  <p className="text-sm">Create experiments in Auto Sweep</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredExperiments.map((experiment) => (
                    <Card
                      key={experiment.id}
                      className={`cursor-pointer transition-colors hover:bg-accent ${
                        selectedExperiment === experiment.id
                          ? "bg-accent ring-2 ring-blue-500"
                          : ""
                      }`}
                      onClick={() => setSelectedExperiment(experiment.id)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-blue-600" />
                            <CardTitle className="truncate text-sm">
                              {experiment.name}
                            </CardTitle>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteExperiment(experiment.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <CardDescription className="text-xs">
                          ID: {experiment.id}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{experiment.promptCount} prompts</span>
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {!selectedExp ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FolderOpen className="mx-auto mb-4 h-16 w-16 opacity-50" />
                <h3 className="mb-2 text-lg font-medium">
                  Select an Experiment
                </h3>
                <p>
                  Choose an experiment from the sidebar to view its prompt
                  variations
                </p>
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
                      selectedExp.status === "active" ? "default" : "secondary"
                    }
                  >
                    {selectedExp.status}
                  </Badge>
                </div>
              </div>

              {/* Prompt Variations */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Prompt Variations</h2>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Variation
                  </Button>
                </div>

                <div className="grid gap-4">
                  {selectedExp.prompts.map((prompt, index) => (
                    <Card
                      key={prompt.id}
                      className="border-l-4 border-l-blue-500"
                    >
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <CardTitle className="text-base">
                              Variation {index + 1}
                            </CardTitle>
                            <Badge variant="outline" className="text-xs">
                              {prompt.id}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                              onClick={() =>
                                deletePrompt(selectedExp.id, prompt.id)
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                            <div className="text-xs text-muted-foreground">
                              {new Date(prompt.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">
                            {prompt.content}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              <Plus className="mr-1 h-4 w-4" />
                              Create Version
                            </Button>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                            <Button variant="outline" size="sm">
                              Copy
                            </Button>
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

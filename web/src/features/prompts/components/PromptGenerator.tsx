import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Badge } from "@/src/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Plus,
  Wand2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
} from "lucide-react";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { PromptType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { env } from "@/src/env.mjs";

const PromptGeneratorSchema = z.object({
  selectedPrompt: z
    .string()
    .min(1, "Please select a prompt to generate variations from"),
  userPreference: z
    .string()
    .min(1, "Please describe your preference for prompt modifications"),
  numberOfVersions: z
    .number()
    .min(1, "Must generate at least 1 version")
    .max(100, "Cannot generate more than 100 versions"),
});

type PromptGeneratorSchemaType = z.infer<typeof PromptGeneratorSchema>;

interface GeneratedPromptVersion {
  id: string;
  content: string;
  reasoning: string;
  status: "generating" | "generated" | "error";
}

export const PromptGenerator: React.FC = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [generatedVersions, setGeneratedVersions] = useState<
    GeneratedPromptVersion[]
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const form = useForm<PromptGeneratorSchemaType>({
    resolver: zodResolver(PromptGeneratorSchema),
    defaultValues: {
      selectedPrompt: "",
      userPreference: "",
      // No default value for numberOfVersions
    },
  });

  // Fetch available prompts for selection - only prompts with production label
  const { data: allPromptVersions, isLoading: promptsLoading } =
    api.prompts.all.useQuery(
      {
        projectId,
        page: 0,
        limit: 100,
        orderBy: { column: "name", order: "ASC" },
        filter: [
          {
            column: "labels",
            operator: "any of",
            value: ["production"],
            type: "arrayOptions",
          },
        ],
      },
      { enabled: !!projectId },
    );

  // Get unique prompt names (latest production version of each prompt)
  const prompts = React.useMemo(() => {
    if (!allPromptVersions?.prompts) return [];

    // Group by name and get the latest version for each
    const promptsByName = new Map();
    allPromptVersions.prompts.forEach((prompt: any) => {
      const existing = promptsByName.get(prompt.name);
      if (!existing || prompt.version > existing.version) {
        promptsByName.set(prompt.name, prompt);
      }
    });

    return Array.from(promptsByName.values());
  }, [allPromptVersions?.prompts]);

  // Get the selected prompt details when a prompt is selected
  const selectedPromptName = form.watch("selectedPrompt");
  const selectedPrompt = selectedPromptName
    ? prompts.find((p: any) => p.name === selectedPromptName)
    : null;

  // API mutation for creating prompt versions
  const createPromptVersionMutation = api.prompts.create.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Prompt version created successfully!",
        description:
          "The new prompt version has been added to your collection.",
      });
    },
    onError: (error) => {
      showErrorToast(
        "Error",
        error.message || "Failed to create prompt version",
      );
    },
  });

  // API configuration for LLM generation
  const [validModel, setValidModel] = useState<any>(null);

  // Fetch model configuration on component mount
  useEffect(() => {
    const fetchModelConfig = async () => {
      try {
        const response = await fetch(
          `/api/trpc/defaultLlmModel.fetchValidModelConfig?batch=1&input=${encodeURIComponent(
            JSON.stringify({
              "0": {
                json: {
                  projectId: projectId,
                },
              },
            }),
          )}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setValidModel(data[0]?.result?.data?.json);
        } else {
          console.error("Failed to fetch model config:", response.statusText);
        }
      } catch (error) {
        console.error("Error fetching model config:", error);
      }
    };

    if (projectId) {
      fetchModelConfig();
    }
  }, [projectId]);

  // Real function to generate prompt versions using LLM
  const generatePromptVersions = async (data: PromptGeneratorSchemaType) => {
    if (!selectedPrompt) {
      showErrorToast("Error", "Please select a prompt first");
      return;
    }

    setIsGenerating(true);
    setGeneratedVersions([]);

    // Create placeholder versions
    const placeholderVersions: GeneratedPromptVersion[] = Array.from(
      { length: data.numberOfVersions },
      (_, index) => ({
        id: `generated-${index + 1}`,
        content: "",
        reasoning: "",
        status: "generating" as const,
      }),
    );

    setGeneratedVersions(placeholderVersions);

    const originalContent =
      selectedPrompt.type === PromptType.Text
        ? (selectedPrompt.prompt as string)
        : JSON.stringify(selectedPrompt.prompt, null, 2);

    // Generate each version using LLM
    for (let i = 0; i < data.numberOfVersions; i++) {
      try {
        const systemPrompt = `You are an expert prompt engineer. Your task is to create an improved version of a given prompt based on specific user requirements.

Instructions:
1. Analyze the original prompt
2. Apply the user's modification preference
3. Return ONLY a JSON object with this exact structure:
{
  "content": "the improved prompt content",
  "reasoning": "brief explanation of what changes were made and why"
}

Do not include any other text, markdown formatting, or code blocks. Return only the raw JSON object.`;

        const userMessage = `Original prompt:
${originalContent}

User's modification preference:
${data.userPreference}

Please create variation ${i + 1} of ${data.numberOfVersions} that incorporates the user's preference while maintaining the core functionality of the original prompt.`;

        // Get model configuration
        if (!validModel) {
          console.error("Model configuration not available");
          setGeneratedVersions((prev) =>
            prev.map((version, index) =>
              index === i ? { ...version, status: "error" as const } : version,
            ),
          );
          continue;
        }

        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ];

        const body = JSON.stringify({
          ...validModel,
          messages,
          streaming: false,
        });

        console.log("Making LLM request with body:", {
          projectId,
          modelParams: validModel,
          messageCount: messages.length,
        });

        const result = await fetch(
          `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chatCompletion`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          },
        );

        console.log("LLM response status:", result.status, result.statusText);

        if (!result.ok) {
          console.error("LLM request failed:", result.statusText);
          setGeneratedVersions((prev) =>
            prev.map((version, index) =>
              index === i ? { ...version, status: "error" as const } : version,
            ),
          );
          continue;
        }

        const response = await result.json();

        if (response.completion) {
          try {
            // Parse the JSON response from the LLM
            const parsedResponse = JSON.parse(response.completion);

            setGeneratedVersions((prev) =>
              prev.map((version, index) =>
                index === i
                  ? {
                      ...version,
                      content:
                        parsedResponse.content || `Generated version ${i + 1}`,
                      reasoning:
                        parsedResponse.reasoning || "LLM-generated variation",
                      status: "generated" as const,
                    }
                  : version,
              ),
            );
          } catch (parseError) {
            // If JSON parsing fails, use the raw response
            setGeneratedVersions((prev) =>
              prev.map((version, index) =>
                index === i
                  ? {
                      ...version,
                      content:
                        response.completion || `Generated version ${i + 1}`,
                      reasoning: "LLM-generated variation (raw response)",
                      status: "generated" as const,
                    }
                  : version,
              ),
            );
          }
        } else {
          throw new Error("No completion received from LLM");
        }
      } catch (error) {
        console.error(`Error generating version ${i + 1}:`, error);
        setGeneratedVersions((prev) =>
          prev.map((version, index) =>
            index === i
              ? {
                  ...version,
                  content: "",
                  reasoning: "Failed to generate",
                  status: "error" as const,
                }
              : version,
          ),
        );
      }
    }

    setIsGenerating(false);
    showSuccessToast({
      title: "Prompt versions generated successfully!",
      description: "Your new prompt variations are ready to review and create.",
    });
  };

  const handleCreateVersion = async (
    generatedVersion: GeneratedPromptVersion,
  ) => {
    if (!selectedPrompt) {
      showErrorToast("Error", "No selected prompt found");
      return;
    }

    try {
      // Create a new version of the existing prompt
      await createPromptVersionMutation.mutateAsync({
        projectId,
        name: selectedPrompt.name,
        prompt: generatedVersion.content,
        type: selectedPrompt.type,
        config: selectedPrompt.config,
        labels: selectedPrompt.labels,
        tags: selectedPrompt.tags,
      });

      // Remove the generated version from the list after successful creation
      setGeneratedVersions((prev) =>
        prev.filter((v) => v.id !== generatedVersion.id),
      );
    } catch (error) {
      console.error("Error creating prompt version:", error);
      showErrorToast("Error", "Failed to create prompt version");
    }
  };

  const handleCopyContent = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      showSuccessToast({
        title: "Content copied to clipboard!",
        description: "The prompt content has been copied successfully",
      });
    } catch (error) {
      showErrorToast("Error", "Failed to copy content");
    }
  };

  const onSubmit = (data: PromptGeneratorSchemaType) => {
    generatePromptVersions(data);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Auto Sweep</h2>
        <p className="text-muted-foreground">
          Generate multiple variations of your prompt based on specific
          preferences or requirements.
        </p>
      </div>

      {/* Generation Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Generate Prompt Versions
          </CardTitle>
          <CardDescription>
            Select a prompt and describe how you&apos;d like to modify it.
            We&apos;ll generate multiple versions for you to choose from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="selectedPrompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Select Prompt</FormLabel>
                    <FormDescription>
                      Choose the prompt you want to generate variations from.
                    </FormDescription>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a prompt..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[200px] overflow-y-auto">
                        {promptsLoading ? (
                          <div className="p-2 text-center text-sm text-muted-foreground">
                            Loading prompts...
                          </div>
                        ) : !prompts || prompts.length === 0 ? (
                          <div className="p-2 text-center text-sm text-muted-foreground">
                            No prompts found
                          </div>
                        ) : (
                          prompts.map((prompt) => (
                            <SelectItem key={prompt.name} value={prompt.name}>
                              <div className="flex flex-col items-start">
                                <span className="font-medium">
                                  {prompt.name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  v{prompt.version} • {prompt.type}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="userPreference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modification Preference</FormLabel>
                    <FormDescription>
                      Describe how you want the prompt to be modified. For
                      example: &quot;Make it more formal&quot;, &quot;Add more
                      context&quot;, &quot;Make it shorter and more
                      direct&quot;, etc.
                    </FormDescription>
                    <FormControl>
                      <Textarea
                        placeholder="E.g., Make the prompt more conversational and friendly while maintaining technical accuracy..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numberOfVersions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Versions</FormLabel>
                    <FormDescription>
                      How many different versions would you like to generate?
                      (1-100)
                    </FormDescription>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        placeholder="Enter number of versions..."
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || undefined)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isGenerating} className="w-full">
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate Versions
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Selected Prompt Preview */}
      {selectedPrompt && (
        <Card>
          <CardHeader>
            <CardTitle>Selected Prompt Preview</CardTitle>
            <CardDescription>
              This is the prompt that will be used as the base for generating
              new versions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedPrompt.type}</Badge>
                <Badge variant="outline">
                  Version {selectedPrompt.version}
                </Badge>
              </div>
              <div className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">
                {selectedPrompt.type === PromptType.Text
                  ? (selectedPrompt.prompt as string)
                  : JSON.stringify(selectedPrompt.prompt, null, 2)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generated Versions */}
      {generatedVersions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Generated Versions</h3>
          <div className="grid gap-4">
            {generatedVersions.map((version, index) => (
              <Card key={version.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Version {index + 1}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {version.status === "generating" && (
                        <Badge variant="secondary" className="gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Generating...
                        </Badge>
                      )}
                      {version.status === "generated" && (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Generated
                        </Badge>
                      )}
                      {version.status === "error" && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Error
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {version.status === "generated" && (
                    <>
                      <div>
                        <h4 className="mb-2 font-medium">Generated Content:</h4>
                        <div className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">
                          {version.content}
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-2 font-medium">Reasoning:</h4>
                        <p className="text-sm text-muted-foreground">
                          {version.reasoning}
                        </p>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => handleCreateVersion(version)}
                          size="sm"
                          className="gap-1"
                        >
                          <Plus className="h-4 w-4" />
                          Create as New Version
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyContent(version.content)}
                          className="gap-1"
                        >
                          <Copy className="h-4 w-4" />
                          Copy Content
                        </Button>
                      </div>
                    </>
                  )}

                  {version.status === "generating" && (
                    <div className="flex items-center justify-center py-8">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating version...
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

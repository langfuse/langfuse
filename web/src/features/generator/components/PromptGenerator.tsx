import React, { useState } from "react";
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
  TestTube,
} from "lucide-react";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import {
  PromptType,
  type ChatMessage,
  ChatMessageRole,
  ChatMessageType,
} from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { env } from "@/src/env.mjs";
import { ScrollArea } from "@/src/components/ui/scroll-area";

const PromptGeneratorSchema = z.object({
  selectedPrompt: z.string().min(1, "Please select a prompt"),
  userPreference: z
    .string()
    .min(1, "Please describe your preference for prompt modifications"),
  numberOfVersions: z
    .number()
    .min(1, "Must generate at least 1 version")
    .max(100, "Cannot generate more than 100 versions"),
  experimentId: z
    .string()
    .min(1, "Please provide an experiment ID to track this sweep"),
});

type PromptGeneratorSchemaType = z.infer<typeof PromptGeneratorSchema>;

interface GeneratedPromptVersion {
  id: string;
  content: string; // Display content (formatted for UI)
  reasoning: string;
  status: "generating" | "generated" | "error";
  rawContent?: any; // Raw content from LLM (for proper prompt creation)
}

export const PromptGenerator: React.FC = () => {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const utils = api.useUtils();

  const [generatedVersions, setGeneratedVersions] = useState<
    GeneratedPromptVersion[]
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const form = useForm<PromptGeneratorSchemaType>({
    resolver: zodResolver(PromptGeneratorSchema),
    defaultValues: {
      selectedPrompt: "",
      userPreference: "",
      experimentId: "",
      // No default values for numberOfVersions
    },
  });

  // Fetch available prompts for selection - include production and auto-sweep prompts
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
            value: ["production", "auto-sweep"],
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
      // Invalidate prompts cache to refresh the list
      utils.prompts.all.invalidate();
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

  // API mutation for LLM generation
  // Removed - using direct fetch instead

  // Real function to generate prompt versions using LLM
  // Function to update experiment data in localStorage
  const updateExperimentData = (
    experimentId: string,
    selectedPrompt: any,
    generatedVersions: any[],
  ) => {
    const experimentData = {
      id: experimentId,
      name: `${selectedPrompt.name} Experiment`,
      description: `Auto Sweep experiment with ${generatedVersions.length} variations`,
      createdAt: new Date().toISOString(),
      promptCount: generatedVersions.length,
      status: "active" as const,
      prompts: generatedVersions.map((version, index) => ({
        id: `${experimentId}-${index + 1}`,
        name: `Variation ${index + 1}`,
        content: version.content || "Generating...",
        rawContent: version.rawContent,
        reasoning: version.reasoning || "In progress...",
        status: version.status,
        createdAt: new Date().toISOString(),
      })),
    };

    // Save to localStorage
    const existingExperiments = JSON.parse(
      localStorage.getItem("promptExperiments") || "[]",
    );
    const updatedExperiments = existingExperiments.filter(
      (exp: any) => exp.id !== experimentId,
    );
    updatedExperiments.push(experimentData);
    localStorage.setItem(
      "promptExperiments",
      JSON.stringify(updatedExperiments),
    );
  };

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
        rawContent: undefined,
      }),
    );

    setGeneratedVersions(placeholderVersions);

    // Create initial experiment entry with placeholder data
    updateExperimentData(
      data.experimentId,
      selectedPrompt,
      placeholderVersions,
    );

    const originalContent =
      selectedPrompt.type === PromptType.Text
        ? (selectedPrompt.prompt as string)
        : JSON.stringify(selectedPrompt.prompt, null, 2);

    // Generate each version using LLM
    for (let i = 0; i < data.numberOfVersions; i++) {
      try {
        console.log(`Generating version ${i + 1}/${data.numberOfVersions}`);

        const systemPrompt = `You are an expert prompt engineer. Your task is to create an improved version of a given prompt based on specific user requirements.

Instructions:
1. Analyze the original prompt structure and content
2. Apply the user's modification preference while maintaining the original format
3. If the original prompt has system and user messages, maintain that structure
4. Return ONLY a JSON object with this exact structure:

For text prompts:
{
  "content": "the improved prompt content",
  "reasoning": "brief explanation of what changes were made and why"
}

For chat prompts with system/user messages:
{
  "content": [
    {
      "role": "system", 
      "content": "improved system message"
    },
    {
      "role": "user",
      "content": "improved user message with {{variables}} maintained"
    }
  ],
  "reasoning": "brief explanation of what changes were made and why"
}

Maintain any variables like {{country}}, {{variable_name}} exactly as they appear in the original prompt.
Do not include any other text, markdown formatting, or code blocks. Return only the raw JSON object.`;

        const userMessage = `Original prompt:
${originalContent}

User's modification preference:
${data.userPreference}

Please create variation ${i + 1} of ${data.numberOfVersions} that incorporates the user's preference while maintaining the core functionality and structure of the original prompt.`;

        const messages: ChatMessage[] = [
          {
            type: ChatMessageType.System,
            role: ChatMessageRole.System,
            content: systemPrompt,
          },
          {
            type: ChatMessageType.User,
            role: ChatMessageRole.User,
            content: userMessage,
          },
        ];

        // Use the default evaluation model service for consistent LLM calling
        console.log(
          "Making authenticated request to fetchValidModelConfig with projectId:",
          projectId,
        );
        const modelValidation = await fetch(
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
            credentials: "include", // Include cookies for authentication
          },
        );

        if (!modelValidation.ok) {
          console.error(
            "Model validation request failed:",
            modelValidation.status,
            modelValidation.statusText,
          );
          throw new Error(
            `Authentication failed: ${modelValidation.status} ${modelValidation.statusText}`,
          );
        }

        const modelValidationResult = await modelValidation.json();

        console.log("Model validation response:", modelValidationResult);

        if (!modelValidationResult?.[0]?.result?.data?.json?.valid) {
          const errorMessage =
            modelValidationResult?.[0]?.result?.data?.json?.error ||
            "No valid model configuration found. Please set up a default evaluation model in project settings.";
          console.error("Model validation failed:", errorMessage);
          throw new Error(errorMessage);
        }

        const validModel = modelValidationResult[0].result.data.json.config;

        // Debug: Log the complete validModel structure
        console.log(
          "Complete validModel structure:",
          JSON.stringify(validModel, null, 2),
        );

        // Use the same approach as playground - construct proper ModelParams
        const modelParams = {
          provider: validModel.provider, // Database provider field
          adapter: validModel.apiKey.adapter, // LLMAdapter enum value
          model: validModel.model,
          temperature: validModel.modelParams?.temperature ?? 0.7,
          max_tokens: validModel.modelParams?.max_tokens ?? 1000,
        };

        console.log("Using modelParams for chat completion:", modelParams);

        const body = JSON.stringify({
          projectId,
          messages,
          modelParams,
          streaming: false,
        });

        console.log("Making LLM request with body:", {
          projectId,
          modelParams,
          messageCount: messages.length,
          fullPayload: JSON.parse(body), // Log the complete payload
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
          const errorData = await result.json();
          console.error("LLM request failed:", errorData);
          throw new Error(
            `Completion failed: ${errorData.message || "Unknown error"}`,
          );
        }

        const responseData = await result.json();
        console.log("LLM response data:", responseData);
        const completion = responseData.content || "";

        if (completion) {
          try {
            // Parse the JSON response from the LLM
            const parsedResponse = JSON.parse(completion);
            console.log("Parsed LLM response:", parsedResponse);

            // Handle content based on its type (string for text prompts, array for chat prompts)
            let content: string;
            if (typeof parsedResponse.content === "string") {
              // Text prompt - keep as string
              content = parsedResponse.content;
            } else if (Array.isArray(parsedResponse.content)) {
              // Chat prompt - format as readable text for display but keep structure
              const chatMessages = parsedResponse.content as Array<{
                role: string;
                content: string;
              }>;
              content = chatMessages
                .map((msg) => `${msg.role.toUpperCase()}\n${msg.content}`)
                .join("\n\n");
            } else if (typeof parsedResponse.content === "object") {
              // Object format - stringify for now
              content = JSON.stringify(parsedResponse.content, null, 2);
            } else {
              content = `Generated version ${i + 1}`;
            }

            const reasoning =
              typeof parsedResponse.reasoning === "string"
                ? parsedResponse.reasoning
                : typeof parsedResponse.reasoning === "object"
                  ? JSON.stringify(parsedResponse.reasoning)
                  : "LLM-generated variation";

            setGeneratedVersions((prev) => {
              const updated = prev.map((version, index) =>
                index === i
                  ? {
                      ...version,
                      content: content || `Generated version ${i + 1}`,
                      reasoning: reasoning || "LLM-generated variation",
                      status: "generated" as const,
                      // Store the raw response for proper prompt creation - ensure it's never null/undefined
                      rawContent:
                        parsedResponse.content !== undefined &&
                        parsedResponse.content !== null
                          ? parsedResponse.content
                          : content || `Generated version ${i + 1}`,
                    }
                  : version,
              );
              // Update experiment data in localStorage
              updateExperimentData(data.experimentId, selectedPrompt, updated);
              return updated;
            });
          } catch (parseError) {
            console.warn(
              "JSON parsing failed, using raw response:",
              parseError,
            );
            // If JSON parsing fails, use the raw response
            const safeCompletion =
              typeof completion === "string"
                ? completion
                : typeof completion === "object"
                  ? JSON.stringify(completion)
                  : `Generated version ${i + 1}`;

            setGeneratedVersions((prev) => {
              const updated = prev.map((version, index) =>
                index === i
                  ? {
                      ...version,
                      content: safeCompletion || `Generated version ${i + 1}`,
                      reasoning: "LLM-generated variation (raw response)",
                      status: "generated" as const,
                      // Ensure rawContent is always set for successful generations
                      rawContent:
                        safeCompletion ||
                        completion ||
                        `Generated version ${i + 1}`,
                    }
                  : version,
              );
              // Update experiment data in localStorage
              updateExperimentData(data.experimentId, selectedPrompt, updated);
              return updated;
            });
          }
        } else {
          throw new Error("No completion received from LLM");
        }
      } catch (error) {
        console.error(`Error generating version ${i + 1}:`, error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === "object"
              ? JSON.stringify(error)
              : "Generation failed";

        setGeneratedVersions((prev) => {
          const updated = prev.map((version, index) =>
            index === i
              ? {
                  ...version,
                  content: `Error: ${errorMessage}`,
                  reasoning: "Failed to generate",
                  status: "error" as const,
                  rawContent: undefined,
                }
              : version,
          );
          // Update experiment data in localStorage
          updateExperimentData(data.experimentId, selectedPrompt, updated);
          return updated;
        });
      }
    }

    setIsGenerating(false);

    // Automatically create prompt versions for successfully generated variations
    try {
      // Get all successfully generated versions (same as what shows the "Create Version" button)
      const currentVersions = generatedVersions.filter(
        (v) => v.status === "generated",
      );

      console.log("Auto Sweep: Found generated versions for auto-creation", {
        totalVersions: generatedVersions.length,
        generatedVersions: currentVersions.length,
        versions: currentVersions.map((v) => ({
          id: v.id,
          status: v.status,
          hasContent: !!v.content,
          hasRawContent: !!v.rawContent,
          contentType: typeof v.content,
        })),
      });

      console.log("Auto Sweep: Starting auto-creation process", {
        totalVersions: generatedVersions.length,
        successfulVersions: currentVersions.length,
        selectedPrompt: selectedPrompt?.name,
        projectId,
        allVersionsDebug: generatedVersions.map((v) => ({
          id: v.id,
          status: v.status,
          hasRawContent: !!v.rawContent,
          rawContentType: typeof v.rawContent,
        })),
      });

      if (currentVersions.length === 0) {
        console.warn(
          "Auto Sweep: No successful versions found to create - all versions failed filter criteria",
        );
        showSuccessToast({
          title: "Prompt versions generated!",
          description:
            "Generated versions but unable to auto-create due to missing content.",
        });
        return;
      }

      let createdCount = 0;
      for (const version of currentVersions) {
        try {
          // Use the exact same logic as handleCreateVersion
          let promptContent;

          if (selectedPrompt.type === PromptType.Text) {
            // For text prompts, use the rawContent if available, otherwise use the display content
            promptContent =
              version.rawContent && typeof version.rawContent === "string"
                ? version.rawContent
                : version.content;
          } else {
            // For chat prompts, use rawContent if it's an array, otherwise convert display content
            if (version.rawContent && Array.isArray(version.rawContent)) {
              // Use the raw chat format from LLM
              promptContent = version.rawContent.map((msg: any) => ({
                role: msg.role,
                content: msg.content,
              }));
            } else {
              // Fallback: convert display content to chat format
              promptContent = [
                {
                  role: "user",
                  content: version.content,
                },
              ];
            }
          }

          console.log(
            "Auto Sweep: Creating version using handleCreateVersion logic",
            {
              versionId: version.id,
              promptType: selectedPrompt.type,
              hasRawContent: !!version.rawContent,
            },
          );

          // Create a new version using the exact same logic as the manual button
          // BUT without production labels
          const labelsWithoutProduction =
            selectedPrompt.labels?.filter(
              (label: string) => label !== "production",
            ) || [];

          if (selectedPrompt.type === PromptType.Text) {
            await createPromptVersionMutation.mutateAsync({
              projectId,
              name: selectedPrompt.name,
              prompt: promptContent as string,
              type: PromptType.Text,
              config: selectedPrompt.config,
              labels: labelsWithoutProduction, // Remove production label
              tags: selectedPrompt.tags,
            });
          } else {
            await createPromptVersionMutation.mutateAsync({
              projectId,
              name: selectedPrompt.name,
              prompt: promptContent as { role: string; content: string }[],
              type: PromptType.Chat,
              config: selectedPrompt.config,
              labels: labelsWithoutProduction, // Remove production label
              tags: selectedPrompt.tags,
            });
          }

          console.log("Auto Sweep: Successfully created version", {
            versionId: version.id,
          });
          createdCount++;
        } catch (error) {
          console.error("Error auto-creating prompt version:", error);
          // Continue with other versions even if one fails
        }
      }

      // Clear generated versions since they've been automatically created
      setGeneratedVersions([]);

      console.log("Auto Sweep: Auto-creation process completed", {
        attempted: currentVersions.length,
        successful: createdCount,
      });

      showSuccessToast({
        title: `${createdCount} prompt versions created automatically!`,
        description:
          "Auto Sweep variations have been added to your prompts with unique version tags.",
      });
    } catch (error) {
      console.error("Error in auto-creation process:", error);
      showErrorToast(
        "Auto Sweep Error",
        `Failed to auto-create prompt versions: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleCreateVersion = async (
    generatedVersion: GeneratedPromptVersion,
  ) => {
    if (!selectedPrompt) {
      showErrorToast("Error", "No selected prompt found");
      return;
    }

    try {
      // Prepare the prompt content based on the selected prompt type
      let promptContent;

      if (selectedPrompt.type === PromptType.Text) {
        // For text prompts, use the rawContent if available, otherwise use the display content
        promptContent =
          generatedVersion.rawContent &&
          typeof generatedVersion.rawContent === "string"
            ? generatedVersion.rawContent
            : generatedVersion.content;
      } else {
        // For chat prompts, use rawContent if it's an array, otherwise convert display content
        if (
          generatedVersion.rawContent &&
          Array.isArray(generatedVersion.rawContent)
        ) {
          // Use the raw chat format from LLM
          promptContent = generatedVersion.rawContent.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
          }));
        } else {
          // Fallback: convert display content to chat format
          promptContent = [
            {
              role: "user",
              content: generatedVersion.content,
            },
          ];
        }
      }

      // Create a new version of the existing prompt
      if (selectedPrompt.type === PromptType.Text) {
        await createPromptVersionMutation.mutateAsync({
          projectId,
          name: selectedPrompt.name,
          prompt: promptContent as string,
          type: PromptType.Text,
          config: selectedPrompt.config,
          labels: selectedPrompt.labels,
          tags: selectedPrompt.tags,
        });
      } else {
        await createPromptVersionMutation.mutateAsync({
          projectId,
          name: selectedPrompt.name,
          prompt: promptContent as { role: string; content: string }[],
          type: PromptType.Chat,
          config: selectedPrompt.config,
          labels: selectedPrompt.labels,
          tags: selectedPrompt.tags,
        });
      }

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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 space-y-2 border-b p-6">
        <h2 className="text-2xl font-bold">Auto Sweep</h2>
        <p className="text-muted-foreground">
          Generate multiple variations of your prompt based on specific
          preferences or requirements.
        </p>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-6 p-6">
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
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <FormField
                      control={form.control}
                      name="selectedPrompt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Select Prompt</FormLabel>
                          <FormDescription>
                            Choose the prompt you want to generate variations
                            from.
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
                                  <SelectItem
                                    key={prompt.name}
                                    value={prompt.name}
                                  >
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
                            example: &quot;Make it more formal&quot;, &quot;Add
                            more context&quot;, &quot;Make it shorter and more
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
                            How many different versions would you like to
                            generate? (1-100)
                          </FormDescription>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              placeholder="Enter number of versions..."
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  parseInt(e.target.value) || undefined,
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="experimentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prompt Sweep Experiment ID</FormLabel>
                          <FormDescription>
                            Unique identifier for this experiment session
                          </FormDescription>
                          <FormControl>
                            <Input
                              placeholder="Enter experiment ID..."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={isGenerating}
                      className="w-full"
                    >
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
                    This is the prompt that will be used as the base for
                    generating new versions.
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
                    <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">
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
                              <h4 className="mb-2 font-medium">
                                Generated Content:
                              </h4>
                              <ScrollArea className="h-[200px] w-full rounded-md border">
                                <div className="whitespace-pre-wrap p-3 font-mono text-sm">
                                  {version.content}
                                </div>
                              </ScrollArea>
                            </div>

                            <div>
                              <h4 className="mb-2 font-medium">Reasoning:</h4>
                              <ScrollArea className="h-[100px] w-full rounded-md border">
                                <p className="p-3 text-sm text-muted-foreground">
                                  {version.reasoning}
                                </p>
                              </ScrollArea>
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
                                onClick={() =>
                                  handleCopyContent(version.content)
                                }
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

            {/* Prompt Experiments Section */}
            {form.watch("experimentId") && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <TestTube className="h-5 w-5" />
                        Prompt Experiments
                      </CardTitle>
                      <CardDescription>
                        Experiment ID: {form.watch("experimentId")} | Generated
                        prompts stored under this experiment
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        router.push(
                          `/project/${projectId}/prompts/experiments`,
                        );
                      }}
                      className="gap-1"
                    >
                      <TestTube className="h-4 w-4" />
                      View All Experiments
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {generatedVersions.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        <TestTube className="mx-auto mb-4 h-12 w-12 opacity-50" />
                        <p>No prompts generated yet</p>
                        <p className="text-sm">
                          Generate prompts above to see them stored under this
                          experiment ID
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-muted-foreground">
                            {
                              generatedVersions.filter(
                                (v) => v.status === "generated",
                              ).length
                            }{" "}
                            of {generatedVersions.length} prompts ready
                          </div>
                          <Badge variant="outline" className="text-xs">
                            Experiment: {form.watch("experimentId")}
                          </Badge>
                        </div>

                        {/* Prompt List */}
                        <div className="space-y-3">
                          {generatedVersions.map((version, index) => (
                            <Card
                              key={version.id}
                              className="border-l-4 border-l-blue-500"
                            >
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">
                                      Prompt Variation {index + 1}
                                    </span>
                                    {version.status === "generating" && (
                                      <Badge
                                        variant="secondary"
                                        className="gap-1"
                                      >
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Generating...
                                      </Badge>
                                    )}
                                    {version.status === "generated" && (
                                      <Badge
                                        variant="default"
                                        className="gap-1"
                                      >
                                        <CheckCircle className="h-3 w-3" />
                                        Ready
                                      </Badge>
                                    )}
                                    {version.status === "error" && (
                                      <Badge
                                        variant="destructive"
                                        className="gap-1"
                                      >
                                        <AlertCircle className="h-3 w-3" />
                                        Error
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    ID: {form.watch("experimentId")}-{index + 1}
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                {version.status === "generated" && (
                                  <div className="space-y-3">
                                    <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">
                                      {version.content}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      <strong>Reasoning:</strong>{" "}
                                      {version.reasoning}
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          handleCreateVersion(version)
                                        }
                                        className="gap-1"
                                      >
                                        <Plus className="h-4 w-4" />
                                        Create Version
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          handleCopyContent(version.content)
                                        }
                                        className="gap-1"
                                      >
                                        <Copy className="h-4 w-4" />
                                        Copy Content
                                      </Button>
                                    </div>
                                  </div>
                                )}
                                {version.status === "generating" && (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Generating variation...
                                    </div>
                                  </div>
                                )}
                                {version.status === "error" && (
                                  <div className="text-sm text-destructive">
                                    {version.content}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

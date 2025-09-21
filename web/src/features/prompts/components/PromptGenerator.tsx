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
} from "lucide-react";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { PromptType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

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

  // Fetch available prompts for selection
  const { data: allPromptVersions } =
    api.prompts.all.useQuery(
      { 
        projectId, 
        page: 0,
        limit: 100,
        orderBy: { column: "name", order: "ASC" },
        filter: []
      },
      { enabled: !!projectId }
    );

  // Get the selected prompt details when a prompt is selected
  const selectedPromptName = form.watch("selectedPrompt");
  const selectedPromptData = selectedPromptName 
    ? allPromptVersions?.prompts.find((p: any) => `${p.name}|${p.version}` === selectedPromptName)
    : null;

  // Use the selected version data directly since it's already the complete prompt data
  const selectedPrompt = selectedPromptData;

  // Mock function to simulate LLM generation
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

    // Simulate generation process
    for (let i = 0; i < data.numberOfVersions; i++) {
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 + Math.random() * 2000),
      );

      const originalContent =
        selectedPrompt.type === PromptType.Text
          ? (selectedPrompt.prompt as string)
          : JSON.stringify(selectedPrompt.prompt, null, 2);

      // Mock generated content based on user preference
      const mockContent = generateMockContent(
        originalContent,
        data.userPreference,
        i + 1,
      );
      const mockReasoning = generateMockReasoning(data.userPreference, i + 1);

      setGeneratedVersions((prev) =>
        prev.map((version, index) =>
          index === i
            ? {
                ...version,
                content: mockContent,
                reasoning: mockReasoning,
                status: "generated" as const,
              }
            : version,
        ),
      );
    }

    setIsGenerating(false);
    showSuccessToast({
      title: "Prompt versions generated successfully!",
      description: "Your new prompt variations are ready to review.",
    });
  };

  const generateMockContent = (
    original: string,
    preference: string,
    versionNumber: number,
  ): string => {
    const variations = [
      `Modified version ${versionNumber}: ${original}\n\nBased on preference: ${preference}`,
      `Enhanced prompt (v${versionNumber}): ${original}\n\nOptimized for: ${preference}`,
      `Refined version ${versionNumber}: ${original}\n\nTailored to: ${preference}`,
    ];
    return variations[versionNumber - 1] || variations[0];
  };

  const generateMockReasoning = (
    preference: string,
    versionNumber: number,
  ): string => {
    const reasonings = [
      `This version incorporates your preference for "${preference}" by adjusting the tone and structure.`,
      `Modified to better align with "${preference}" while maintaining the original intent.`,
      `Enhanced based on the requirement for "${preference}" with improved clarity and focus.`,
    ];
    return reasonings[versionNumber - 1] || reasonings[0];
  };

  const handleCreateVersion = async (
    _generatedVersion: GeneratedPromptVersion,
  ) => {
    try {
      showSuccessToast({
        title: "Version created successfully!",
        description:
          "Mock implementation - this will integrate with your LLM backend",
      });
    } catch (error) {
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
        <h2 className="text-2xl font-bold">Prompt Generator</h2>
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
                      <SelectContent>
                        {!allPromptVersions ? (
                          <div className="p-2 text-center text-sm text-muted-foreground">
                            Loading prompts...
                          </div>
                        ) : !allPromptVersions?.prompts || allPromptVersions.prompts.length === 0 ? (
                          <div className="p-2 text-center text-sm text-muted-foreground">
                            No prompts found
                          </div>
                        ) : (
                          allPromptVersions.prompts.map((prompt: any) => (
                            <SelectItem key={`${prompt.name}|${prompt.version}`} value={`${prompt.name}|${prompt.version}`}>
                              <div className="flex items-center justify-between w-full">
                                <span>{prompt.name}</span>
                                <Badge variant="outline" className="ml-2">
                                  v{prompt.version}
                                </Badge>
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

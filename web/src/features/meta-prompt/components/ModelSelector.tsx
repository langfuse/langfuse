import React from "react";
import { AlertCircle, Settings } from "lucide-react";
import Link from "next/link";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import type { TargetPlatform } from "@/src/features/meta-prompt/types";

type ModelSelectorProps = {
  availableProviders: string[];
  availableModels: string[];
  selectedProvider: string;
  selectedModel: string;
  targetPlatform: TargetPlatform;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onTargetPlatformChange: (platform: TargetPlatform) => void;
};

const TARGET_PLATFORMS: { value: TargetPlatform; label: string }[] = [
  { value: "generic", label: "Generic" },
  { value: "openai", label: "OpenAI" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
];

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  availableProviders,
  availableModels,
  selectedProvider,
  selectedModel,
  targetPlatform,
  onProviderChange,
  onModelChange,
  onTargetPlatformChange,
}) => {
  const projectId = useProjectIdFromURL();

  if (availableProviders.length === 0) {
    return (
      <div className="p-2">
        <Alert
          variant="default"
          className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20"
        >
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-400">
            No LLM Connection Configured
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-500">
            To use AI-assisted prompt creation, please configure an LLM
            connection first. Go to{" "}
            <Link
              href={`/project/${projectId}/settings/llm-connections`}
              className="font-medium underline underline-offset-4 hover:text-yellow-900 dark:hover:text-yellow-300"
            >
              <Settings className="inline h-3 w-3" /> LLM Connection Settings
            </Link>{" "}
            to add an API key.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 border-b p-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label className="text-xs text-muted-foreground">Provider</label>
        <Select value={selectedProvider} onValueChange={onProviderChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label className="text-xs text-muted-foreground">Model</label>
        <Select value={selectedModel} onValueChange={onModelChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label className="text-xs text-muted-foreground">Target Platform</label>
        <Select
          value={targetPlatform}
          onValueChange={(v) => onTargetPlatformChange(v as TargetPlatform)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select platform" />
          </SelectTrigger>
          <SelectContent>
            {TARGET_PLATFORMS.map((platform) => (
              <SelectItem key={platform.value} value={platform.value}>
                {platform.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

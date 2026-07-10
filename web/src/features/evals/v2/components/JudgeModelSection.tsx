import Link from "next/link";
import { useForm } from "react-hook-form";
import { TriangleAlert } from "lucide-react";

import { Form } from "@/src/components/ui/form";
import { Label } from "@/src/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import {
  ModelParameters,
  type ModelParamsContext,
} from "@/src/components/ModelParameters";
import { api } from "@/src/utils/api";

export type JudgeModelMode = "default" | "custom";

/**
 * Judge model picker: project default (read-only summary + link to edit) or a
 * custom model via the shared ModelParameters control. The model params state
 * is owned by the form (it feeds both save and test payloads).
 */
export function JudgeModelSection({
  projectId,
  mode,
  onModeChange,
  modelParamsContext,
}: {
  projectId: string;
  mode: JudgeModelMode;
  onModeChange: (mode: JudgeModelMode) => void;
  modelParamsContext: ModelParamsContext;
}) {
  const { data: defaultModel } = api.defaultLlmModel.fetchDefaultModel.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  // ModelParameters renders react-hook-form context components internally
  // (FormDescription etc.), but this screen is not driven by react-hook-form.
  // A dummy provider keeps those components from crashing on a null context.
  const dummyForm = useForm();

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={mode}
        onValueChange={(value) => onModeChange(value as JudgeModelMode)}
        className="flex items-center gap-4"
      >
        <div className="flex items-center gap-1.5">
          <RadioGroupItem value="default" id="judge-model-default" />
          <Label htmlFor="judge-model-default" className="font-normal">
            Project default
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <RadioGroupItem value="custom" id="judge-model-custom" />
          <Label htmlFor="judge-model-custom" className="font-normal">
            Custom
          </Label>
        </div>
      </RadioGroup>

      {mode === "default" ? (
        defaultModel ? (
          <p className="text-muted-foreground text-sm">
            {defaultModel.provider} / {defaultModel.model}{" "}
            <Link
              href={`/project/${projectId}/evals/default-model`}
              className="hover:text-foreground underline"
            >
              edit
            </Link>
          </p>
        ) : (
          <p className="text-dark-yellow flex items-center gap-1 text-sm">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>
              No default evaluation model set —{" "}
              <Link
                href={`/project/${projectId}/evals/default-model`}
                className="underline"
              >
                configure one
              </Link>{" "}
              or pick a custom model.
            </span>
          </p>
        )
      ) : (
        <Form {...dummyForm}>
          <ModelParameters
            {...modelParamsContext}
            isEmbedded
            modelParamsDescription="Select a model which supports function calling."
          />
        </Form>
      )}
    </div>
  );
}

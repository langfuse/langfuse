import { CheckIcon, ExternalLink } from "lucide-react";
import { useRouter } from "next/router";

import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
  InputCommandSeparator,
} from "@/src/components/ui/input-command";
import { PopoverContent } from "@/src/components/ui/popover";
import type { RuleEvaluatorOption } from "@/src/features/evals/v2/types/rules";

export function ExperimentEvaluatorSelectorContent({
  projectId,
  evaluatorOptions,
  search,
  onSearchChange,
}: {
  projectId: string;
  evaluatorOptions: RuleEvaluatorOption[];
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const router = useRouter();

  return (
    <PopoverContent className="w-[320px] p-0" align="start">
      <InputCommand shouldFilter={false}>
        <InputCommandInput
          placeholder="Search evaluators..."
          className="h-9"
          variant="bottom"
          value={search}
          onValueChange={onSearchChange}
        />
        <InputCommandList>
          <InputCommandEmpty>No evaluator found.</InputCommandEmpty>
          <InputCommandGroup heading="Experiment evaluators">
            {evaluatorOptions.map((evaluator) => (
              <InputCommandItem
                key={evaluator.id}
                value={`${evaluator.name} ${evaluator.id}`}
              >
                <CheckIcon className="h-4 w-4" />
                <span className="truncate" title={evaluator.name}>
                  {evaluator.name}
                </span>
              </InputCommandItem>
            ))}
          </InputCommandGroup>
          <InputCommandSeparator alwaysRender />
          <InputCommandGroup forceMount>
            <InputCommandItem
              onSelect={() => router.push(`/project/${projectId}/evals`)}
            >
              Manage evaluators
              <ExternalLink className="ml-auto h-4 w-4" />
            </InputCommandItem>
          </InputCommandGroup>
        </InputCommandList>
      </InputCommand>
    </PopoverContent>
  );
}

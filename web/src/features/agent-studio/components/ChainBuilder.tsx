import React, { useState } from "react";
import { Plus, Trash2, ArrowDown, Save } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Badge } from "@/src/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Separator } from "@/src/components/ui/separator";
import { api } from "@/src/utils/api";
import {
  type LangGraphAssistant,
  type ChainStep,
  type AgentStudioChainRecord,
} from "../types";

type Props = {
  projectId: string;
  serverId: string;
  assistants: LangGraphAssistant[];
  chain?: AgentStudioChainRecord | null;
  onClose: () => void;
  onRunChain: (steps: ChainStep[]) => void;
};

export function ChainBuilder({
  projectId,
  serverId,
  assistants,
  chain,
  onClose,
  onRunChain,
}: Props) {
  const [chainName, setChainName] = useState(chain?.name ?? "My Chain");
  const [steps, setSteps] = useState<ChainStep[]>(
    chain?.steps ?? [{ assistantId: "", assistantName: "", fieldMappings: [] }],
  );

  const utils = api.useUtils();
  const upsertChain = api.agentStudio.upsertChain.useMutation({
    onSuccess: async () => {
      await utils.agentStudio.listServers.invalidate({ projectId });
    },
  });

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { assistantId: "", assistantName: "", fieldMappings: [] },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, updates: Partial<ChainStep>) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)),
    );
  };

  const addMapping = (stepIdx: number) => {
    updateStep(stepIdx, {
      fieldMappings: [
        ...(steps[stepIdx]?.fieldMappings ?? []),
        { fromPath: "", toField: "" },
      ],
    });
  };

  const updateMapping = (
    stepIdx: number,
    mapIdx: number,
    key: "fromPath" | "toField",
    val: string,
  ) => {
    const step = steps[stepIdx];
    if (!step) return;
    const mappings = [...step.fieldMappings];
    mappings[mapIdx] = { ...mappings[mapIdx]!, [key]: val };
    updateStep(stepIdx, { fieldMappings: mappings });
  };

  const removeMapping = (stepIdx: number, mapIdx: number) => {
    const step = steps[stepIdx];
    if (!step) return;
    updateStep(stepIdx, {
      fieldMappings: step.fieldMappings.filter((_, i) => i !== mapIdx),
    });
  };

  const handleSave = () => {
    upsertChain.mutate({
      projectId,
      serverId,
      id: chain?.id,
      name: chainName,
      steps,
    });
  };

  const isValid = steps.every((s) => s.assistantId.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Chain Name</Label>
        <Input
          value={chainName}
          onChange={(e) => setChainName(e.target.value)}
          placeholder="My Chain"
        />
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        {steps.map((step, stepIdx) => (
          <div key={stepIdx} className="flex flex-col gap-3">
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs">
                  Step {stepIdx + 1}
                </Badge>
                {steps.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeStep(stepIdx)}
                  >
                    <Trash2 className="text-destructive h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-2">
                <Label className="text-xs">Graph</Label>
                <Select
                  value={step.assistantId}
                  onValueChange={(v) => {
                    const a = assistants.find((x) => x.assistant_id === v);
                    updateStep(stepIdx, {
                      assistantId: v,
                      assistantName: a?.name ?? v,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a graph…" />
                  </SelectTrigger>
                  <SelectContent>
                    {assistants.map((a) => (
                      <SelectItem key={a.assistant_id} value={a.assistant_id}>
                        {a.name || a.graph_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {step.fieldMappings.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-muted-foreground text-xs">
                      Output → next input mappings
                    </Label>
                    {step.fieldMappings.map((m, mapIdx) => (
                      <div key={mapIdx} className="flex items-center gap-1">
                        <Input
                          className="h-7 text-xs"
                          placeholder="from.path"
                          value={m.fromPath}
                          onChange={(e) =>
                            updateMapping(
                              stepIdx,
                              mapIdx,
                              "fromPath",
                              e.target.value,
                            )
                          }
                        />
                        <span className="text-muted-foreground text-xs">→</span>
                        <Input
                          className="h-7 text-xs"
                          placeholder="to_field"
                          value={m.toField}
                          onChange={(e) =>
                            updateMapping(
                              stepIdx,
                              mapIdx,
                              "toField",
                              e.target.value,
                            )
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => removeMapping(stepIdx, mapIdx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {stepIdx < steps.length - 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start text-xs"
                    onClick={() => addMapping(stepIdx)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Map output field
                  </Button>
                )}
              </div>
            </div>

            {stepIdx < steps.length - 1 && (
              <div className="flex justify-center">
                <ArrowDown className="text-muted-foreground h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={addStep}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Step
        </Button>
      </div>

      <Separator />

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={!isValid || upsertChain.isPending}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {upsertChain.isPending ? "Saving…" : "Save Chain"}
        </Button>
        <Button size="sm" onClick={() => onRunChain(steps)} disabled={!isValid}>
          Run Chain
        </Button>
      </div>
    </div>
  );
}

import React from "react";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { useExperimentFormContext } from "@/src/features/experiments/context/ExperimentFormContext";

export const ExperimentDetailsStep: React.FC = () => {
  const { form, runName } = useExperimentFormContext();
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">Experiment Run Details</h3>
        <p className="text-sm text-muted-foreground">
          Provide a name and optional description for your experiment to help
          identify and track it.
        </p>
      </div>

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Experiment name</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="Enter experiment name"
                className="w-full"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-2">
        <FormLabel>Run name (auto-generated)</FormLabel>
        <Input value={runName} disabled className="w-full" />
        <FormDescription>
          This run name is auto-generated from the experiment name and can be
          used to fetch the experiment via the public API.
        </FormDescription>
      </div>

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description (optional)</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Describe the purpose or context of this experiment"
                className="min-h-[100px] w-full"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

import React from "react";
import { PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { PromptLabelSchema } from "@/src/features/prompts/server/utils/validation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { isReservedPromptLabel } from "@/src/features/prompts/utils";

const AddLabelFormSchema = z.object({
  newLabel: PromptLabelSchema.refine(
    (val) => !isReservedPromptLabel(val),
    "Custom label cannot be 'latest' or 'production'",
  ),
});

type AddLabelFromSchemaType = z.infer<typeof AddLabelFormSchema>;

export const AddLabelForm = (props: {
  setLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedLabels: React.Dispatch<React.SetStateAction<string[]>>;
  onAddLabel: () => void;
}) => {
  const capture = usePostHogClientCapture();

  const form = useForm<AddLabelFromSchemaType>({
    resolver: zodResolver(AddLabelFormSchema),
    defaultValues: {
      newLabel: "",
    },
  });

  const onSubmit = () => {
    const newLabel = form.getValues().newLabel;

    props.setLabels((prev) => [...prev, newLabel]);
    props.setSelectedLabels((prev) => [...new Set([...prev, newLabel])]);
    capture("prompt_detail:add_label_submit");
    props.onAddLabel();
    form.reset();
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="my-3 flex flex-row space-x-2 align-top"
      >
        <FormField
          control={form.control}
          name="newLabel"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Input placeholder="New label" {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <Button type="submit" size="icon" variant="outline">
          <PlusIcon className="h-5 w-5" />
        </Button>
      </form>
    </Form>
  );
};

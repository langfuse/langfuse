import React from "react";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import Header from "@/src/components/layouts/header";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { XIcon, Check, ChevronsUpDown } from "lucide-react";
import { ActionButton } from "@/src/components/ActionButton";
import { cn } from "@/src/utils/tailwind";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/src/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";

import { StatusBadge } from "@/src/components/layouts/status-badge";
import {
  LATEST_PROMPT_LABEL,
  PRODUCTION_LABEL,
  PromptLabelSchema,
} from "@langfuse/shared";

const AddLabelFormSchema = z.object({
  label: PromptLabelSchema,
});

type AddLabelFormSchemaType = z.infer<typeof AddLabelFormSchema>;

export default function ProtectedLabelsSettings({
  projectId,
}: {
  projectId: string;
}) {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "promptProtectedLabels:CUD",
  });
  const hasEntitlement = useHasEntitlement("prompt-protected-labels");

  const form = useForm({
    resolver: zodResolver(AddLabelFormSchema),
    defaultValues: {
      label: "",
    },
  });

  const utils = api.useUtils();
  const { data: protectedLabels = [] } =
    api.prompts.getProtectedLabels.useQuery(
      { projectId },
      {
        enabled: Boolean(projectId),
      },
    );

  const { data: allLabels = [] } = api.prompts.allLabels.useQuery(
    { projectId },
    {
      enabled: Boolean(projectId),
    },
  );

  // Filter out labels that are already protected
  const availableLabels = allLabels.filter(
    (label) =>
      !protectedLabels.includes(label) && label !== LATEST_PROMPT_LABEL,
  );

  const addProtectedLabel = api.prompts.addProtectedLabel.useMutation({
    onSuccess: () => {
      utils.prompts.getProtectedLabels.invalidate();
      form.reset();
    },
  });

  const removeProtectedLabel = api.prompts.removeProtectedLabel.useMutation({
    onSuccess: () => {
      utils.prompts.getProtectedLabels.invalidate();
    },
  });

  function onSubmit(values: AddLabelFormSchemaType) {
    addProtectedLabel.mutate({
      projectId,
      label: values.label,
    });
  }

  const [open, setOpen] = React.useState(false);

  return (
    <div>
      <Header title="Protected Prompt Labels" />
      <Card className="mb-4 p-3">
        <p className="mb-4 text-sm text-primary">
          Protected labels can only be modified by users with admin or owner
          access. This prevents other users from changing or removing these
          labels from prompts.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {protectedLabels.map((label) => (
            <StatusBadge
              type={label}
              key={label}
              className="break-all sm:break-normal"
              isLive={label === PRODUCTION_LABEL}
            >
              {hasAccess && hasEntitlement && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => {
                    if (
                      confirm(
                        `Are you sure you want to remove the protected label "${label}"?`,
                      )
                    ) {
                      removeProtectedLabel.mutate({ projectId, label });
                    }
                  }}
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              )}
            </StatusBadge>
          ))}
        </div>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex items-start gap-2"
          >
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={open}
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground",
                          )}
                          disabled={!hasAccess || !hasEntitlement}
                        >
                          {field.value || "Select or enter a label"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput
                          placeholder="Search or enter a new label..."
                          onValueChange={(value) => {
                            field.onChange(value);
                          }}
                        />
                        <CommandEmpty>No label found</CommandEmpty>
                        <CommandGroup>
                          {availableLabels.map((label) => (
                            <CommandItem
                              value={label}
                              key={label}
                              onSelect={() => {
                                field.onChange(label);
                                setOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  field.value === label
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              {label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <ActionButton
              type="submit"
              variant="secondary"
              loading={addProtectedLabel.isLoading}
              hasAccess={hasAccess}
              hasEntitlement={hasEntitlement}
            >
              Add
            </ActionButton>
          </form>
        </Form>
      </Card>
    </div>
  );
}

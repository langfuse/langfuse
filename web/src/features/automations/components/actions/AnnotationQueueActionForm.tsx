import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { api } from "@/src/utils/api";
import { type UseFormReturn } from "react-hook-form";

export const AnnotationQueueActionForm = ({
  form,
  disabled,
  projectId,
}: {
  form: UseFormReturn<any>;
  disabled: boolean;
  projectId: string;
}) => {
  const queues = api.annotationQueues.allNamesAndIds.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  return (
    <FormField
      control={form.control}
      name="annotationQueue.queueIds"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Annotation queues</FormLabel>
          <FormControl>
            <MultiSelectTagInput
              value={field.value ?? []}
              options={(queues.data ?? []).map((queue) => ({
                value: queue.id,
                label: queue.name,
              }))}
              onValueChange={field.onChange}
              placeholder="Select annotation queues"
              searchPlaceholder="Search annotation queues"
              emptyMessage="No annotation queues found"
              disabled={disabled || queues.isLoading}
            />
          </FormControl>
          <FormDescription>
            Matching observations are added to every selected queue.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

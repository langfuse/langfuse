import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { api } from "@/src/utils/api";

export const annotationQueueSchema = z.object({
  queueId: z.string(),
});

export type AnnotationQueueFormValues = z.infer<typeof annotationQueueSchema>;

interface AnnotationQueueActionFormProps {
  form: UseFormReturn<any>;
  disabled: boolean;
  projectId: string;
}

export const AnnotationQueueActionForm: React.FC<
  AnnotationQueueActionFormProps
> = ({ form, disabled, projectId }) => {
  // Fetch available annotation queues
  const { data: annotationQueues, isLoading } =
    api.annotationQueues.allNamesAndIds.useQuery(
      { projectId },
      { enabled: !disabled },
    );

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="annotationQueue.queueId"
        rules={{ required: "Annotation Queue is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              Annotation Queue <span className="ml-1 text-destructive">*</span>
            </FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value || ""}
              disabled={disabled || isLoading}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select an annotation queue" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {isLoading ? (
                  <SelectItem value="" disabled>
                    Loading queues...
                  </SelectItem>
                ) : annotationQueues && annotationQueues.length > 0 ? (
                  annotationQueues.map((queue) => (
                    <SelectItem key={queue.id} value={queue.id}>
                      {queue.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="" disabled>
                    No annotation queues available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <FormDescription>
              The annotation queue to add items to when the trigger fires.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

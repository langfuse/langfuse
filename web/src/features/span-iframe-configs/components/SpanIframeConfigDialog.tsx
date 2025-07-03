import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
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
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useToast } from "@/src/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  url: z.string()
    .url("Must be a valid URL")
    .refine((url) => url.startsWith("https://"), "URL must use HTTPS"),
  spanName: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface SpanIframeConfigDialogProps {
  projectId: string;
  configId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SpanIframeConfigDialog({
  projectId,
  configId,
  open,
  onOpenChange,
  onSuccess,
}: SpanIframeConfigDialogProps) {
  const { toast } = useToast();
  const isEditing = !!configId;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      url: "",
      spanName: "",
    },
  });

  const { data: existingConfig } = api.spanIframeConfigs.byId.useQuery(
    {
      id: configId!,
      projectId,
    },
    {
      enabled: !!configId,
    }
  );

  const createMutation = api.spanIframeConfigs.create.useMutation({
    onSuccess: () => {
      toast({
        title: "Configuration created",
        description: "Span iframe configuration has been created successfully.",
      });
      onSuccess();
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error creating configuration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = api.spanIframeConfigs.update.useMutation({
    onSuccess: () => {
      toast({
        title: "Configuration updated",
        description: "Span iframe configuration has been updated successfully.",
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error updating configuration",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (existingConfig) {
      form.reset({
        name: existingConfig.name,
        description: existingConfig.description || "",
        url: existingConfig.url,
        spanName: existingConfig.spanName || "",
      });
    } else if (!isEditing) {
      form.reset({
        name: "",
        description: "",
        url: "",
        spanName: "",
      });
    }
  }, [existingConfig, isEditing, form]);

  const onSubmit = async (data: FormData) => {
    const payload = {
      ...data,
      projectId,
      description: data.description || undefined,
      spanName: data.spanName || undefined,
    };

    if (isEditing && configId) {
      await updateMutation.mutateAsync({
        ...payload,
        id: configId,
      });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  const isLoading = createMutation.isLoading || updateMutation.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Iframe Configuration" : "Create Iframe Configuration"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Image Viewer, Custom Table"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A descriptive name for this iframe configuration.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe what this iframe configuration does..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional description to help explain the purpose of this configuration.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Iframe URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/my-iframe?input={{input}}&output={{output}}"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    The HTTPS URL for your iframe. Use templates: <code>{"{{input}}"}</code>, <code>{"{{output}}"}</code>, <code>{"{{metadata}}"}</code>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="spanName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Span Name Filter (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., image_search, llm_call"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    If specified, this iframe will only be shown for spans with this exact name. Leave empty to show for all spans.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && "Loading..."}
                {!isLoading && (isEditing ? "Update Configuration" : "Create Configuration")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
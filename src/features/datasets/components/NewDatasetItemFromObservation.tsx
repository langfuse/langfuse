import { Button } from "@/src/components/ui/button";
import { ChevronDown, PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
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
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { usePostHog } from "posthog-js/react";
import { env } from "@/src/env.mjs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import Link from "next/link";
import { Textarea } from "@/src/components/ui/textarea";

const formSchema = z.object({
  datasetId: z.string().min(1, "Select a dataset"),
  input: z.string(),
  expectedOutput: z.string(),
});

export const NewDatasetItemFromObservationButton = (props: {
  projectId: string;
  observationId: string;
  observationInput: string;
  observationOutput: string;
}) => {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      datasetId: "",
      input: props.observationInput,
      expectedOutput: props.observationOutput,
    },
  });

  console.log(props);

  const datasets = api.datasets.all.useQuery({ projectId: props.projectId });
  const observationInDatasets = api.datasets.observationInDatasets.useQuery({
    projectId: props.projectId,
    observationId: props.observationId,
  });

  const utils = api.useContext();
  const createDatasetItemMutation = api.datasets.createDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    posthog.capture("datasets:data_set_item_from_observation_form_submit");
    createDatasetItemMutation
      .mutateAsync({
        ...values,
        projectId: props.projectId,
        sourceObservationId: props.observationId,
      })
      .then(() => {
        setOpen(false);
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  if (env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_FEATURES !== "true") return null;
  return (
    <>
      {observationInDatasets.data && observationInDatasets.data.length > 0 ? (
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <span>{`In ${observationInDatasets.data.length} dataset(s)`}</span>
                <ChevronDown className="ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {observationInDatasets.data.map(
                ({ id: datasetItemId, dataset }) => (
                  <DropdownMenuItem
                    key={datasetItemId}
                    className="capitalize"
                    asChild
                  >
                    <Link
                      href={`/project/${props.projectId}/datasets/${dataset.id}/items/${datasetItemId}`}
                    >
                      {dataset.name}
                    </Link>
                  </DropdownMenuItem>
                ),
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="capitalize"
                onClick={() => setOpen(true)}
              >
                <PlusIcon size={16} className={cn("mr-2")} aria-hidden="true" />
                Add new
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <PlusIcon className={cn("-ml-0.5 mr-1.5")} aria-hidden="true" />
          Add to dataset
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="mb-5">Add to dataset</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-8"
            >
              <FormField
                control={form.control}
                name="datasetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dataset</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a dataset" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {datasets.data?.map((dataset) => (
                          <SelectItem value={dataset.id} key={dataset.id}>
                            {dataset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="input"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Input</FormLabel>
                    <FormControl>
                      <Textarea {...field} className="min-h-[120px]" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expectedOutput"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected output</FormLabel>
                    <FormControl>
                      <Textarea {...field} className="min-h-[120px]" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                loading={createDatasetItemMutation.isLoading}
                className="w-full"
              >
                Add to dataset
              </Button>
            </form>
          </Form>
          {formError ? (
            <p className="text-red text-center">
              <span className="font-bold">Error:</span> {formError}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};

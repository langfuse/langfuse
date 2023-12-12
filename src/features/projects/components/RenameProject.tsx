import { Card } from "@tremor/react";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";

const formSchema = z.object({
  newName: z.string().min(3, "Must have at least 3 characters"),
});

export default function RenameProject(props: { projectId: string }) {
  const utils = api.useUtils();
  const { data: getSessionData, update: updateSession } = useSession();
  const projectName = getSessionData?.user?.projects.find(
    (p) => p.id === props.projectId,
  )?.name;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newName: "",
    },
  });
  const renameProject = api.projects.update.useMutation({
    onSuccess: (_) => {
      void updateSession();
      void utils.projects.invalidate();
    },
    onError: (error) => form.setError("newName", { message: error.message }),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    renameProject
      .mutateAsync({ projectId: props.projectId, newName: values.newName })
      .then(() => {
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <div>
      <h2 className="mb-5 text-base font-semibold leading-6 text-gray-900">
        Project Name
      </h2>
      <Card className="mb-4">
        <div className="flex">
          <Form {...form}>
            <form
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex-1"
              data-testid="rename-project-form"
              id="rename-project-form"
            >
              <FormField
                control={form.control}
                name="newName"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder={projectName}
                        {...field}
                        className="flex-1"
                        data-testid="new-project-name-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="mt-4">
                {form.getValues().newName !== "" && (
                  <p className="mb-6 text-sm text-gray-700">
                    Your Project will be renamed to &quot;
                    <b>{form.watch().newName}</b>&quot;.
                  </p>
                )}
                {form.getValues().newName == "" && (
                  <p className=" text-sm text-gray-700">
                    Your Project is currently named &quot;<b>{projectName}</b>
                    &quot;.
                  </p>
                )}
              </div>
            </form>
          </Form>
        </div>
      </Card>
      <div className="mt-4 flex justify-between">
        <Button
          variant="secondary"
          form="rename-project-form"
          loading={renameProject.isLoading}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

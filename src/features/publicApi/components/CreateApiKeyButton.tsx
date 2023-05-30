import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { useState } from "react";
import * as z from "zod";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { CodeView } from "@/src/components/ui/code";

const formSchema = z.object({
  note: z.string(),
});

export function CreateApiKeyButton(props: { projectId: string }) {
  const utils = api.useContext();
  const createApiKey = api.apiKeys.create.useMutation({
    onSuccess: () => utils.apiKeys.invalidate(),
  });
  const [open, setOpen] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{
    secretKey: string;
    publishableKey: string;
  } | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      note: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createApiKey
      .mutateAsync({
        projectId: props.projectId,
        note: values.note.trim() !== "" ? values.note.trim() : undefined,
      })
      .then(({ secretKey, publishableKey }) => {
        setGeneratedKeys({
          secretKey,
          publishableKey,
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    form.reset();
    if (!open) setGeneratedKeys(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger>
        <Button variant="secondary">
          <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
          Create new API keys
        </Button>
      </DialogTrigger>
      <DialogContent>
        {generatedKeys === null ? (
          <>
            <DialogHeader>
              <DialogTitle className="mb-5">New API keys</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
              >
                <FormField
                  control={form.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Note</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormDescription>
                        Optional. A note to help you identify this API key.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
            <DialogFooter>
              <Button onClick={() => form.handleSubmit(onSubmit)}>
                Create
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div>
            <div>
              <div>
                <div className="mb-2 text-lg font-semibold">
                  Publishable Key
                </div>
                <CodeView>{generatedKeys.publishableKey}</CodeView>
              </div>
              <div className="mt-6">
                <div className="text-lg font-semibold">Secret Key</div>
                <div className="my-2">
                  Please save this secret key.{" "}
                  <span className="font-semibold">
                    You will not be able to view it again
                  </span>
                  . If you lose it, you will need to generate a new one.
                </div>
                <CodeView>{generatedKeys.secretKey}</CodeView>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

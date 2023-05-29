import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import * as z from "zod";
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
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { cn } from "@/src/utils/tailwind";

const formSchema = z.object({
  name: z
    .string()
    .min(3, "Must have at least 3 characters")
    .max(20, "Must have at most 20 characters")
    .regex(
      /^[a-z][-a-z0-9]{2,21}$/,
      "Must be lowercase, start with a letter, include hyphens)"
    ),
});

interface NewProjectButtonProps {
  size?: "xs" | "default";
}
export function NewProjectButton({ size = "default" }: NewProjectButtonProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });
  const utils = api.useContext();
  const router = useRouter();
  const createProjectMutation = api.projects.create.useMutation({
    onSuccess: () => utils.projects.invalidate(),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createProjectMutation
      .mutateAsync(values)
      .then((project) => {
        void router.push(`/project/${project.id}/setup`);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Dialog>
      <DialogTrigger>
        <Button size={size} variant={size === "xs" ? "secondary" : "default"}>
          <PlusIcon
            className={cn(
              "-ml-0.5 mr-1.5",
              size === "xs" ? "h-4 w-4" : "h-5 w-5"
            )}
            aria-hidden="true"
          />
          {size !== "xs" ? "New project" : "New"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <DialogHeader>
              <DialogTitle className="mb-5">New project</DialogTitle>
              <DialogDescription>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project name</FormLabel>
                      <FormControl>
                        <Input placeholder="shadcn" {...field} />
                      </FormControl>
                      <FormDescription>
                        This is your public display name.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import * as Sentry from "@sentry/nextjs";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
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
  FormMessage,
} from "@/src/components/ui/form";
import { type PropsWithChildren, useState } from "react";
import { useSession } from "next-auth/react";
import { Textarea } from "@/src/components/ui/textarea";

const formSchema = z.object({
  feedback: z.string().min(3, "Must have at least 3 characters"),
});

export function FeedbackButtonWrapper(
  props: PropsWithChildren<{ className?: string }>,
) {
  const [open, setOpen] = useState(false);
  const session = useSession();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      feedback: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // Add to sentry
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      const eventId = Sentry.captureMessage(`User submitted feedback`);
      Sentry.captureUserFeedback({
        event_id: eventId,
        email: session.data?.user?.email ?? "",
        name: session.data?.user?.name ?? "",
        comments: values.feedback,
      });
    }
    try {
      const res = await fetch("https://cloud.langfuse.com/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          url: window.location.href,
          user: session.data?.user,
        }),
      });
      if (res.ok) {
        setOpen(false);
      } else {
        const data = res.json();
        console.error(data);
        form.setError("feedback", {
          type: "manual",
          message: JSON.stringify(data),
        });
      }
    } catch (error) {
      console.error(error);
      form.setError("feedback", {
        type: "manual",
        message:
          "Failed to submit feedback, please email us: founders@langfuse.com",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={props.className} asChild>
        {props.children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="mb-5">Provide feedback</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8"
          >
            <FormField
              control={form.control}
              name="feedback"
              render={({ field }) => (
                <FormItem>
                  <FormDescription>
                    What do you think about this project? What can be improved?
                  </FormDescription>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              loading={form.formState.isSubmitting}
              className="w-full"
            >
              {form.formState.isSubmitting ? "Loading ..." : "Submit"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

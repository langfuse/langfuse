"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type z } from "zod";

import {
  SupportFormSchema,
  MESSAGE_TYPES,
  SEVERITIES,
  TopicGroups,
  type MessageType,
} from "./formConstants";

import { api } from "@/src/utils/api";

import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/src/components/ui/radio-group";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

/** Make RHF generics match the resolver (Zod defaults => input can be undefined) */
type SupportFormInput = z.input<typeof SupportFormSchema>;
type SupportFormValues = z.output<typeof SupportFormSchema>;

export function SupportFormSection({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const form = useForm<SupportFormInput>({
    resolver: zodResolver(SupportFormSchema),
    defaultValues: {
      messageType: "Question",
      severity: "Question or feature request",
      topic: "",
      message: "",
    },
    mode: "onChange",
  });

  const createTicket = api.supportChat2.createSupportThread.useMutation({
    onSuccess: () => {
      form.reset({
        messageType: "Question",
        severity: "Question or feature request",
        topic: undefined,
        message: "",
      });
      onSuccess();
    },
  });

  const onSubmit = (values: SupportFormInput) => {
    const parsed: SupportFormValues = SupportFormSchema.parse(values);
    createTicket.mutate({
      messageType: parsed.messageType as MessageType,
      topic: parsed.topic as any,
      severity: parsed.severity as any,
      message: parsed.message,
    });
  };

  const isSubmitting = createTicket.isPending;
  const isValid = form.formState.isValid;

  return (
    <div className="mt-1 flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        A few details help us route your request and get you the fastest, most
        helpful response.
      </p>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-5"
        >
          {/* Message Type */}
          <FormField
            control={form.control}
            name="messageType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message Type</FormLabel>
                <FormControl>
                  <RadioGroup
                    className="grid grid-cols-3 gap-2"
                    value={field.value ?? "Question"}
                    onValueChange={field.onChange}
                  >
                    {MESSAGE_TYPES.map((v) => (
                      <div
                        key={v}
                        className="flex items-center gap-2 rounded-md border p-2"
                      >
                        <RadioGroupItem value={v} id={`mt-${v}`} />
                        <Label htmlFor={`mt-${v}`} className="truncate">
                          {v}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </FormControl>
                <FormDescription className="sr-only">
                  Choose the type of your message.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Severity */}
          <FormField
            control={form.control}
            name="severity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Severity</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Topic */}
          <FormField
            control={form.control}
            name="topic"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Topic</FormLabel>
                <FormControl>
                  <Select
                    value={(field.value as string | undefined) ?? undefined}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                          Operations
                        </div>
                        {TopicGroups.Operations.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </div>
                      <div className="border-t p-2">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">
                          Product Features
                        </div>
                        {TopicGroups["Product Features"].map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </div>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Message */}
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={8}
                    placeholder={
                      "Please explain as fully as possible what you're aiming to do, and what you'd like help with.\n\nIf your question involves an existing insight or dashboard, please include a link to it."
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              disabled={isSubmitting || !isValid}
              className="w-full"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              className="w-full"
            >
              Cancel
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            We will email you at your account address. Replies may take up to
            one business day.
          </div>
        </form>
      </Form>
    </div>
  );
}

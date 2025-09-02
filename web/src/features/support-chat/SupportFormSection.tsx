"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type z } from "zod";
import { VERSION } from "@/src/constants";
import { env } from "@/src/env.mjs";
import {
  MESSAGE_TYPES,
  SEVERITIES,
  INTEGRATION_TYPES,
  TopicGroups,
  type MessageType,
  type Topic,
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
import { usePlan } from "@/src/features/entitlements/hooks";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { useState } from "react";
import { SupportFormSchema } from "./formConstants";

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
  const projectId = useProjectIdFromURL();
  const plan = usePlan();

  // Tracks whether we've already warned about a short message
  const [warnedShortOnce, setWarnedShortOnce] = useState(false);

  const form = useForm<SupportFormInput>({
    resolver: zodResolver(SupportFormSchema),
    defaultValues: {
      messageType: "Question" as MessageType,
      severity: "Question or feature request",
      topic: "",
      message: "",
      integrationType: "",
    },
    mode: "onChange",
  });

  const selectedTopic = form.watch("topic"); // subscribes to updates
  const isProductFeatureTopic = TopicGroups["Product Features"].includes(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectedTopic as any,
  );

  const createSupportThread = api.plainRouter.createSupportThread.useMutation({
    onSuccess: () => {
      form.reset({
        messageType: "Question",
        severity: "Question or feature request",
        topic: "",
        message: "",
      });
      setWarnedShortOnce(false);
      onSuccess();
    },
  });

  const onSubmit = (values: SupportFormInput) => {
    const parsed: SupportFormValues = SupportFormSchema.parse(values);
    const msgLen = (parsed.message ?? "").trim().length;

    // If message is short and we haven't warned yet: show warning and bail this time only
    if (msgLen < 20 && !warnedShortOnce) {
      setWarnedShortOnce(true);
      return;
    }

    createSupportThread.mutate({
      messageType: parsed.messageType,
      severity: parsed.severity,
      topic: parsed.topic as any, // already validated; Plain expects string
      integrationType: parsed.integrationType,
      message: parsed.message,
      url: window.location.href,
      projectId: projectId,
      version: VERSION,
      plan: plan,
      cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      browserMetadata: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        viewport: { w: window.innerWidth, h: window.innerHeight },
      },
    });
  };

  const isSubmitting = createSupportThread.isPending;
  // Since schema allows any length, we base enablement only on mutation state + topic valid via schema.
  const isValid = form.formState.isValid;

  const messageIsShortAfterWarning =
    warnedShortOnce && (form.getValues("message") ?? "").trim().length < 20;

  return (
    <div className="mt-1 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-base font-semibold">
        E-Mail a Support Engineer
      </div>
      <p className="text-sm text-muted-foreground">
        Details speed things up. The clearer your request, the quicker you get
        the answer you need.
      </p>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
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
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Integration Type */}
          {isProductFeatureTopic && (
            <FormField
              control={form.control}
              name="integrationType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Integration Type (optional)</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select integration type" />
                      </SelectTrigger>
                      <SelectContent>
                        {INTEGRATION_TYPES.map((it) => (
                          <SelectItem key={it} value={it}>
                            {it}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Message */}
          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message</FormLabel>
                <div className="text-xs text-muted-foreground">
                  We will email you at your account address. Replies may take up
                  to one business day.
                </div>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={8}
                    placeholder={
                      isProductFeatureTopic
                        ? "Please explain as fully as possible what you're aiming to do, and what you'd like help with.\n\nIf your question involves an specific trace, prompt, score, etc. please include a link to it."
                        : "Please explain as fully as possible what you're aiming to do, and what you'd like help with."
                    }
                  />
                </FormControl>

                {/* Friendly warning shown ONLY after a submit attempt with < 20 chars */}
                {messageIsShortAfterWarning && (
                  <p
                    className="mt-2 text-sm text-red-500"
                    role="status"
                    aria-live="polite"
                  >
                    The message seems short — adding a bit more context can help
                    us get you a quicker, smarter answer. You can submit again
                    as is, or add more details.
                  </p>
                )}

                <FormMessage />
              </FormItem>
            )}
          />

          {/* Actions */}
          <div className="flex flex-row gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setWarnedShortOnce(false);
                onCancel();
              }}
              className="w-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !isValid}
              className="w-full"
            >
              {isSubmitting
                ? "Submitting..."
                : messageIsShortAfterWarning
                  ? "Submit Anyways"
                  : "Submit"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

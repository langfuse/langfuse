"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type z } from "zod";
import {
  MESSAGE_TYPES,
  SEVERITIES,
  SEVERITY_1,
  SEVERITY_2,
  SEVERITY_3,
  INTEGRATION_TYPES,
  TopicGroups,
  type MessageType,
  type Topic,
  SupportFormSchema,
} from "./formConstants";

import { reportNonTrpcError } from "@/src/utils/api";

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { useEffect, useState } from "react";

import { Dropzone } from "@/src/components/design-system/Dropzone/Dropzone";
import { Trash2 } from "lucide-react";
import { PYLON_MAX_FILE_SIZE_BYTES } from "./pylon/pylonConstants";
import Spinner from "@/src/components/design-system/Spinner/Spinner";

/** Make RHF generics match the resolver (Zod defaults => input can be undefined) */
type SupportFormInput = z.input<typeof SupportFormSchema>;
export type SupportFormValues = z.output<typeof SupportFormSchema>;

/** `kept` leaves the draft intact after an expected, already-surfaced failure. */
export type SupportFormSubmitStatus = "success" | "kept";

export type SupportFormProps = {
  canSelectHighSeverity: boolean;
  initialTopic: Topic | "";
  showV4MigrationTopic: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  onSubmit: (
    values: SupportFormValues,
    files: File[],
  ) => Promise<SupportFormSubmitStatus>;
  onFileError: (message: string) => void;
};

/**
 * File upload constraints - single source of truth for validation
 * Uses Pylon's file size limit
 */
const FILE_UPLOAD_CONSTRAINTS = {
  maxFiles: 5,
  maxFileSizeBytes: PYLON_MAX_FILE_SIZE_BYTES, // 10MB (Pylon API limit)
  // Files are sent to /api/support/upload-attachments as base64-encoded JSON,
  // which inflates the body by ~33%. The endpoint's bodyParser caps the body
  // at 50MB, so the raw combined size must stay below ~37.5MB to fit. Use 35MB
  // for headroom (JSON overhead, multiple files).
  maxCombinedBytes: 35 * 1024 * 1024, // 35MB raw (~47MB once base64-encoded)
} as const;

/**
 * Validates files against upload constraints
 * @returns {isValid: boolean, error?: string}
 */
function validateFiles(files: File[] | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!files || files.length === 0) {
    return { isValid: true };
  }

  const { maxFiles, maxFileSizeBytes, maxCombinedBytes } =
    FILE_UPLOAD_CONSTRAINTS;

  // Check file count
  if (files.length > maxFiles) {
    return {
      isValid: false,
      error: `Please upload at most ${maxFiles} files.`,
    };
  }

  // Check individual file sizes
  const oversizedFile = files.find((f) => f.size > maxFileSizeBytes);
  if (oversizedFile) {
    const maxMB = (maxFileSizeBytes / (1024 * 1024)).toFixed(0);
    return {
      isValid: false,
      error: `File "${oversizedFile.name}" is too large. Maximum file size is ${maxMB}MB per file.`,
    };
  }

  // Check combined size
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > maxCombinedBytes) {
    const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
    const maxMB = (maxCombinedBytes / (1024 * 1024)).toFixed(0);
    return {
      isValid: false,
      error: `Total attachment size (${totalMB}MB) exceeds the limit of ${maxMB}MB.`,
    };
  }

  return { isValid: true };
}

/**
 * Converts technical file error messages to user-friendly ones
 */
function formatFileError(error: Error): string {
  const msg = error.message.toLowerCase();
  const { maxFiles, maxFileSizeBytes, maxCombinedBytes } =
    FILE_UPLOAD_CONSTRAINTS;
  const maxMB = (maxFileSizeBytes / (1024 * 1024)).toFixed(0);
  const maxCombinedMB = (maxCombinedBytes / (1024 * 1024)).toFixed(0);

  // File size errors
  if (
    msg.includes("larger than") ||
    msg.includes("10485760") ||
    msg.includes("10mb") ||
    msg.includes("too large")
  ) {
    return `File is too large. Maximum file size is ${maxMB}MB per file.`;
  }

  // File count errors
  if (
    msg.includes("too many") ||
    msg.includes("maxfiles") ||
    msg.includes("5 files")
  ) {
    return `Too many files. Maximum ${maxFiles} files allowed.`;
  }

  // Combined size errors
  if (msg.includes("total") && (msg.includes("50mb") || msg.includes("size"))) {
    return `Total attachment size exceeds limit. Maximum combined size is ${maxCombinedMB}MB.`;
  }

  // File type errors
  if (msg.includes("file type") || msg.includes("accept")) {
    return "File type not supported. Please select a different file.";
  }

  return error.message || "File upload failed. Please try again.";
}

function isSeveritySelectable(
  severity: string,
  canSelectHighSeverity: boolean,
): boolean {
  if (severity === SEVERITY_1 || severity === SEVERITY_2) {
    return canSelectHighSeverity;
  }
  return true;
}

export function SupportForm({
  canSelectHighSeverity,
  initialTopic,
  showV4MigrationTopic,
  onCancel,
  onSuccess,
  onSubmit,
  onFileError,
}: SupportFormProps) {
  // Tracks whether we've already warned about a short message
  const [warnedShortOnce, setWarnedShortOnce] = useState(false);

  // Local file state from Dropzone
  const [files, setFiles] = useState<File[] | undefined>(undefined);

  // Local submit guard to avoid flicker across multiple mutations
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  // Sev-1 pages the on-call team, so submission requires an explicit
  // confirmation step.
  const [sev1ConfirmOpen, setSev1ConfirmOpen] = useState(false);

  const productFeatureTopics = TopicGroups["Product Features"].filter(
    (topic) => topic !== "V4 Migration" || showV4MigrationTopic,
  );

  const form = useForm<SupportFormInput>({
    resolver: zodResolver(SupportFormSchema),
    defaultValues: {
      messageType: "Question" as MessageType,
      severity: SEVERITY_3,
      topic: initialTopic,
      message: "",
      integrationType: "",
    },
    mode: "onSubmit",
  });

  const selectedTopic = form.watch("topic");
  const isProductFeatureTopic = TopicGroups["Product Features"].includes(
    selectedTopic as (typeof TopicGroups)["Product Features"][number],
  );

  // The drawer is globally mounted, so a severity selected under one org's
  // plan can survive navigation to an org (or no-org page) that no longer
  // allows it. Snap back to Severity 3 so the visible selection, the Sev-1
  // confirm dialog, and the submitted value stay consistent with the plan.
  const selectedSeverity = form.watch("severity");
  useEffect(() => {
    if (
      selectedSeverity &&
      !isSeveritySelectable(selectedSeverity, canSelectHighSeverity)
    ) {
      form.setValue("severity", SEVERITY_3);
    }
  }, [selectedSeverity, canSelectHighSeverity, form]);

  const handleFormSubmit = async (values: SupportFormInput) => {
    const parsed: SupportFormValues = SupportFormSchema.parse(values);
    const msgLen = (parsed.message ?? "").trim().length;

    if (msgLen < 50 && !warnedShortOnce) {
      setWarnedShortOnce(true);
      return;
    }

    // Sev-1 pages the on-call team — require explicit confirmation before
    // submitting. The dialog's confirm action calls `submitForm` directly.
    if (parsed.severity === SEVERITY_1) {
      setSev1ConfirmOpen(true);
      return;
    }

    await submitForm(values);
  };

  const submitForm = async (values: SupportFormInput) => {
    try {
      // Parse inside the try so a failure surfaces via form.setError below
      // instead of escaping as an unhandled rejection (the confirm dialog
      // calls this outside react-hook-form's handleSubmit).
      const parsed: SupportFormValues = SupportFormSchema.parse(values);

      setIsSubmittingLocal(true);

      // Validate files using centralized validation function
      const validation = validateFiles(files);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const status = await onSubmit(parsed, files ?? []);
      if (status === "kept") {
        return;
      }

      form.reset({
        messageType: "Question",
        severity: SEVERITY_3,
        topic: "",
        message: "",
      });
      setWarnedShortOnce(false);
      setFiles(undefined);
      onSuccess();
    } catch (err: unknown) {
      reportNonTrpcError(err, "support");
      form.setError("message", {
        type: "manual",
        message:
          err instanceof Error
            ? err.message
            : "Failed to submit support request.",
      });
    } finally {
      setIsSubmittingLocal(false);
    }
  };

  const messageIsShortAfterWarning =
    warnedShortOnce && (form.getValues("message") ?? "").trim().length < 50;

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
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
                  <div className="grid grid-cols-3 gap-2">
                    {MESSAGE_TYPES.map((v) => (
                      <Button
                        key={v}
                        variant={field.value === v ? "default" : "outline"}
                        className="flex w-full items-center gap-2 text-sm font-normal"
                        size="default"
                        onClick={() => field.onChange(v)}
                      >
                        <span className="truncate" title={v}>
                          {v}
                        </span>
                      </Button>
                    ))}
                  </div>
                </FormControl>
                <FormDescription className="sr-only">
                  Choose the type of your message.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Priority (maps to Pylon case_severity). Severity 1 and 2 are
              gated to Enterprise plans. */}
          <FormField
            control={form.control}
            name="severity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) =>
                        isSeveritySelectable(s, canSelectHighSeverity) ? (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ) : (
                          // disableHoverableContent: without it, the grace
                          // area between item and tooltip swallows the hover
                          // when moving between the two adjacent gated items.
                          <Tooltip key={s} disableHoverableContent>
                            {/* Disabled items are pointer-events-none, so the
                                wrapper div must catch the hover instead. */}
                            <TooltipTrigger asChild>
                              <div>
                                <SelectItem value={s} disabled>
                                  {s}
                                </SelectItem>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {s === SEVERITY_1
                                ? "Severity 1 is available on the Enterprise plan."
                                : "Severity 2 is available on the Enterprise plan."}
                            </TooltipContent>
                          </Tooltip>
                        ),
                      )}
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
                        <div className="text-muted-foreground mb-2 text-xs font-bold">
                          Product Features
                        </div>
                        {productFeatureTopics.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </div>
                      <div className="border-t p-2">
                        <div className="text-muted-foreground mb-2 text-xs font-bold">
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
                <div className="text-muted-foreground text-xs">
                  We will email you at your account address. Replies may take up
                  to one business day.
                </div>
                <FormControl>
                  <div className="relative w-full">
                    <Textarea
                      {...field}
                      rows={8}
                      placeholder={
                        isProductFeatureTopic
                          ? "Please explain as fully as possible what you're aiming to do, and what you'd like help with.\n\nIf your question involves a specific trace, prompt, score, etc. please include a link to it."
                          : "Please explain as fully as possible what you're aiming to do, and what you'd like help with."
                      }
                    />
                  </div>
                </FormControl>

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

                <div className="mt-1">
                  <Dropzone
                    accept={undefined}
                    isDisabled={false}
                    maxFiles={FILE_UPLOAD_CONSTRAINTS.maxFiles}
                    maxSize={FILE_UPLOAD_CONSTRAINTS.maxFileSizeBytes}
                    minSize={undefined}
                    onDrop={(accepted) =>
                      setFiles((prev) => {
                        const existing = prev ?? [];
                        const merged = [...existing, ...accepted];
                        const maxFiles = FILE_UPLOAD_CONSTRAINTS.maxFiles;
                        return merged.slice(0, maxFiles);
                      })
                    }
                    onError={(error) => {
                      onFileError(formatFileError(error));
                    }}
                    src={files}
                    variant="compact"
                  />
                </div>

                {files && files.length > 0 && (
                  <div className="p-0 text-left text-sm font-bold">
                    <div className="text-muted-foreground mb-2 text-xs font-bold">
                      Attached files
                    </div>
                    {files?.map((file) => (
                      <div
                        key={file.name}
                        className="flex flex-row items-center justify-start gap-2 text-xs"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() =>
                            setFiles(files.filter((f) => f.name !== file.name))
                          }
                          className="p-0"
                        >
                          <span className="sr-only">Remove file</span>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {file.name}
                      </div>
                    ))}
                  </div>
                )}
              </FormItem>
            )}
          />

          {/* Actions */}
          <div className="flex flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setWarnedShortOnce(false);
                setFiles(undefined);
                onCancel();
              }}
              className="w-full"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={isSubmittingLocal}
              className="w-full"
            >
              {isSubmittingLocal ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  Submitting…
                </span>
              ) : messageIsShortAfterWarning ? (
                "Submit Anyways"
              ) : (
                "Submit"
              )}
            </Button>
          </div>

          {isSubmittingLocal && (
            <div className="text-muted-foreground text-xs">
              This can take a few seconds — hang tight while we submit your
              request.
            </div>
          )}
        </form>
      </Form>

      {/* Confirmation gate before a Sev-1 request pages the on-call team. */}
      <AlertDialog open={sev1ConfirmOpen} onOpenChange={setSev1ConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm Severity 1 (Critical Business Impact)
            </AlertDialogTitle>
            <AlertDialogDescription>
              Please confirm that your issue has critical business impact. This
              means it severely impacts your use of Langfuse in production, such
              as loss of production data, ingestion issues, or prompt fetching
              issues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => submitForm(form.getValues())}>
              Confirm &amp; Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

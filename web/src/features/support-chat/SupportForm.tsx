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
  createSupportFormSchema,
  type SupportFormSchema,
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
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Textarea } from "@/src/components/ui/textarea";
import { useEffect, useMemo, useState } from "react";

import { Dropzone } from "@/src/components/design-system/Dropzone/Dropzone";
import { Trash2 } from "lucide-react";
import { PYLON_MAX_FILE_SIZE_BYTES } from "./pylon/pylonConstants";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { useTranslations } from "next-intl";

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
function validateFiles(
  files: File[] | undefined,
  messages: {
    tooMany: (maxFiles: number) => string;
    tooLarge: (fileName: string, maxMB: string) => string;
    combinedTooLarge: (totalMB: string, maxMB: string) => string;
  },
): {
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
      error: messages.tooMany(maxFiles),
    };
  }

  // Check individual file sizes
  const oversizedFile = files.find((f) => f.size > maxFileSizeBytes);
  if (oversizedFile) {
    const maxMB = (maxFileSizeBytes / (1024 * 1024)).toFixed(0);
    return {
      isValid: false,
      error: messages.tooLarge(oversizedFile.name, maxMB),
    };
  }

  // Check combined size
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > maxCombinedBytes) {
    const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
    const maxMB = (maxCombinedBytes / (1024 * 1024)).toFixed(0);
    return {
      isValid: false,
      error: messages.combinedTooLarge(totalMB, maxMB),
    };
  }

  return { isValid: true };
}

/**
 * Converts technical file error messages to user-friendly ones
 */
function formatFileError(
  error: Error,
  messages: {
    tooLarge: (maxMB: string) => string;
    tooMany: (maxFiles: number) => string;
    combinedTooLarge: (maxMB: string) => string;
    unsupported: string;
    uploadFailed: string;
  },
): string {
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
    return messages.tooLarge(maxMB);
  }

  // File count errors
  if (
    msg.includes("too many") ||
    msg.includes("maxfiles") ||
    msg.includes("5 files")
  ) {
    return messages.tooMany(maxFiles);
  }

  // Combined size errors
  if (msg.includes("total") && (msg.includes("50mb") || msg.includes("size"))) {
    return messages.combinedTooLarge(maxCombinedMB);
  }

  // File type errors
  if (msg.includes("file type") || msg.includes("accept")) {
    return messages.unsupported;
  }

  return error.message || messages.uploadFailed;
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
  const t = useTranslations("sharedUi.support");
  const supportFormSchema = useMemo(
    () =>
      createSupportFormSchema({
        topicRequired: t("topicRequired"),
        descriptionRequired: t("descriptionRequired"),
      }),
    [t],
  );
  const messageTypeLabels: Record<string, string> = {
    Question: t("messageTypes.question"),
    Feedback: t("messageTypes.feedback"),
    Bug: t("messageTypes.bug"),
  };
  const severityLabels: Record<string, string> = {
    [SEVERITIES[0]]: t("severities.critical"),
    [SEVERITIES[1]]: t("severities.major"),
    [SEVERITIES[2]]: t("severities.minor"),
  };
  const topicLabels: Record<string, string> = {
    "Account Changes": t("topics.accountChanges"),
    "Account Deletion": t("topics.accountDeletion"),
    "Billing / Usage": t("topics.billingUsage"),
    "Inviting Users": t("topics.invitingUsers"),
    "Set Up SSO": t("topics.setupSso"),
    "Slack Connect Channel": t("topics.slackChannel"),
    Observability: t("topics.observability"),
    "Prompt Management": t("topics.promptManagement"),
    Evaluation: t("topics.evaluation"),
    Platform: t("topics.platform"),
    "V4 Migration": t("topics.v4Migration"),
    Other: t("topics.other"),
  };

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
    resolver: zodResolver(supportFormSchema),
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
    const parsed: SupportFormValues = supportFormSchema.parse(values);
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
      const parsed: SupportFormValues = supportFormSchema.parse(values);

      setIsSubmittingLocal(true);

      // Validate files using centralized validation function
      const validation = validateFiles(files, {
        tooMany: (maxFiles) => t("maxFiles", { maxFiles }),
        tooLarge: (fileName, maxMB) =>
          t("namedFileTooLarge", { fileName, maxMB }),
        combinedTooLarge: (totalMB, maxMB) =>
          t("combinedFilesTooLarge", { totalMB, maxMB }),
      });
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
        message: err instanceof Error ? err.message : t("submitFailed"),
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
                <FormLabel>{t("messageType")}</FormLabel>
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
                          {messageTypeLabels[v] ?? v}
                        </span>
                      </Button>
                    ))}
                  </div>
                </FormControl>
                <FormDescription className="sr-only">
                  {t("chooseMessageType")}
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
                <FormLabel>{t("priority")}</FormLabel>
                <FormControl>
                  <SelectInput
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder={t("selectPriority")}
                    options={SEVERITIES.map((severity) => {
                      if (
                        isSeveritySelectable(severity, canSelectHighSeverity)
                      ) {
                        return {
                          value: severity,
                          label: severityLabels[severity] ?? severity,
                        };
                      }

                      return {
                        value: severity,
                        label: severityLabels[severity] ?? severity,
                        disabled: true as const,
                        disabledReason:
                          severity === SEVERITY_1
                            ? t("severityOnePlan")
                            : t("severityTwoPlan"),
                      };
                    })}
                  />
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
                <FormLabel>{t("topic")}</FormLabel>
                <FormControl>
                  <SelectInput
                    value={field.value ?? undefined}
                    onValueChange={field.onChange}
                    placeholder={t("selectTopic")}
                    options={[
                      {
                        type: "group",
                        id: "product-features",
                        label: t("productFeatures"),
                        options: productFeatureTopics.map((topic) => ({
                          value: topic,
                          label: topicLabels[topic] ?? topic,
                        })),
                      },
                      {
                        type: "group",
                        id: "operations",
                        label: t("operations"),
                        options: TopicGroups.Operations.map((topic) => ({
                          value: topic,
                          label: topicLabels[topic] ?? topic,
                        })),
                      },
                    ]}
                  />
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
                  <FormLabel>{t("integrationType")}</FormLabel>
                  <FormControl>
                    <SelectInput
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      placeholder={t("selectIntegrationType")}
                      options={INTEGRATION_TYPES.map((integrationType) => ({
                        value: integrationType,
                        label: integrationType,
                      }))}
                    />
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
                <FormLabel>{t("message")}</FormLabel>
                <div className="text-muted-foreground text-xs">
                  {t("emailNotice")}
                </div>
                <FormControl>
                  <div className="relative w-full">
                    <Textarea
                      {...field}
                      rows={8}
                      placeholder={
                        isProductFeatureTopic
                          ? t("messagePlaceholderWithLink")
                          : t("messagePlaceholder")
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
                    {t("shortMessage")}
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
                      onFileError(
                        formatFileError(error, {
                          tooLarge: (maxMB) => t("fileTooLarge", { maxMB }),
                          tooMany: (maxFiles) =>
                            t("tooManyFiles", { maxFiles }),
                          combinedTooLarge: (maxMB) =>
                            t("combinedSizeTooLarge", { maxMB }),
                          unsupported: t("unsupportedFileType"),
                          uploadFailed: t("uploadFailed"),
                        }),
                      );
                    }}
                    src={files}
                    variant="compact"
                  />
                </div>

                {files && files.length > 0 && (
                  <div className="p-0 text-left text-sm font-bold">
                    <div className="text-muted-foreground mb-2 text-xs font-bold">
                      {t("attachedFiles")}
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
                          <span className="sr-only">{t("removeFile")}</span>
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
              {t("cancel")}
            </Button>

            <Button
              type="submit"
              disabled={isSubmittingLocal}
              className="w-full"
            >
              {isSubmittingLocal ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  {t("submitting")}
                </span>
              ) : messageIsShortAfterWarning ? (
                t("submitAnyway")
              ) : (
                t("submit")
              )}
            </Button>
          </div>

          {isSubmittingLocal && (
            <div className="text-muted-foreground text-xs">
              {t("submittingNotice")}
            </div>
          )}
        </form>
      </Form>

      {/* Confirmation gate before a Sev-1 request pages the on-call team. */}
      <AlertDialog open={sev1ConfirmOpen} onOpenChange={setSev1ConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmSeverityOne")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmSeverityOneDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => submitForm(form.getValues())}>
              {t("confirmSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

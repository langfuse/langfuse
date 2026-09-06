"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type z } from "zod";
import {
  MESSAGE_TYPES,
  SEVERITIES,
  SEVERITY_1,
  SEVERITY_3,
  INTEGRATION_TYPES,
  TopicGroups,
  type MessageType,
  createSupportFormSchema,
  type SupportFormSchema,
  isSeverityAllowedForPlan,
} from "./formConstants";

import { api, reportNonTrpcError } from "@/src/utils/api";

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
import { RadioGroup } from "@/src/components/ui/radio-group";
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
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useEffect, useMemo, useState } from "react";

import { Dropzone } from "@/src/components/design-system/Dropzone/Dropzone";
import { Trash2 } from "lucide-react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { PYLON_MAX_FILE_SIZE_BYTES } from "./pylon/pylonConstants";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useTranslations } from "next-intl";

/** Make RHF generics match the resolver (Zod defaults => input can be undefined) */
type SupportFormInput = z.input<typeof SupportFormSchema>;
type SupportFormValues = z.output<typeof SupportFormSchema>;

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

export function SupportFormSection({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const t = useTranslations("sharedUi.support");
  const supportFormSchema = useMemo(
    () =>
      createSupportFormSchema({
        topicRequired: t("topicRequired"),
        descriptionRequired: t("descriptionRequired"),
      }),
    [t],
  );
  const { organization, project } = useQueryProjectOrOrganization();
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

  // The support drawer is mounted globally and reachable from pages without an
  // org/project in the URL (home, setup, onboarding, account settings), where
  // `organization` is null. Without an org context the plan is unknown, so
  // Severity 1/2 are gated there. The server applies the same rule.
  const effectivePlan = organization?.plan;

  // Tracks whether we've already warned about a short message
  const [warnedShortOnce, setWarnedShortOnce] = useState(false);

  // Local file state from Dropzone
  const [files, setFiles] = useState<File[] | undefined>(undefined);

  // Local submit guard to avoid flicker across multiple mutations
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  // Sev-1 pages the on-call team, so submission requires an explicit
  // confirmation step.
  const [sev1ConfirmOpen, setSev1ConfirmOpen] = useState(false);

  const { initialTopic } = useSupportDrawer();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(project?.id);
  const productFeatureTopics = TopicGroups["Product Features"].filter(
    (topic) => topic !== "V4 Migration" || v4UpgradeUiEnabled,
  );

  const form = useForm<SupportFormInput>({
    resolver: zodResolver(supportFormSchema),
    defaultValues: {
      messageType: "Question" as MessageType,
      severity: SEVERITY_3,
      topic: initialTopic ?? "",
      message: "",
      integrationType: "",
    },
    mode: "onSubmit",
  });

  const selectedTopic = form.watch("topic");
  const isProductFeatureTopic = TopicGroups["Product Features"].includes(
    selectedTopic as any,
  );

  // The drawer is globally mounted, so a severity selected under one org's
  // plan can survive navigation to an org (or no-org page) that no longer
  // allows it. Snap back to Severity 3 so the visible selection, the Sev-1
  // confirm dialog, and the submitted value stay consistent with the plan.
  const selectedSeverity = form.watch("severity");
  useEffect(() => {
    if (
      selectedSeverity &&
      !isSeverityAllowedForPlan(selectedSeverity, effectivePlan)
    ) {
      form.setValue("severity", SEVERITY_3);
    }
  }, [selectedSeverity, effectivePlan, form]);

  const createSupportThread = api.supportRouter.createSupportThread.useMutation(
    {
      onSuccess: (data) => {
        // Pylon is the only destination, so a failed issue means no ticket
        // exists anywhere. Keep the form state (message, topic, severity,
        // attachments) intact so the user can retry instead of wiping it.
        if (data.pylonIssueFailed) {
          showErrorToast(t("requestNotSent"), t("contactSupport"));
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
      },
      onSettled: () => setIsSubmittingLocal(false),
    },
  );

  async function uploadFilesToPylon(filesToUpload: File[]): Promise<string[]> {
    const filePayloads = await Promise.all(
      filesToUpload.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            "",
          ),
        );
        return { fileName: file.name, fileBase64: base64 };
      }),
    );

    const res = await fetch("/api/support/upload-attachments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: filePayloads }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? t("uploadAttachmentsFailed"),
      );
    }

    const body = (await res.json()) as { attachment_urls: string[] };
    return body.attachment_urls;
  }

  const onSubmit = async (values: SupportFormInput) => {
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

      // 1) Upload attachments to Pylon. This is the only attachment path, so
      // do NOT swallow failures: let them propagate to the outer catch (which
      // surfaces the error via form.setError) instead of silently dropping the
      // user's files while still creating the thread.
      let pylonAttachmentUrls: string[] = [];
      if (files && files.length) {
        pylonAttachmentUrls = await uploadFilesToPylon(files);
      }

      // 2) Create the support thread in Pylon
      await createSupportThread.mutateAsync({
        messageType: parsed.messageType,
        severity: parsed.severity,
        topic: parsed.topic as any,
        integrationType: parsed.integrationType,
        message: parsed.message,
        url: window.location.href,
        organizationId: organization?.id,
        projectId: project?.id,
        browserMetadata: {
          userAgent: navigator.userAgent,
          platform:
            (
              navigator as Navigator & {
                userAgentData?: { platform?: string };
              }
            ).userAgentData?.platform ?? undefined,
          language: navigator.language,
          viewport: { w: window.innerWidth, h: window.innerHeight },
        },
        pylonAttachmentUrls,
      });
    } catch (err: any) {
      reportNonTrpcError(err, "support");
      setIsSubmittingLocal(false);
      form.setError("message", {
        type: "manual",
        message: err?.message ?? t("submitFailed"),
      });
    }
  };

  const messageIsShortAfterWarning =
    warnedShortOnce && (form.getValues("message") ?? "").trim().length < 50;

  return (
    <div className="mt-1 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-base font-bold">
        {t("formTitle")}
      </div>
      <p className="text-muted-foreground text-sm">{t("formDescription")}</p>

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
                <FormLabel>{t("messageType")}</FormLabel>
                <FormControl>
                  <RadioGroup
                    className="grid grid-cols-3 gap-2"
                    value={field.value ?? "Question"}
                    onValueChange={field.onChange}
                  >
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
                  </RadioGroup>
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
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectPriority")} />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITIES.map((s) =>
                        isSeverityAllowedForPlan(s, effectivePlan) ? (
                          <SelectItem key={s} value={s}>
                            {severityLabels[s] ?? s}
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
                                  {severityLabels[s] ?? s}
                                </SelectItem>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {s === SEVERITY_1
                                ? t("severityOnePlan")
                                : t("severityTwoPlan")}
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
                <FormLabel>{t("topic")}</FormLabel>
                <FormControl>
                  <Select
                    value={(field.value as string | undefined) ?? undefined}
                    onValueChange={field.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectTopic")} />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2">
                        <div className="text-muted-foreground mb-2 text-xs font-bold">
                          {t("productFeatures")}
                        </div>
                        {productFeatureTopics.map((t) => (
                          <SelectItem key={t} value={t}>
                            {topicLabels[t] ?? t}
                          </SelectItem>
                        ))}
                      </div>
                      <div className="border-t p-2">
                        <div className="text-muted-foreground mb-2 text-xs font-bold">
                          {t("operations")}
                        </div>
                        {TopicGroups.Operations.map((t) => (
                          <SelectItem key={t} value={t}>
                            {topicLabels[t] ?? t}
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
                  <FormLabel>{t("integrationType")}</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("selectIntegrationType")} />
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
                      const userMessage = formatFileError(error, {
                        tooLarge: (maxMB) => t("fileTooLarge", { maxMB }),
                        tooMany: (maxFiles) => t("tooManyFiles", { maxFiles }),
                        combinedTooLarge: (maxMB) =>
                          t("combinedSizeTooLarge", { maxMB }),
                        unsupported: t("unsupportedFileType"),
                        uploadFailed: t("uploadFailed"),
                      });
                      showErrorToast(
                        t("fileUploadError"),
                        userMessage,
                        "WARNING",
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
    </div>
  );
}

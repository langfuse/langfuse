"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { type z } from "zod";
import {
  MESSAGE_TYPES,
  SEVERITIES,
  INTEGRATION_TYPES,
  TopicGroups,
  type MessageType,
  SupportFormSchema,
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
import { RadioGroup } from "@/src/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useMemo, useState } from "react";

import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/src/components/ui/shadcn-io/dropzone";
import { Paperclip, Loader2, Trash2 } from "lucide-react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { PLAIN_MAX_FILE_SIZE_BYTES } from "./plain/plainConstants";

/** Make RHF generics match the resolver (Zod defaults => input can be undefined) */
type SupportFormInput = z.input<typeof SupportFormSchema>;
type SupportFormValues = z.output<typeof SupportFormSchema>;

/**
 * File upload constraints - single source of truth for validation
 * Uses Plain API's file size limit
 */
const FILE_UPLOAD_CONSTRAINTS = {
  maxFiles: 5,
  maxFileSizeBytes: PLAIN_MAX_FILE_SIZE_BYTES, // 6MB (Plain API limit)
  maxCombinedBytes: 50 * 1024 * 1024, // 50MB
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

export function SupportFormSection({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { organization, project } = useQueryProjectOrOrganization();

  // Tracks whether we've already warned about a short message
  const [warnedShortOnce, setWarnedShortOnce] = useState(false);

  // Local file state from Dropzone
  const [files, setFiles] = useState<File[] | undefined>(undefined);
  const totalUploadBytes = useMemo(
    () => (files ?? []).reduce((sum, f) => sum + f.size, 0),
    [files],
  );

  // Local submit guard to avoid flicker across multiple mutations
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const form = useForm<SupportFormInput>({
    resolver: zodResolver(SupportFormSchema),
    defaultValues: {
      messageType: "Question" as MessageType,
      severity: "Question or feature request",
      topic: "",
      message: "",
      integrationType: "",
    },
    mode: "onSubmit",
  });

  const selectedTopic = form.watch("topic");
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
      setFiles(undefined);
      onSuccess();
    },
    onSettled: () => setIsSubmittingLocal(false),
  });

  const prepareUploads = api.plainRouter.prepareAttachmentUploads.useMutation({
    onError: (error) => {
      setIsSubmittingLocal(false);
      showErrorToast(
        "Upload Preparation Failed",
        error.message || "Failed to prepare file uploads. Please try again.",
        "ERROR",
      );
    },
  });

  async function uploadToPlainS3(
    uploadFormUrl: string,
    uploadFormData: { key: string; value: string }[],
    file: File,
  ) {
    const form = new FormData();
    uploadFormData.forEach(({ key, value }) => form.append(key, value));
    form.append("file", file, file.name);
    const res = await fetch(uploadFormUrl, { method: "POST", body: form });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Attachment upload failed (${res.status} ${res.statusText}) ${text}`,
      );
    }
  }

  const onSubmit = async (values: SupportFormInput) => {
    const parsed: SupportFormValues = SupportFormSchema.parse(values);
    const msgLen = (parsed.message ?? "").trim().length;

    if (msgLen < 50 && !warnedShortOnce) {
      setWarnedShortOnce(true);
      return;
    }

    try {
      setIsSubmittingLocal(true);

      // Validate files using centralized validation function
      const validation = validateFiles(files);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // 1) Request presigned S3 upload forms
      const uploadPlans =
        files && files.length
          ? await prepareUploads.mutateAsync({
              files: files.map((f) => ({
                fileName: f.name,
                fileSizeBytes: f.size,
              })),
            })
          : {
              uploads: [] as any[],
              customerId: undefined as string | undefined,
            };

      // 2) Upload blobs
      if (files && files.length) {
        await Promise.all(
          files.map(async (file, idx) => {
            const plan = uploadPlans.uploads[idx];
            if (!plan) throw new Error("Missing upload plan for a file.");
            await uploadToPlainS3(
              plan.uploadFormUrl,
              plan.uploadFormData,
              file,
            );
          }),
        );
      }

      // 3) Create thread with attachmentIds
      const attachmentIds =
        uploadPlans.uploads?.map((u: any) => u.attachmentId) ?? [];

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
          platform: navigator.platform,
          language: navigator.language,
          viewport: { w: window.innerWidth, h: window.innerHeight },
        },
        attachmentIds,
      });
    } catch (err: any) {
      console.error(err);
      setIsSubmittingLocal(false);
      form.setError("message", {
        type: "manual",
        message: err?.message ?? "Failed to submit support request.",
      });
    }
  };

  const messageIsShortAfterWarning =
    warnedShortOnce && (form.getValues("message") ?? "").trim().length < 50;

  // --- Compact attachment row helpers
  const totalMB = (totalUploadBytes / (1024 * 1024)).toFixed(2);
  const hasFiles = (files?.length ?? 0) > 0;

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
                      <Button
                        key={v}
                        variant={field.value === v ? "default" : "outline"}
                        className="flex w-full items-center gap-2 text-sm font-normal"
                        size="default"
                        onClick={() => field.onChange(v)}
                      >
                        <span className="truncate">{v}</span>
                      </Button>
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
                          Product Features
                        </div>
                        {TopicGroups["Product Features"].map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </div>
                      <div className="border-t p-2">
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

                <Dropzone
                  className="mt-1 border-none p-0 text-left"
                  maxFiles={FILE_UPLOAD_CONSTRAINTS.maxFiles}
                  maxSize={FILE_UPLOAD_CONSTRAINTS.maxFileSizeBytes}
                  onDrop={(accepted) => setFiles(accepted)}
                  onError={(error) => {
                    const userMessage = formatFileError(error);
                    showErrorToast("File Upload Error", userMessage, "WARNING");
                  }}
                  src={files}
                >
                  {/* Small, single-line trigger */}
                  <DropzoneEmptyState>
                    <div className="flex w-full cursor-pointer items-center justify-start gap-2 p-2 text-xs">
                      <Paperclip className="h-4 w-4" />
                      <span className="truncate">
                        {hasFiles
                          ? `${files!.length} file${files!.length > 1 ? "s" : ""} • ${totalMB} MB`
                          : "Attach files"}
                      </span>
                    </div>
                  </DropzoneEmptyState>
                  {/* Keep content area minimal; we still allow preview slot if needed */}
                  <DropzoneContent>
                    <div className="flex w-full cursor-pointer items-center justify-start gap-2 p-2 text-xs">
                      <Paperclip className="h-4 w-4" />
                      <span className="truncate">Attach files</span>
                    </div>
                  </DropzoneContent>
                </Dropzone>

                {files && files.length > 0 && (
                  <div className="p-0 text-left text-sm font-medium">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
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
                  <Loader2 className="h-4 w-4 animate-spin" />
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
            <div className="text-xs text-muted-foreground">
              This can take a few seconds — hang tight while we submit your
              request.
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}

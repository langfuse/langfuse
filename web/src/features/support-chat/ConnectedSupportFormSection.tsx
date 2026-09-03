"use client";

import { api } from "@/src/utils/api";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { showErrorToast } from "@/src/features/notifications";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { isEnterpriseSupportPlan } from "./formConstants";
import {
  SupportForm,
  type SupportFormSubmitStatus,
  type SupportFormValues,
} from "./SupportForm";

export function ConnectedSupportFormSection({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { organization, project } = useQueryProjectOrOrganization();
  const { initialTopic } = useSupportDrawer();
  const showV4MigrationTopic = useV4UpgradeUiEnabled(project?.id);
  // The support drawer is mounted globally and reachable from pages without an
  // org/project in the URL (home, setup, onboarding, account settings), where
  // `organization` is null. Without an org context the plan is unknown, so
  // Severity 1/2 are gated there. The server applies the same rule.
  const canSelectHighSeverity = isEnterpriseSupportPlan(organization?.plan);

  const createSupportThread =
    api.supportRouter.createSupportThread.useMutation();

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
        (body as { error?: string }).error ??
          "Failed to upload attachments to Pylon.",
      );
    }

    const body = (await res.json()) as { attachment_urls: string[] };
    return body.attachment_urls;
  }

  const handleSubmit = async (
    values: SupportFormValues,
    files: File[],
  ): Promise<SupportFormSubmitStatus> => {
    // Upload attachments to Pylon. This is the only attachment path, so
    // do NOT swallow failures: let them propagate to SupportForm
    // (which surfaces the error via form.setError) instead of silently
    // dropping the user's files while still creating the thread.
    let pylonAttachmentUrls: string[] = [];
    if (files.length) {
      pylonAttachmentUrls = await uploadFilesToPylon(files);
    }

    const data = await createSupportThread.mutateAsync({
      messageType: values.messageType,
      severity: values.severity,
      topic: values.topic,
      integrationType: values.integrationType,
      message: values.message,
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

    // Pylon is the only destination, so a failed issue means no ticket
    // exists anywhere. Keep the form state (message, topic, severity,
    // attachments) intact so the user can retry instead of wiping it.
    if (data.pylonIssueFailed) {
      showErrorToast(
        "Support request was not sent",
        "Please contact support@langfuse.com",
      );
      return "kept";
    }

    return "success";
  };

  return (
    <div className="mt-1 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-base font-bold">
        E-Mail a Support Engineer
      </div>
      <p className="text-muted-foreground text-sm">
        Details speed things up. The clearer your request, the quicker you get
        the answer you need.
      </p>
      <SupportForm
        canSelectHighSeverity={canSelectHighSeverity}
        initialTopic={initialTopic ?? ""}
        showV4MigrationTopic={showV4MigrationTopic}
        onCancel={onCancel}
        onSuccess={onSuccess}
        onSubmit={handleSubmit}
        onFileError={(message) =>
          showErrorToast("File Upload Error", message, "WARNING")
        }
      />
    </div>
  );
}

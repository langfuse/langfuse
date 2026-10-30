import type * as z from "zod";
import { useSession } from "next-auth/react";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import type { organizationFormSchema } from "@/src/features/organizations/utils/organizationNameSchema";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
import { NewOrganizationForm } from "./NewOrganizationForm";

export function ConnectedNewOrganizationForm({
  onSuccess,
}: {
  onSuccess: (orgId: string, sessionRefreshed: boolean) => void | Promise<void>;
}) {
  const { update: updateSession } = useSession();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const capture = usePostHogClientCapture();
  const createOrgMutation = api.organizations.create.useMutation();

  async function handleSubmit(values: z.infer<typeof organizationFormSchema>) {
    capture("organizations:new_form_submit");

    const organization = await createOrgMutation
      .mutateAsync(values)
      .catch((error) => {
        reportTrpcErrorWithoutToast(error, "organizations");
        throw error;
      });

    let sessionRefreshed = true;
    try {
      await updateSession();
    } catch (error) {
      sessionRefreshed = false;
      reportTrpcErrorWithoutToast(error, "organizations");
    }

    await onSuccess(organization.id, sessionRefreshed);
  }

  return (
    <NewOrganizationForm
      isLangfuseCloud={isLangfuseCloud}
      onSubmit={handleSubmit}
    />
  );
}

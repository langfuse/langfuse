import { Button } from "@/src/components/ui/button";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const StripeCustomerPortalButton = ({
  orgId,
  title,
  variant,
}: {
  orgId: string | undefined;
  title: string;
  variant: "secondary" | "default";
}) => {
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "langfuseCloudBilling:CRUD",
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Make sure loading is always false when the user enters the page, even when navigation back via browser back button
    const reset = () => setLoading(false);
    const onPageShow = () => setLoading(false); // fires on bfcache restore
    const onVisibility = () => {
      if (document.visibilityState === "visible") setLoading(false);
    };

    window.addEventListener("focus", reset);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", reset);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const portalQuery = api.cloudBilling.getStripeCustomerPortalUrl.useQuery(
    { orgId: orgId as string },
    {
      enabled: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  );

  const onClick = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const { data, error } = await portalQuery.refetch();
      if (error) throw error;
      if (data) {
        window.location.href = data;
      } else {
        toast.error("Could not open billing portal");
      }
    } catch (_e) {
      toast.error("Failed to open billing portal");
    } finally {
      // do not reset to avoid flickering when opening the portal
      // setLoading(false);
    }
  };

  if (!hasAccess) {
    return null;
  }

  return (
    <Button
      variant={variant}
      onClick={onClick}
      disabled={!orgId || loading}
      title={title}
    >
      {loading ? "Opening…" : title}
    </Button>
  );
};

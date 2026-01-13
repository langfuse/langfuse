import { useState } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import Header from "@/src/components/layouts/header";
import { Card, CardContent } from "@/src/components/ui/card";
import { Label } from "@/src/components/ui/label";
import { Switch } from "@/src/components/ui/switch";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export function NotificationSettings() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [isSaving, setIsSaving] = useState(false);

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "project:read",
  });

  const {
    data: preferences,
    isLoading,
    refetch,
  } = api.notificationPreferences.getForProject.useQuery(
    { projectId },
    { enabled: Boolean(projectId) },
  );

  const updatePreference = api.notificationPreferences.update.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleToggle = async (enabled: boolean) => {
    setIsSaving(true);
    await updatePreference.mutateAsync({
      projectId,
      channel: "EMAIL",
      type: "COMMENT_MENTION",
      enabled,
    });
    setIsSaving(false);
  };

  if (isLoading || !preferences) {
    return (
      <div>
        <Header title="Notification Settings" />
        <Card className="mt-4">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              Loading preferences...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const emailCommentMention = preferences.find(
    (p) => p.channel === "EMAIL" && p.type === "COMMENT_MENTION",
  );

  return (
    <div>
      <Header title="Notification Settings" />
      <Card className="mt-4">
        <CardContent className="space-y-6 p-6">
          <div>
            <h3 className="text-lg font-medium">Email Notifications</h3>
            <p className="text-sm text-muted-foreground">
              Manage your email notification preferences for this project.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="comment-mention" className="text-base">
                  Comment Mentions
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive an email when someone mentions you in a comment
                </p>
              </div>
              <Switch
                id="comment-mention"
                checked={emailCommentMention?.enabled ?? true}
                onCheckedChange={handleToggle}
                disabled={isSaving || !hasAccess}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {updatePreference.isError && (
        <div className="mt-4 rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Failed to update notification preference. Please try again.
          </p>
        </div>
      )}
    </div>
  );
}

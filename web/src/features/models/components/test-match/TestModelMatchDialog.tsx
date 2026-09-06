import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { UsageDetailsEditor } from "./UsageDetailsEditor";
import { StringMapEditor } from "./StringMapEditor";
import { MatchedModelCard } from "./MatchedModelCard";
import { MatchedTierCard } from "./MatchedTierCard";
import { NoMatchDisplay } from "./NoMatchDisplay";
import { CheckCircle, SquareArrowOutUpRight } from "lucide-react";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { useTranslations } from "next-intl";

type TestModelMatchDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type { TestModelMatchDialogProps };

const validStringMap = (entries: Array<[string, string]>) =>
  Object.fromEntries(entries.filter(([key]) => key.trim().length > 0));

export function TestModelMatchDialog({
  projectId,
  open,
  onOpenChange,
}: TestModelMatchDialogProps) {
  const t = useTranslations("settingsEnterprise.models");
  const [modelName, setModelName] = useState("");
  const [usageDetails, setUsageDetails] = useState<Record<string, number>>({});
  const [modelParameterEntries, setModelParameterEntries] = useState<
    Array<[string, string]>
  >([]);
  const [metadataEntries, setMetadataEntries] = useState<
    Array<[string, string]>
  >([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const modelParameters = validStringMap(modelParameterEntries);
  const metadata = validStringMap(metadataEntries);

  // Query for match result - only enabled after submit
  const { data, isLoading, error, refetch } = api.models.testMatch.useQuery(
    {
      projectId,
      modelName,
      usageDetails,
      modelParameters,
      metadata,
    },
    {
      enabled: false, // Manual trigger only
    },
  );

  // Handle form submission
  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (modelName.trim()) {
      setHasSubmitted(true);
      refetch();
    }
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setModelName("");
      setUsageDetails({});
      setModelParameterEntries([]);
      setMetadataEntries([]);
      setHasSubmitted(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="min-h-[62vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{t("testMatch.title")}</DialogTitle>
            <DialogDescription className="mt-1">
              {t("testMatch.description")}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="grid grid-cols-[1fr_1px_1fr] gap-6">
            {/* Left Column: Input Form */}
            <div className="flex flex-col justify-between space-y-6">
              <div className="space-y-6">
                {/* Model Name Input */}
                <div className="space-y-2">
                  <div className="text-sm font-bold">
                    {t("testMatch.modelNameRequired")}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {t("testMatch.modelNameDescription")}
                  </div>
                  <Input
                    placeholder={t("testMatch.modelNamePlaceholder")}
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value.trim())}
                    autoFocus
                    required
                  />
                </div>

                {/* Usage Details Editor */}
                <UsageDetailsEditor
                  usageDetails={usageDetails}
                  onChange={setUsageDetails}
                />

                <StringMapEditor
                  title={t("common.modelParameters")}
                  description={t("testMatch.modelParametersDescription")}
                  entries={modelParameterEntries}
                  onChange={setModelParameterEntries}
                />

                <StringMapEditor
                  title={t("common.metadata")}
                  description={t("testMatch.metadataDescription")}
                  entries={metadataEntries}
                  onChange={setMetadataEntries}
                />
              </div>

              {/* Buttons at bottom of left column */}
              <div className="flex gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  {t("common.close")}
                </Button>
                <Button
                  type="submit"
                  disabled={!modelName.trim() || isLoading}
                  className="flex-1"
                >
                  {t("testMatch.test")}
                </Button>
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="bg-border" />

            {/* Right Column: Results Panel */}
            <div className="flex flex-col justify-between">
              <div className="space-y-4 overflow-y-auto pb-4">
                {hasSubmitted && (
                  <>
                    {isLoading && (
                      <div className="bg-muted/30 text-muted-foreground flex min-h-[300px] items-center justify-center gap-2 rounded-lg border p-6">
                        <Spinner size="md" />
                        <span>{t("testMatch.testing")}</span>
                      </div>
                    )}

                    {error && (
                      <div className="border-destructive/50 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
                        {t("common.error")} {error.message}
                      </div>
                    )}

                    {!isLoading && !error && data && (
                      <>
                        {data.matched ? (
                          <>
                            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 dark:border-green-900 dark:bg-green-950">
                              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                              <span className="text-sm font-bold text-green-900 dark:text-green-100">
                                {t("testMatch.matchFound")}
                              </span>
                            </div>
                            <MatchedModelCard model={data.model} />
                            <MatchedTierCard tier={data.matchedTier} />
                          </>
                        ) : (
                          <NoMatchDisplay modelName={modelName} />
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {/* View Model Details button at bottom */}
              {hasSubmitted && !isLoading && !error && data?.matched && (
                <div className="border-t pt-4">
                  <Button variant="outline" asChild className="w-full">
                    <Link
                      href={`/project/${projectId}/settings/models/${data.model.id}?pricingTier=${data.matchedTier.id}`}
                      target="_blank"
                    >
                      {t("testMatch.viewDetails")}
                      <SquareArrowOutUpRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </DialogBody>
        </form>
      </DialogContent>
    </Dialog>
  );
}

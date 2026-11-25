/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { useTestModelMatch } from "@/src/features/models/hooks/useModelDefinitionApi";
import {
  modelDetailHref,
  type ModelOwner,
} from "@/src/features/models/modelOwner";
import { UsageDetailsEditor } from "./UsageDetailsEditor";
import { StringMapEditor } from "./StringMapEditor";
import { MatchedModelCard } from "./MatchedModelCard";
import { MatchedTierCard } from "./MatchedTierCard";
import { NoMatchDisplay } from "./NoMatchDisplay";
import { SquareArrowOutUpRight } from "@langfuse/icons";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";

const validStringMap = (entries: Array<[string, string]>) =>
  Object.fromEntries(entries.filter(([key]) => key.trim().length > 0));

export function TestModelMatchDialogContent({
  owner,
  open,
  onClose,
}: {
  owner: ModelOwner;
  open: boolean;
  onClose: () => void;
}) {
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
  const { data, isLoading, error, refetch } = useTestModelMatch(owner, {
    modelName,
    usageDetails,
    modelParameters,
    metadata,
  });

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
    <DialogContent size="lg" className="min-h-[62vh] overflow-y-auto">
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <DialogHeader>
          <DialogTitle>Test Model Match</DialogTitle>
          <DialogDescription className="mt-1">
            Test which model and pricing tier your ingestion data would match
            against.
            {owner.scope === "organization"
              ? " In a project, a matching project model comes first."
              : null}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid grid-cols-[1fr_1px_1fr] gap-6">
          {/* Left Column: Input Form */}
          <div className="flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              {/* Model Name Input */}
              <div className="space-y-2">
                <div className="text-sm font-bold">Model Name *</div>
                <div className="text-muted-foreground text-sm">
                  The model name on your generations.
                </div>
                <Input
                  placeholder="e.g. gpt-4-turbo"
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
                title="Model Parameters"
                description="Add top-level model parameters used by pricing tier conditions."
                entries={modelParameterEntries}
                onChange={setModelParameterEntries}
              />

              <StringMapEditor
                title="Metadata"
                description="Add top-level metadata used by pricing tier conditions."
                entries={metadataEntries}
                onChange={setMetadataEntries}
              />
            </div>

            {/* Buttons at bottom of left column */}
            <div className="flex gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                type="submit"
                disabled={!modelName.trim() || isLoading}
                className="flex-1"
              >
                Test Match
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
                      <span>Testing match...</span>
                    </div>
                  )}

                  {error && (
                    <Banner variant="error">Error: {error.message}</Banner>
                  )}

                  {!isLoading &&
                    !error &&
                    data &&
                    (data.matched ? (
                      <>
                        <Banner variant="success" title="Match found" />
                        <MatchedModelCard model={data.model} />
                        <MatchedTierCard tier={data.matchedTier} />
                      </>
                    ) : (
                      <NoMatchDisplay modelName={modelName} />
                    ))}
                </>
              )}
            </div>

            {/* View Model Details button at bottom */}
            {hasSubmitted && !isLoading && !error && data?.matched && (
              <div className="border-t pt-4">
                <Button variant="outline" asChild className="w-full">
                  <Link
                    href={`${modelDetailHref(owner, data.model.id)}?pricingTier=${data.matchedTier.id}`}
                    target="_blank"
                  >
                    View Model Details
                    <SquareArrowOutUpRight
                      size="base"
                      color="default"
                      __rawClassName="ml-2"
                    />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </DialogBody>
      </form>
    </DialogContent>
  );
}

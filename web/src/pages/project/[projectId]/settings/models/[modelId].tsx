import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { DeleteModelButton } from "@/src/features/models/components/DeleteModelButton";
import { EditModelButton } from "@/src/features/models/components/EditModelButton";
import { CloneModelButton } from "@/src/features/models/components/CloneModelButton";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { getMaxDecimals } from "@/src/features/models/utils";
import Decimal from "decimal.js";
import { PriceUnitSelector } from "@/src/features/models/components/PriceUnitSelector";
import { useMemo } from "react";
import { usePriceUnitMultiplier } from "@/src/features/models/hooks/usePriceUnitMultiplier";
import Generations from "@/src/components/table/use-cases/observations";
import Page from "@/src/components/layouts/page";
import { SquareArrowOutUpRight } from "lucide-react";

export default function ModelDetailPage() {
  const router = useRouter();
  const { priceUnit, priceUnitMultiplier } = usePriceUnitMultiplier();
  const projectId = router.query.projectId as string;
  const modelId = router.query.modelId as string;
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "models:CUD",
  });

  const { data: model, isLoading } = api.models.getById.useQuery(
    { projectId, modelId },
    { enabled: !!projectId && !!modelId },
  );

  const maxDecimals = useMemo(
    () =>
      Math.max(
        ...Object.values(model?.prices ?? {}).map((price) =>
          getMaxDecimals(price, priceUnitMultiplier),
        ),
      ),
    [model?.prices, priceUnitMultiplier],
  );

  // If not found, redirect to models page
  if (!isLoading && !model) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="mb-4 text-xl font-medium">Model not found</div>
        <Button variant="outline" asChild>
          <Link href={`/project/${projectId}/settings/models`}>
            Return to Models page
          </Link>
        </Button>
      </div>
    );
  }

  const isLangfuseModel = !Boolean(model?.projectId);

  if (isLoading || !model) {
    return <div className="p-3">Loading...</div>;
  }

  return (
    <Page
      scrollable
      headerProps={{
        title: model.modelName,
        help: {
          description: "Model configuration and pricing details",
          href: "https://langfuse.com/docs/model-usage-and-cost",
        },
        breadcrumb: [
          {
            name: "Models",
            href: `/project/${router.query.projectId as string}/settings/models`,
          },
          { name: model.modelName },
        ],
        actionButtonsRight: (
          <div className="flex gap-2">
            {hasWriteAccess &&
              (!isLangfuseModel ? (
                <>
                  <EditModelButton projectId={projectId} modelData={model} />
                  <DeleteModelButton
                    projectId={projectId}
                    modelData={model}
                    onSuccess={() => {
                      void router.push(`/project/${projectId}/settings/models`);
                    }}
                  />
                </>
              ) : (
                <CloneModelButton projectId={projectId} modelData={model} />
              ))}
          </div>
        ),
      }}
    >
      <div className="grid grid-cols-2 gap-6 p-2">
        <Card>
          <CardHeader>
            <CardTitle>Model configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Match Pattern
              </div>
              <div className="mt-1 font-mono text-sm">{model.matchPattern}</div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Maintained by
              </div>
              <div className="mt-1 text-sm">
                {isLangfuseModel ? "Langfuse" : "User"}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground">
                Tokenizer
              </div>
              <div className="mt-1 text-sm">{model.tokenizerId || "None"}</div>
            </div>

            {model.tokenizerId && (
              <div>
                <div className="text-sm font-medium text-muted-foreground">
                  Tokenizer Config
                </div>
                <pre className="mt-1 rounded bg-muted p-2 text-sm">
                  <JSONView json={model.tokenizerConfig} />
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2 border-b border-border text-sm font-medium text-muted-foreground">
                <span>Usage Type</span>
                <span className="flex items-center gap-2">
                  <span>Price {priceUnit}</span>
                  <PriceUnitSelector />
                </span>
              </div>
              {Object.entries(model.prices).map(([usageType, price]) => (
                <div
                  key={usageType}
                  className="grid grid-cols-2 gap-2 rounded px-1 py-0.5 text-sm"
                >
                  <span className="break-all">{usageType}</span>
                  <span className="text-left font-mono">
                    $
                    {new Decimal(price)
                      .mul(priceUnitMultiplier)
                      .toFixed(maxDecimals)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Model observations</span>
              <Button variant="ghost" asChild>
                <Link
                  href={`/project/${projectId}/observations`}
                  className="flex items-center gap-1"
                >
                  <span className="text-sm">View all</span>
                  <SquareArrowOutUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex max-h-[calc(100vh-20rem)] flex-col">
              <Generations
                projectId={projectId}
                omittedFilter={["Model"]}
                modelId={model.id}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

// Langfuse Cloud only
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody,
} from "@/src/components/ui/dialog";
import { toast } from "sonner";

import { planLabels } from "@langfuse/shared";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeProducts";
import { ActionButton } from "@/src/components/ActionButton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { api } from "@/src/utils/api";

export const BillingSwitchPlanDialog = () => {
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);

  const router = useRouter();
  const organization = useQueryOrganization();
  const capture = usePostHogClientCapture();

  const mutCreateCheckoutSession =
    api.cloudBilling.createStripeCheckoutSession.useMutation({
      onSuccess: (url) => {
        router.push(url);
        setProcessingPlanId(null);
      },
      onError: () => {
        setProcessingPlanId(null);
      },
    });

  const mutChangePlan =
    api.cloudBilling.changeStripeSubscriptionProduct.useMutation({
      onSuccess: () => {
        toast.success("Plan changed successfully");
        setProcessingPlanId(null);
        // wait 1 second before reloading
        setTimeout(() => {
          window.location.reload();
        }, 500);
      },
      onError: () => {
        setProcessingPlanId(null);
      },
    });

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          capture("project_settings:pricing_dialog_opened");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Change plan</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Plans</DialogTitle>
          <Button variant="secondary" asChild>
            <Link href="https://langfuse.com/pricing" target="_blank">
              Comparison of plans ↗
            </Link>
          </Button>
        </DialogHeader>
        <DialogBody>
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {stripeProducts
              .filter((product) => Boolean(product.checkout))
              .map((product) => (
                <div
                  key={product.stripeProductId}
                  className="relative flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="mb-4">
                    <h3 className="text-2xl font-bold">
                      {product.checkout?.title}
                    </h3>
                    <div className="mt-4 space-y-1">
                      <div className="text-2xl font-bold text-primary">
                        {product.checkout?.price}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        + {product.checkout?.usagePrice}
                      </div>
                    </div>
                  </div>
                  <div className="mb-4 text-sm text-muted-foreground">
                    {product.checkout?.description}
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Main features:</div>
                    <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                      {product.checkout?.mainFeatures.map((feature, index) => (
                        <li key={index}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    href="https://langfuse.com/pricing"
                    target="_blank"
                    className="mt-auto block py-4 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Learn more about plan →
                  </Link>
                  {organization?.cloudConfig?.stripe?.activeProductId ? (
                    // Change plan
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          disabled={
                            organization?.cloudConfig?.stripe
                              ?.activeProductId === product.stripeProductId
                          }
                          className="w-full"
                        >
                          {organization?.cloudConfig?.stripe
                            ?.activeProductId === product.stripeProductId
                            ? "Current plan"
                            : "Change plan"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>
                            Confirm Change:{" "}
                            {planLabels[organization?.plan ?? "cloud:hobby"]} →{" "}
                            {product.checkout?.title}
                          </DialogTitle>
                          <DialogDescription className="pt-2">
                            This will immediately generate an invoice for any
                            usage on your current plan. Your new plan and
                            billing period will start today. Are you sure you
                            want to continue?
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="secondary">Cancel</Button>
                          </DialogClose>
                          <ActionButton
                            onClick={() => {
                              if (organization) {
                                setProcessingPlanId(product.stripeProductId);
                                mutChangePlan.mutate({
                                  orgId: organization.id,
                                  stripeProductId: product.stripeProductId,
                                });
                              }
                            }}
                            loading={
                              processingPlanId === product.stripeProductId
                            }
                          >
                            Confirm
                          </ActionButton>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  ) : (
                    // Upgrade, no plan yet
                    <ActionButton
                      onClick={() => {
                        if (organization) {
                          setProcessingPlanId(product.stripeProductId);
                          mutCreateCheckoutSession.mutate({
                            orgId: organization.id,
                            stripeProductId: product.stripeProductId,
                          });
                        }
                      }}
                      disabled={
                        organization?.cloudConfig?.stripe?.activeProductId ===
                        product.stripeProductId
                      }
                      className="w-full"
                      loading={processingPlanId === product.stripeProductId}
                    >
                      Select plan
                    </ActionButton>
                  )}
                </div>
              ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};

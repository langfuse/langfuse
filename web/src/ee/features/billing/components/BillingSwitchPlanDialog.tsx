// Langfuse Cloud only
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { nanoid } from "nanoid";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody,
} from "@/src/components/ui/dialog";
import { toast } from "sonner";

// planLabels used inside StripeSwitchPlanButton
import {
  stripeProducts,
  isUpgrade,
} from "@/src/ee/features/billing/utils/stripeCatalogue";
import { ActionButton } from "@/src/components/ActionButton";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";
import { api } from "@/src/utils/api";
import { StripeCancellationButton } from "./StripeCancellationButton";
import { StripeSwitchPlanButton } from "./StripeSwitchPlanButton";
import { StripeKeepPlanButton } from "./StripeKeepPlanButton";

export const BillingSwitchPlanDialog = ({
  disabled = false,
}: {
  disabled?: boolean;
}) => {
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [_opId, setOpId] = useState<string | null>(null);

  const router = useRouter();
  const {
    organization,
    cancellation,
    scheduledPlanSwitch,
    isLegacySubscription,
    hasValidPaymentMethod,
  } = useBillingInformation();
  const capture = usePostHogClientCapture();

  const mutCreateCheckoutSession =
    api.cloudBilling.createStripeCheckoutSession.useMutation({
      onSuccess: (url) => {
        router.push(url);
        setProcessingPlanId(null);
        setOpId(null);
      },
      onError: () => {
        setProcessingPlanId(null);
        setOpId(null);
        toast.error("Failed to start checkout session");
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
        <Button disabled={disabled}>Change plan</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <div className="flex flex-row items-center justify-between">
            <DialogTitle>Plans</DialogTitle>
            <ActionButton
              variant="secondary"
              href="https://langfuse.com/pricing"
            >
              Comparison of plans ↗
            </ActionButton>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {stripeProducts
              .filter((product) => Boolean(product.checkout))
              .map((product) => {
                const currentProductId =
                  organization?.cloudConfig?.stripe?.activeProductId;
                const isThisUpgrade = currentProductId
                  ? isUpgrade(currentProductId, product.stripeProductId)
                  : true;
                const isCurrentPlan =
                  currentProductId === product.stripeProductId;

                return (
                  <div
                    key={product.stripeProductId}
                    className="relative flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="mb-4">
                      {/* Labels above plan title */}
                      <div className="mb-1 h-5 text-xs font-medium text-blue-700">
                        {isCurrentPlan && <span>Current Plan</span>}
                        {scheduledPlanSwitch &&
                          scheduledPlanSwitch.newPlanId ===
                            product.stripeProductId && (
                            <span className="ml-1">Starts next period</span>
                          )}
                        {scheduledPlanSwitch &&
                          organization?.cloudConfig?.stripe?.activeProductId ===
                            product.stripeProductId && (
                            <span className="ml-1">(Until next period)</span>
                          )}
                        {!scheduledPlanSwitch &&
                          cancellation?.isCancelled &&
                          organization?.cloudConfig?.stripe?.activeProductId ===
                            product.stripeProductId && (
                            <span className="ml-1">(Until next period)</span>
                          )}
                      </div>
                      <h3 className="text-2xl font-bold">
                        {product.checkout?.title}
                      </h3>
                      <div className="mt-4 space-y-1">
                        <div className="text-2xl font-bold text-primary">
                          {product.checkout?.price}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          + {product.checkout?.usagePrice},{" "}
                          <a
                            href="https://langfuse.com/pricing#pricing-calculator"
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            usage calculator ↗
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="mb-4 text-sm text-muted-foreground">
                      {product.checkout?.description}
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Main features:</div>
                      <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {product.checkout?.mainFeatures.map(
                          (feature, index) => (
                            <li key={index}>{feature}</li>
                          ),
                        )}
                      </ul>
                    </div>
                    <Link
                      href="https://langfuse.com/pricing"
                      target="_blank"
                      className="mt-auto block py-4 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Learn more about plan →
                    </Link>
                    {/* The default behavior the user is on a paid plan.*/}
                    {organization?.cloudConfig?.stripe?.activeProductId ? (
                      // Change plan view
                      <div className="mt-2 space-y-2">
                        {isCurrentPlan && (
                          <>
                            {/* Reactivate button when cancellation is scheduled on current plan */}
                            {cancellation?.isCancelled && (
                              <StripeCancellationButton
                                orgId={organization?.id}
                                variant="default"
                                className="w-full"
                              />
                            )}
                            {!cancellation?.isCancelled &&
                              scheduledPlanSwitch && (
                                <StripeKeepPlanButton
                                  orgId={organization?.id}
                                  stripeProductId={product.stripeProductId}
                                  onProcessing={setProcessingPlanId}
                                  processing={
                                    processingPlanId === product.stripeProductId
                                  }
                                />
                              )}
                            {!cancellation?.isCancelled &&
                              !scheduledPlanSwitch && (
                                <Button className="w-full" disabled>
                                  {!hasValidPaymentMethod
                                    ? "Payment method required"
                                    : "Current plan"}
                                </Button>
                              )}
                          </>
                        )}
                        {/* A downgrade is scheduled and this is the new plan */}
                        {!isCurrentPlan &&
                          scheduledPlanSwitch &&
                          scheduledPlanSwitch.newPlanId ===
                            product.stripeProductId && (
                            <Button className="w-full" disabled>
                              Scheduled
                            </Button>
                          )}

                        {/* A downgrade is scheduled and this is not the new plan and not the current plan*/}
                        {!isCurrentPlan &&
                          scheduledPlanSwitch &&
                          scheduledPlanSwitch.newPlanId !==
                            product.stripeProductId &&
                          (hasValidPaymentMethod ? (
                            <StripeSwitchPlanButton
                              orgId={organization?.id}
                              currentPlan={organization?.plan}
                              newPlanTitle={product.checkout?.title}
                              isLegacySubscription={isLegacySubscription}
                              isUpgrade={isThisUpgrade}
                              stripeProductId={product.stripeProductId}
                              onProcessing={setProcessingPlanId}
                              processing={
                                processingPlanId === product.stripeProductId
                              }
                            />
                          ) : (
                            <Button className="w-full" disabled>
                              Payment method required
                            </Button>
                          ))}

                        {/* The default behavior when it is not the current plan and no schedule exists*/}
                        {!isCurrentPlan &&
                          !scheduledPlanSwitch &&
                          (hasValidPaymentMethod ? (
                            <StripeSwitchPlanButton
                              orgId={organization?.id}
                              currentPlan={organization?.plan}
                              newPlanTitle={product.checkout?.title}
                              isLegacySubscription={isLegacySubscription}
                              isUpgrade={isThisUpgrade}
                              stripeProductId={product.stripeProductId}
                              onProcessing={setProcessingPlanId}
                              processing={
                                processingPlanId === product.stripeProductId
                              }
                            />
                          ) : (
                            <Button className="w-full" disabled>
                              Payment method required
                            </Button>
                          ))}
                      </div>
                    ) : (
                      // The default behavior when the user is not on a paid plan.
                      <ActionButton
                        onClick={() => {
                          if (organization) {
                            setProcessingPlanId(product.stripeProductId);

                            // idempotency key for mutation operations with the stripe api
                            let opId = _opId;
                            if (!opId) {
                              opId = nanoid();
                              setOpId(opId);
                            }

                            mutCreateCheckoutSession.mutate({
                              orgId: organization.id,
                              stripeProductId: product.stripeProductId,
                              opId: opId,
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
                );
              })}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};

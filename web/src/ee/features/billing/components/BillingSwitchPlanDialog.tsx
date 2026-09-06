/* eslint-disable @repo/no-abstracted-overlay-trigger */
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
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";
import { api } from "@/src/utils/api";
import { StripeCancellationButton } from "./StripeCancellationButton";
import { StripeSwitchPlanButton } from "./StripeSwitchPlanButton";
import { StripeKeepPlanButton } from "./StripeKeepPlanButton";
import { useTranslations } from "next-intl";
import { type Plan } from "@langfuse/shared";

export const BillingSwitchPlanDialog = ({
  disabled = false,
}: {
  disabled?: boolean;
}) => {
  const t = useTranslations("settingsEnterprise.billing");
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [_opId, setOpId] = useState<string | null>(null);

  const router = useRouter();
  const {
    organization,
    cancellation,
    scheduledPlanSwitch,
    isLegacySubscription,
    hasValidPaymentMethod,
    currentProductId,
  } = useBillingInformation();
  const capture = usePostHogClientCapture();
  const planDescriptions: Partial<Record<Plan, string>> = {
    "cloud:core": t("switchPlan.planDescriptions.core"),
    "cloud:pro": t("switchPlan.planDescriptions.pro"),
    "cloud:team": t("switchPlan.planDescriptions.team"),
    "cloud:enterprise": t("switchPlan.planDescriptions.enterprise"),
  };
  const planFeatures: Partial<Record<Plan, string[]>> = {
    "cloud:core": [
      t("switchPlan.features.core1"),
      t("switchPlan.features.core2"),
      t("switchPlan.features.core3"),
      t("switchPlan.features.core4"),
    ],
    "cloud:pro": [
      t("switchPlan.features.pro1"),
      t("switchPlan.features.pro2"),
      t("switchPlan.features.pro3"),
      t("switchPlan.features.pro4"),
      t("switchPlan.features.pro5"),
      t("switchPlan.features.pro6"),
    ],
    "cloud:team": [
      t("switchPlan.features.team1"),
      t("switchPlan.features.team2"),
      t("switchPlan.features.team3"),
      t("switchPlan.features.team4"),
      t("switchPlan.features.team5"),
    ],
    "cloud:enterprise": [
      t("switchPlan.features.enterprise1"),
      t("switchPlan.features.enterprise2"),
      t("switchPlan.features.enterprise3"),
      t("switchPlan.features.enterprise4"),
      t("switchPlan.features.enterprise5"),
      t("switchPlan.features.enterprise6"),
      t("switchPlan.features.enterprise7"),
    ],
  };

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
        toast.error(t("switchPlan.checkoutFailed"));
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
        <Button disabled={disabled}>{t("common.changePlan")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <div className="flex flex-row items-center justify-between">
            <DialogTitle>{t("switchPlan.plans")}</DialogTitle>
            <ActionButton
              variant="secondary"
              href="https://langfuse.com/pricing"
            >
              {t("switchPlan.comparison")}
            </ActionButton>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {stripeProducts
              .filter((product) => Boolean(product.checkout))
              .map((product) => {
                const isThisUpgrade = currentProductId
                  ? isUpgrade(currentProductId, product.stripeProductId)
                  : true;
                const isCurrentPlan =
                  currentProductId === product.stripeProductId;

                return (
                  <div
                    key={product.stripeProductId}
                    className="bg-card relative flex flex-col rounded-xl border p-4 shadow-xs transition-all hover:shadow-md"
                  >
                    <div className="mb-4">
                      {/* Labels above plan title */}
                      <div className="mb-1 h-5 text-xs font-bold text-blue-700">
                        {isCurrentPlan && (
                          <span>{t("switchPlan.currentPlan")}</span>
                        )}
                        {scheduledPlanSwitch &&
                          scheduledPlanSwitch.newPlanId ===
                            product.stripeProductId && (
                            <span className="ml-1">
                              {t("switchPlan.startsNextPeriod")}
                            </span>
                          )}
                        {scheduledPlanSwitch &&
                          currentProductId === product.stripeProductId && (
                            <span className="ml-1">
                              {t("switchPlan.untilNextPeriod")}
                            </span>
                          )}
                        {!scheduledPlanSwitch &&
                          cancellation?.isCancelled &&
                          currentProductId === product.stripeProductId && (
                            <span className="ml-1">
                              {t("switchPlan.untilNextPeriod")}
                            </span>
                          )}
                      </div>
                      <h3 className="text-2xl font-bold">
                        {product.checkout?.title}
                      </h3>
                      <div className="mt-4 space-y-1">
                        <div className="text-primary text-2xl font-bold">
                          {product.checkout?.price}
                        </div>
                        <div className="text-muted-foreground text-sm">
                          + {product.checkout?.usagePrice},{" "}
                          <a
                            href="https://langfuse.com/pricing#pricing-calculator"
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            {t("switchPlan.usageCalculator")}
                          </a>
                        </div>
                      </div>
                    </div>
                    <div className="text-muted-foreground mb-4 text-sm">
                      {planDescriptions[product.mappedPlan] ??
                        product.checkout?.description}
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-bold">
                        {t("switchPlan.mainFeatures")}
                      </div>
                      <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                        {(
                          planFeatures[product.mappedPlan] ??
                          product.checkout?.mainFeatures ??
                          []
                        ).map((feature, index) => (
                          <li key={index}>{feature}</li>
                        ))}
                      </ul>
                    </div>
                    <Link
                      href="https://langfuse.com/pricing"
                      target="_blank"
                      className="text-muted-foreground hover:text-foreground mt-auto block py-4 text-sm"
                    >
                      {t("switchPlan.learnMore")}
                    </Link>
                    {/* The default behavior the user is on a paid plan.*/}
                    {currentProductId ? (
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
                                    ? t("switchPlan.paymentMethodRequired")
                                    : t("switchPlan.currentPlan")}
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
                              {t("switchPlan.scheduled")}
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
                              {t("switchPlan.paymentMethodRequired")}
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
                              {t("switchPlan.paymentMethodRequired")}
                            </Button>
                          ))}
                      </div>
                    ) : (
                      // The default behavior when the user is not on a paid plan.
                      <div className="mt-2 flex gap-1">
                        <div className="grid w-full">
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
                              currentProductId === product.stripeProductId
                            }
                            loading={
                              processingPlanId === product.stripeProductId
                            }
                          >
                            {product.checkout?.cta
                              ? t("switchPlan.select")
                              : t("switchPlan.selectPlan")}
                          </ActionButton>
                        </div>
                        {/* Optional checkout CTA button for non-paid plan users */}
                        {product.checkout?.cta && (
                          <div className="grid w-full">
                            <ActionButton
                              variant="secondary"
                              href={product.checkout.cta.href}
                            >
                              {t("switchPlan.contactSales")}
                            </ActionButton>
                          </div>
                        )}
                      </div>
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

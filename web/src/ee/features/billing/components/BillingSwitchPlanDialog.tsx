import { type ReactNode, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useRouter } from "next/router";
import { toast } from "sonner";
import { type Plan } from "@langfuse/shared";

import { ActionButton } from "@/src/components/ActionButton";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogController,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { BillingSwitchPlanUsageBar } from "@/src/ee/features/billing/components/BillingSwitchPlanUsageBar";
import { StripeCancellationButton } from "@/src/ee/features/billing/components/StripeCancellationButton";
import { StripeKeepPlanButton } from "@/src/ee/features/billing/components/StripeKeepPlanButton";
import { StripeSwitchPlanButton } from "@/src/ee/features/billing/components/StripeSwitchPlanButton";
import { useBillingInformation } from "@/src/ee/features/billing/components/useBillingInformation";
import {
  MAX_EVENTS_FREE_PLAN,
  PAID_PLAN_INCLUDED_UNITS,
} from "@/src/ee/features/billing/constants";
import {
  checkoutProductForTier,
  DISPLAY_PLAN_TIERS,
  getDisplayPlanComparison,
  includingTeamsPriceLabel,
  planChoiceReason,
  planTierFromPlan,
  planTierLabel,
  suggestedUpgradeTier,
  teamsAddonBenefitLines,
  teamsAddonPriceLabel,
  VOLUME_DISCOUNT_NOTE,
  type DisplayPlanTier,
  type PlanTier,
} from "@/src/ee/features/billing/utils/planComparison";
import {
  BILLING_PLAN_DIALOG_QUERY,
  hasBillingPlanDialogQuery,
} from "@/src/ee/features/billing/utils/planDialogQuery";
import { isUpgrade } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

const PRICING_COMPARISON_HREF = "https://langfuse.com/pricing";
const PRICING_CALCULATOR_HREF =
  "https://langfuse.com/pricing#pricing-calculator";

type DialogSource = "sidebar" | "billing";

export function BillingSwitchPlanDialogController({
  children,
  source,
  disabled = false,
  autoOpenFromQuery = false,
}: {
  children: (control: {
    openDialog: () => void;
    disabled: boolean;
  }) => ReactNode;
  source: DialogSource;
  disabled?: boolean;
  autoOpenFromQuery?: boolean;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const [openNonce, setOpenNonce] = useState(0);
  const radixOpenRef = useRef<() => void>(() => {});
  const consumedQueryRef = useRef(false);

  useEffect(() => {
    if (!autoOpenFromQuery || !router.isReady) {
      return;
    }
    if (!hasBillingPlanDialogQuery(router.query[BILLING_PLAN_DIALOG_QUERY])) {
      consumedQueryRef.current = false;
      return;
    }
    if (consumedQueryRef.current) {
      return;
    }

    consumedQueryRef.current = true;
    setOpenNonce((nonce) => nonce + 1);
    capture("project_settings:pricing_dialog_opened", { source: "sidebar" });
    radixOpenRef.current();

    const rest = { ...router.query };
    delete rest[BILLING_PLAN_DIALOG_QUERY];
    router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
    });
  }, [autoOpenFromQuery, capture, router]);

  return (
    <DialogController
      closeOnInteractionOutside={false}
      size="xl"
      renderContent={() => <BillingSwitchPlanDialogContent key={openNonce} />}
    >
      {({ openDialog }) => {
        radixOpenRef.current = openDialog;
        return children({
          disabled,
          openDialog: () => {
            setOpenNonce((nonce) => nonce + 1);
            capture("project_settings:pricing_dialog_opened", { source });
            openDialog();
          },
        });
      }}
    </DialogController>
  );
}

function BillingSwitchPlanDialogContent() {
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const {
    organization,
    cancellation,
    scheduledPlanSwitch,
    isLegacySubscription,
    hasValidPaymentMethod,
    currentProductId,
  } = useBillingInformation({ silentQueryErrors: true });

  const currentTier = planTierFromPlan(organization?.plan);
  const [teamsAddonOn, setTeamsAddonOn] = useState(currentTier === "team");

  const hasMemberRead = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organizationMembers:read",
  });
  const memberCount = api.members.allFromOrg.useQuery(
    { orgId: organization?.id ?? "", page: 0, limit: 1 },
    { enabled: Boolean(organization?.id) && hasMemberRead },
  ).data?.totalCount;

  const usage = api.cloudBilling.getUsage.useQuery(
    { orgId: organization?.id ?? "" },
    {
      enabled: Boolean(organization?.id),
      trpc: { context: { skipBatch: true } },
      meta: { silentAllErrors: true },
    },
  );

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

  const hobbyPlanLimit =
    organization?.cloudConfig?.monthlyObservationLimit ?? MAX_EVENTS_FREE_PLAN;
  const includedUnits =
    currentTier === "hobby" ? hobbyPlanLimit : PAID_PLAN_INCLUDED_UNITS;

  const startCheckout = (stripeProductId: string) => {
    if (!organization) return;
    setProcessingPlanId(stripeProductId);
    let nextOpId = opId;
    if (!nextOpId) {
      nextOpId = nanoid();
      setOpId(nextOpId);
    }
    mutCreateCheckoutSession.mutate({
      orgId: organization.id,
      stripeProductId,
      opId: nextOpId,
    });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <DialogTitle>Plans</DialogTitle>
            <DialogDescription className="sr-only">
              Compare included usage, history, limits, and support.
            </DialogDescription>
          </div>
          <ActionButton variant="secondary" href={PRICING_COMPARISON_HREF}>
            Full comparison of plans
          </ActionButton>
        </div>
        <BillingSwitchPlanUsageBar
          includedUnits={includedUnits}
          usage={usage.data ?? undefined}
          usageLoading={usage.isLoading}
          usageError={usage.isError}
        />
      </DialogHeader>
      <DialogBody>
        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-4">
          {DISPLAY_PLAN_TIERS.map((displayTier) => (
            <PlanCard
              key={displayTier}
              displayTier={displayTier}
              currentTier={currentTier}
              hobbyPlanLimit={hobbyPlanLimit}
              teamsAddonOn={teamsAddonOn}
              onTeamsAddonChange={(enabled) => {
                setTeamsAddonOn(enabled);
                capture("billing:teams_addon_toggled", { enabled });
              }}
              memberCount={memberCount}
              currentProductId={currentProductId}
              hasValidPaymentMethod={hasValidPaymentMethod}
              isLegacySubscription={isLegacySubscription}
              cancellationScheduled={Boolean(cancellation?.isCancelled)}
              scheduledNewPlanId={scheduledPlanSwitch?.newPlanId ?? null}
              orgId={organization?.id}
              currentPlan={organization?.plan}
              processingPlanId={processingPlanId}
              onProcessing={setProcessingPlanId}
              onCheckout={startCheckout}
            />
          ))}
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          {VOLUME_DISCOUNT_NOTE}
        </p>
      </DialogBody>
    </>
  );
}

function PlanCard({
  displayTier,
  currentTier,
  hobbyPlanLimit,
  teamsAddonOn,
  onTeamsAddonChange,
  memberCount,
  currentProductId,
  hasValidPaymentMethod,
  isLegacySubscription,
  cancellationScheduled,
  scheduledNewPlanId,
  orgId,
  currentPlan,
  processingPlanId,
  onProcessing,
  onCheckout,
}: {
  displayTier: DisplayPlanTier;
  currentTier: PlanTier;
  hobbyPlanLimit: number;
  teamsAddonOn: boolean;
  onTeamsAddonChange: (enabled: boolean) => void;
  memberCount?: number;
  currentProductId: string | null;
  hasValidPaymentMethod: boolean;
  isLegacySubscription: boolean;
  cancellationScheduled: boolean;
  scheduledNewPlanId: string | null;
  orgId: string | undefined;
  currentPlan: Plan | undefined;
  processingPlanId: string | null;
  onProcessing: (id: string | null) => void;
  onCheckout: (stripeProductId: string) => void;
}) {
  const targetTier: PlanTier =
    displayTier === "pro" && teamsAddonOn ? "team" : displayTier;
  const comparison = getDisplayPlanComparison({
    currentTier,
    displayTier,
    teamsAddonOn,
    memberCount,
  });
  const product =
    targetTier === "hobby" ? undefined : checkoutProductForTier(targetTier);
  const isCurrentDisplay =
    displayTier === "pro"
      ? currentTier === "pro" || currentTier === "team"
      : currentTier === displayTier;
  const isCurrentTarget = currentTier === targetTier;
  const suggested = suggestedUpgradeTier(currentTier);
  const isSuggested =
    suggested === displayTier ||
    (displayTier === "pro" && (suggested === "pro" || suggested === "team"));
  const scheduledHere =
    Boolean(product) && scheduledNewPlanId === product?.stripeProductId;
  const hobbyScheduled = displayTier === "hobby" && cancellationScheduled;
  const choiceReason = planChoiceReason(displayTier, teamsAddonOn);

  const priceLabel =
    displayTier === "hobby"
      ? "Free"
      : displayTier === "pro" && teamsAddonOn
        ? includingTeamsPriceLabel()
        : (product?.checkout?.price ?? "");

  const usageLabel =
    displayTier === "hobby"
      ? `${hobbyPlanLimit.toLocaleString("en-US")} units included`
      : `${PAID_PLAN_INCLUDED_UNITS.toLocaleString("en-US")} units included`;

  const usageDetail =
    displayTier === "hobby" ? "No additional usage — capped" : null;

  return (
    <div
      className={cn(
        "bg-card relative flex h-full flex-col rounded-xl border p-4",
        isCurrentDisplay && "border-border",
        isSuggested && "border-primary border-2",
      )}
    >
      <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-2xl font-bold">{planTierLabel(displayTier)}</h3>
        {isCurrentTarget ? (
          <Badge variant="secondary" size="sm">
            Current plan
          </Badge>
        ) : null}
        {isSuggested ? <Badge size="sm">Recommended upgrade</Badge> : null}
        {scheduledHere || hobbyScheduled ? (
          <Badge variant="outline-solid" size="sm">
            Starts next period
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold whitespace-nowrap">{priceLabel}</p>
      <p className="text-muted-foreground mt-1 text-sm">{usageLabel}</p>
      {displayTier === "hobby" ? (
        <p className="text-muted-foreground text-sm">{usageDetail}</p>
      ) : (
        <p className="text-muted-foreground text-sm">
          + {product?.checkout?.usagePrice},{" "}
          <a
            href={PRICING_CALCULATOR_HREF}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            usage calculator ↗
          </a>
        </p>
      )}
      <p className="mt-2 min-h-16 text-sm">{choiceReason}</p>
      <div className="mt-3 flex-1 border-t pt-3">
        <p className="mb-2 text-xs font-bold tracking-wide uppercase">
          {comparison.heading}
        </p>
        <ul className="space-y-1.5 text-sm">
          {comparison.lines.map((line) => (
            <li key={line.text} className="flex gap-2">
              {line.polarity === "plus" || line.polarity === "minus" ? (
                <span className="w-3 shrink-0 font-bold">
                  {line.polarity === "plus" ? "+" : "−"}
                </span>
              ) : null}
              <span className="text-muted-foreground">{line.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto pt-4">
        {displayTier === "pro" ? (
          <div className="mb-3 rounded-lg border px-3 py-2">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm">
                <span className="font-bold">Teams add-on</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {teamsAddonPriceLabel()}
                </span>
              </span>
              <Switch
                size="sm"
                checked={teamsAddonOn}
                onCheckedChange={onTeamsAddonChange}
              />
            </label>
            <p className="text-muted-foreground mt-1 text-xs">
              {teamsAddonBenefitLines().join(" · ")}
            </p>
          </div>
        ) : null}
        <PlanCardAction
          displayTier={displayTier}
          targetTier={targetTier}
          isCurrentTarget={isCurrentTarget}
          productId={product?.stripeProductId ?? null}
          productTitle={product?.checkout?.title}
          currentProductId={currentProductId}
          hasValidPaymentMethod={hasValidPaymentMethod}
          isLegacySubscription={isLegacySubscription}
          cancellationScheduled={cancellationScheduled}
          scheduledNewPlanId={scheduledNewPlanId}
          orgId={orgId}
          currentPlan={currentPlan}
          processingPlanId={processingPlanId}
          onProcessing={onProcessing}
          onCheckout={onCheckout}
        />
      </div>
    </div>
  );
}

function PlanCardAction({
  displayTier,
  targetTier,
  isCurrentTarget,
  productId,
  productTitle,
  currentProductId,
  hasValidPaymentMethod,
  isLegacySubscription,
  cancellationScheduled,
  scheduledNewPlanId,
  orgId,
  currentPlan,
  processingPlanId,
  onProcessing,
  onCheckout,
}: {
  displayTier: DisplayPlanTier;
  targetTier: PlanTier;
  isCurrentTarget: boolean;
  productId: string | null;
  productTitle: string | undefined;
  currentProductId: string | null;
  hasValidPaymentMethod: boolean;
  isLegacySubscription: boolean;
  cancellationScheduled: boolean;
  scheduledNewPlanId: string | null;
  orgId: string | undefined;
  currentPlan: Plan | undefined;
  processingPlanId: string | null;
  onProcessing: (id: string | null) => void;
  onCheckout: (stripeProductId: string) => void;
}) {
  const isThisUpgrade =
    currentProductId && productId
      ? isUpgrade(currentProductId, productId)
      : true;
  const processingKey = productId ?? "hobby";
  const processing = processingPlanId === processingKey;
  const continueLabel = `Continue with ${planTierLabel(targetTier)} →`;
  const downgradeLabel = `Downgrade to ${planTierLabel(targetTier)}`;
  const salesHref = checkoutProductForTier("enterprise")?.checkout?.cta?.href;

  if (displayTier === "hobby") {
    if (currentTierIsHobby(currentProductId)) {
      return (
        <Button className="w-full" disabled>
          Current plan
        </Button>
      );
    }
    if (cancellationScheduled) {
      return (
        <Button className="w-full" disabled>
          Scheduled
        </Button>
      );
    }
    return <div className="h-9" aria-hidden="true" />;
  }

  if (!productId) {
    return (
      <Button className="w-full" disabled>
        Unavailable
      </Button>
    );
  }

  if (isCurrentTarget) {
    if (cancellationScheduled) {
      return (
        <StripeCancellationButton
          orgId={orgId}
          variant="default"
          className="w-full"
        />
      );
    }
    if (scheduledNewPlanId) {
      return (
        <StripeKeepPlanButton
          orgId={orgId}
          stripeProductId={productId}
          onProcessing={onProcessing}
          processing={processing}
        />
      );
    }
    return (
      <Button className="w-full" disabled>
        {!hasValidPaymentMethod && currentProductId
          ? "Payment method required"
          : "Current plan"}
      </Button>
    );
  }

  if (scheduledNewPlanId === productId) {
    return (
      <Button className="w-full" disabled>
        Scheduled
      </Button>
    );
  }

  if (!currentProductId) {
    return (
      <div className="flex flex-col gap-2">
        <ActionButton
          onClick={() => onCheckout(productId)}
          loading={processing}
          variant="default"
        >
          {continueLabel}
        </ActionButton>
        {displayTier === "enterprise" && salesHref ? (
          <TalkToSalesLink href={salesHref} />
        ) : null}
      </div>
    );
  }

  if (!hasValidPaymentMethod) {
    return (
      <Button className="w-full" disabled>
        Payment method required
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <StripeSwitchPlanButton
        orgId={orgId}
        currentPlan={currentPlan}
        newPlanTitle={productTitle}
        isLegacySubscription={isLegacySubscription}
        isUpgrade={isThisUpgrade}
        stripeProductId={productId}
        onProcessing={onProcessing}
        processing={processing}
        buttonLabel={isThisUpgrade ? continueLabel : downgradeLabel}
        buttonVariant="default"
      />
      {displayTier === "enterprise" && salesHref ? (
        <TalkToSalesLink href={salesHref} />
      ) : null}
    </div>
  );
}

function TalkToSalesLink({ href }: { href: string }) {
  return (
    <Button variant="link" asChild className="h-auto w-full p-0">
      <a href={href} target="_blank" rel="noreferrer">
        Talk to sales
      </a>
    </Button>
  );
}

function currentTierIsHobby(currentProductId: string | null) {
  return !currentProductId;
}

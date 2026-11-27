import { expect, fn } from "storybook/test";
import preview from "../../../../../../.storybook/preview";
import { PlanPicker } from "./PlanPicker";

const meta = preview.meta({ component: PlanPicker });

export const Default = meta.story({
  args: {
    currentPlan: "cloud:pro",
    pickedPlan: "cloud:team",
    subscription: {
      hasSubscription: true,
      isLegacy: false,
      hasValidPaymentMethod: true,
      trialPlanName: null,
      periodEnd: "Dec 26",
      pending: null,
    },
    onPickPlan: fn(),
    primaryAction: {
      label: "Upgrade to Pro + Teams Add-on",
      isLoading: false,
      disabledReason: null,
      onClick: fn(),
    },
    closeLabel: "Keep Pro",
    onClose: fn(),
  },
});

export const Downgrade = meta.story({
  args: { ...Default.input.args, pickedPlan: "cloud:core" },
});

export const DowngradeAcrossPlans = meta.story({
  args: {
    ...Default.input.args,
    currentPlan: "cloud:enterprise",
    pickedPlan: "cloud:core",
  },
});

export const OwnPlan = meta.story({
  args: { ...Default.input.args, pickedPlan: "cloud:pro" },
});

export const OnHobby = meta.story({
  args: {
    ...Default.input.args,
    currentPlan: "cloud:hobby",
    pickedPlan: "cloud:core",
    subscription: {
      ...Default.input.args.subscription,
      hasSubscription: false,
      hasValidPaymentMethod: false,
      periodEnd: null,
    },
  },
});

export const OnTrial = meta.story({
  args: {
    ...OnHobby.input.args,
    pickedPlan: "cloud:enterprise",
    subscription: {
      ...OnHobby.input.args.subscription,
      trialPlanName: "Enterprise Trial",
    },
  },
});

export const OnEnterprise = meta.story({
  args: {
    ...Default.input.args,
    currentPlan: "cloud:enterprise",
    pickedPlan: "cloud:enterprise",
  },
});

export const SwitchScheduled = meta.story({
  args: {
    ...Default.input.args,
    currentPlan: "cloud:team",
    pickedPlan: "cloud:team",
    subscription: {
      ...Default.input.args.subscription,
      pending: { kind: "switch", to: "cloud:pro" },
    },
  },
});

export const CancelScheduled = meta.story({
  args: {
    ...Default.input.args,
    pickedPlan: "cloud:pro",
    subscription: {
      ...Default.input.args.subscription,
      pending: { kind: "cancel" },
    },
  },
});

export const UpgradeOverScheduledCancel = meta.story({
  args: { ...CancelScheduled.input.args, pickedPlan: "cloud:enterprise" },
});

export const PaymentMethodMissing = meta.story({
  args: {
    ...Default.input.args,
    subscription: {
      ...Default.input.args.subscription,
      hasValidPaymentMethod: false,
    },
  },
});

export const LegacySubscription = meta.story({
  args: {
    ...Default.input.args,
    subscription: { ...Default.input.args.subscription, isLegacy: true },
  },
});

export const PickingAPlan = meta.story({
  name: "(Test) Picking a plan",
  args: Default.input.args,
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole("radio", { name: /Pro \+ Teams Add-on/ }),
    ).toBeChecked();
    await userEvent.click(canvas.getByRole("radio", { name: /Enterprise/ }));
    await expect(args.onPickPlan).toHaveBeenCalledTimes(1);
    await expect(args.onPickPlan).toHaveBeenCalledWith("cloud:enterprise");
  },
});

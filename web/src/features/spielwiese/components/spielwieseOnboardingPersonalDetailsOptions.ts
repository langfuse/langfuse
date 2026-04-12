export const onboardingDetailsFieldShellClassName =
  "h-[2.125rem] rounded-[10px] bg-transparent px-3 shadow-[inset_0_0_0_1px_rgb(238,239,241)]";
export const onboardingDetailsInputClassName =
  "h-full w-full appearance-none border-0 bg-transparent px-0 text-sm/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)] shadow-none outline-none placeholder:text-[rgb(137,138,141)] focus:border-transparent focus:outline-none focus:ring-0 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-0 max-sm:text-base/5";
export const onboardingDetailsMutedClassName =
  "text-[0.75rem]/4 font-medium tracking-[-0.01em] text-[rgba(0,0,0,0.55)]";
export const onboardingDetailsSecondaryButtonClassName =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3 text-sm/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0),0_0_2px_0_rgba(28,40,64,0.18),0_1px_3px_0_rgba(24,41,75,0.04)] transition-colors hover:bg-[rgb(248,249,250)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(78,140,252)]";
export const onboardingDetailsPrimaryButtonClassName =
  "inline-flex h-9 w-full items-center justify-center rounded-[10px] bg-[rgb(38,109,240)] px-3 text-sm/5 font-medium tracking-[-0.01em] text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(38,109,240,0.12),0_3px_6px_-2px_rgba(38,109,240,0.08)] transition-colors hover:bg-[rgb(46,117,248)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(78,140,252)]";
export const onboardingDetailsSelectTriggerClassName =
  "h-[2.125rem] w-full rounded-[10px] border-transparent bg-transparent px-3 text-sm/5 font-medium tracking-[-0.01em] text-[rgb(36,37,41)] shadow-[inset_0_0_0_1px_rgb(238,239,241)] focus-visible:border-transparent focus-visible:ring-0 data-[popup-open]:border-transparent data-[popup-open]:ring-0 [&_svg]:text-[rgb(137,138,141)]";
export const onboardingDetailsSelectContentClassName =
  "w-[var(--anchor-width)] rounded-[12px] border-[rgb(238,239,241)] bg-white p-1.5 shadow-[0_16px_40px_-18px_rgba(24,41,75,0.28)]";
export const onboardingDetailsSelectItemClassName =
  "rounded-[8px] px-2.5 py-2 text-[13px] font-medium tracking-[-0.01em] text-[rgb(36,37,41)] data-[highlighted]:bg-[rgb(248,249,250)] data-[highlighted]:text-[rgb(36,37,41)]";

export const onboardingPositionOptions = [
  "Founder",
  "Engineer",
  "Product manager",
  "Designer",
  "Researcher",
  "Solutions architect",
] as const;

export const onboardingCanCodeOptions = [
  "No, but Claude can",
  "I'd rather not",
  "Yes and I did so without the help of Claude and co.",
] as const;

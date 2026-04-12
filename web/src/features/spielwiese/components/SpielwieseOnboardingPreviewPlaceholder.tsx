import {
  type EntryTextMotionDelay,
  getOnboardingEntryTextMotionClassName,
} from "./spielwieseOnboardingEntryMotion";

type SpielwieseOnboardingPreviewPlaceholderProps = {
  delay?: EntryTextMotionDelay;
  eyebrow: string;
  isActive: boolean;
  title: string;
};

export default function SpielwieseOnboardingPreviewPlaceholder({
  delay = "long",
  eyebrow,
  isActive,
  title,
}: SpielwieseOnboardingPreviewPlaceholderProps) {
  return (
    <div className="border-t border-[rgb(238,239,241)] bg-[rgb(250,250,251)] px-6 py-6 sm:px-10 lg:px-[5.375rem]">
      <div
        className={`grid min-h-[13.5rem] place-items-center rounded-[1.125rem] border border-dashed border-[rgba(17,24,39,0.14)] bg-white/84 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ${getOnboardingEntryTextMotionClassName(isActive, delay)}`}
      >
        <div className="grid max-w-[18rem] gap-2 text-center">
          <p className="text-[0.6875rem]/4 font-semibold tracking-[0.12em] text-[rgba(17,24,39,0.42)] uppercase">
            {eyebrow}
          </p>
          <p className="text-[0.9375rem]/6 font-medium tracking-[-0.02em] text-[rgb(36,37,41)]">
            {title}
          </p>
        </div>
      </div>
    </div>
  );
}

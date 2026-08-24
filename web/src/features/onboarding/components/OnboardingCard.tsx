import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { cn } from "@/src/utils/tailwind";

const onboardingCardVariants = cva(
  "bg-background mt-6 rounded-lg shadow-sm sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[480px] sm:px-12",
  {
    variants: {
      // Interactive steps sit tighter than the standalone status screens, which
      // are centered on a short line of text.
      variant: {
        form: "px-6 py-6 sm:py-10",
        message: "px-6 py-10 sm:py-12",
      },
    },
    defaultVariants: { variant: "form" },
  },
);

type OnboardingCardProps = VariantProps<typeof onboardingCardVariants> & {
  children: ReactNode;
};

/** Chrome-less card shell shared by every step of the signup onboarding flow. */
export function OnboardingCard({ children, variant }: OnboardingCardProps) {
  return (
    <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-start sm:px-6 sm:py-12 lg:px-8">
      <div className="flex items-center justify-center gap-2 sm:mx-auto sm:w-full sm:max-w-md">
        <LangfuseIcon size={32} />
      </div>

      <div className={onboardingCardVariants({ variant })}>{children}</div>
    </div>
  );
}

/** Terminal state of the flow: completing, redirecting, or failed to load. */
export function OnboardingMessage({
  title,
  description,
  showSpinner = false,
}: {
  title: string;
  description: string;
  showSpinner?: boolean;
}) {
  return (
    <OnboardingCard variant="message">
      <div className="flex flex-col items-center text-center">
        {showSpinner && <Spinner size="xl" variant="muted" />}
        <h1 className={cn("text-xl font-bold", showSpinner && "mt-6")}>
          {title}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      </div>
    </OnboardingCard>
  );
}

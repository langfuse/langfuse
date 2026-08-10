import { useCallback, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import {
  OnboardingCard,
  OnboardingMessage,
} from "@/src/features/onboarding/components/OnboardingCard";
import { useCompleteOnboarding } from "@/src/features/onboarding/hooks/useCompleteOnboarding";
import { NEWSLETTER_SIGNUP_FALLBACK_URL } from "@/src/features/onboarding/lib/newsletterConstants";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import { api } from "@/src/utils/api";

const newsletterFormSchema = z.object({
  email: z
    .string()
    .trim()
    .max(320)
    .pipe(z.email("Enter a valid email address")),
});

type NewsletterFormData = z.infer<typeof newsletterFormSchema>;

const PITCH =
  "Subscribe to the Langfuse OSS email newsletter to stay informed about new features and important updates.";

/**
 * Self-hosted signup step: opt in to the Langfuse self-hosting newsletter.
 *
 * Replaces the attribution question shown on Langfuse Cloud — self-hosters have
 * no equivalent step today, and release announcements are the update channel
 * they otherwise have to discover on GitHub.
 */
export function SelfHostedNewsletterStep() {
  const { data: session, status: sessionStatus } = useSession();
  const {
    finishOnboarding,
    isCompletingOnboarding,
    isStatusLoading,
    isStatusError,
  } = useCompleteOnboarding();
  const newsletterStatus = api.onboarding.newsletterStatus.useQuery();
  const subscribeMutation = api.onboarding.subscribeToNewsletter.useMutation();
  // Set once the server reports it could not reach the signup proxy, which is
  // how an airgapped instance surfaces: discovered on submit, never probed.
  const [isSignupUnreachable, setIsSignupUnreachable] = useState(false);

  const continueWithoutSubscribing = useCallback(() => {
    finishOnboarding({ newsletterOptIn: false }).catch(() => undefined);
  }, [finishOnboarding]);

  const [subscribe, isSubscribing] = useWatchedPromiseCallback(
    async ({ email }: NewsletterFormData) => {
      try {
        const result = await subscribeMutation.mutateAsync({ email });

        if (result.status === "subscribed") {
          await finishOnboarding({ newsletterOptIn: true });
          return;
        }

        setIsSignupUnreachable(true);
      } catch (error) {
        showErrorToast(
          "Failed to subscribe",
          error instanceof Error ? error.message : "Please try again.",
        );
      }
    },
    [finishOnboarding, subscribeMutation],
  );

  if (isStatusError) {
    return (
      <OnboardingMessage
        title="Failed to load onboarding"
        description="Refresh the page to try again."
      />
    );
  }

  if (
    isStatusLoading ||
    sessionStatus === "loading" ||
    newsletterStatus.isLoading
  ) {
    return (
      <OnboardingMessage
        showSpinner
        title="Loading"
        description="One moment..."
      />
    );
  }

  if (isCompletingOnboarding) {
    return (
      <OnboardingMessage
        showSpinner
        title="Finishing setup"
        description="Taking you to your workspace..."
      />
    );
  }

  const canSubscribeInProduct =
    newsletterStatus.data?.available === true && !isSignupUnreachable;

  return (
    <OnboardingCard>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold">Stay up to date</h1>
        <p className="text-muted-foreground text-sm">{PITCH}</p>
      </div>

      {canSubscribeInProduct ? (
        // Keyed on the session email so the prefilled default is set when the
        // form first mounts, instead of synced into state afterwards.
        <NewsletterEmailForm
          key={session?.user?.email ?? ""}
          defaultEmail={session?.user?.email ?? ""}
          isBusy={isSubscribing}
          onSubscribe={(data) => {
            subscribe(data).catch(() => undefined);
          }}
          onSkip={continueWithoutSubscribing}
        />
      ) : (
        <NewsletterSignupFallback
          reason={
            isSignupUnreachable
              ? // Prefixed as an error only here: an unreachable proxy is a
                // failure, whereas a switched-off signup is a deliberate choice.
                "Error: This instance could not reach langfuse.com, so it cannot subscribe you directly."
              : "In-product signup is turned off on this instance."
          }
          onContinue={continueWithoutSubscribing}
          isBusy={isCompletingOnboarding}
        />
      )}
    </OnboardingCard>
  );
}

function NewsletterEmailForm({
  defaultEmail,
  isBusy,
  onSubscribe,
  onSkip,
}: {
  defaultEmail: string;
  isBusy: boolean;
  onSubscribe: (data: NewsletterFormData) => void;
  onSkip: () => void;
}) {
  const form = useForm<NewsletterFormData>({
    resolver: zodResolver(newsletterFormSchema),
    defaultValues: { email: defaultEmail },
  });

  return (
    <Form {...form}>
      <form
        className="mt-6 flex flex-col"
        onSubmit={form.handleSubmit(onSubscribe)}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormControl>
                <Input
                  autoFocus
                  type="email"
                  maxLength={320}
                  placeholder="you@company.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-6">
          <Button
            type="button"
            variant="ghost"
            className="w-20"
            disabled={isBusy}
            onClick={onSkip}
          >
            Skip
          </Button>
          <Button type="submit" variant="default" disabled={isBusy}>
            Subscribe
          </Button>
        </div>
      </form>
    </Form>
  );
}

function NewsletterSignupFallback({
  reason,
  isBusy,
  onContinue,
}: {
  reason: string;
  isBusy: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="mt-6 flex flex-col">
      <p className="text-muted-foreground text-sm">
        {reason} You can subscribe on{" "}
        <a
          href={NEWSLETTER_SIGNUP_FALLBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary break-words underline underline-offset-2"
        >
          {/* Spelled out rather than labelled: the URL has to be readable to
              someone who cannot follow the link from an airgapped machine. */}
          {NEWSLETTER_SIGNUP_FALLBACK_URL}
        </a>{" "}
        instead.
      </p>

      <div className="flex justify-end pt-6">
        <Button
          type="button"
          variant="default"
          disabled={isBusy}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

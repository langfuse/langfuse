import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "@langfuse/icons";
import { type ReactNode, useState } from "react";
import { z } from "zod";
import { Button } from "@/src/components/design-system/Button/Button";
import { ControlledHoverCard } from "@/src/components/design-system/ControlledHoverCard/ControlledHoverCard";
import { createForm } from "@/src/components/design-system/factories/createForm";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";
import {
  getNewsletterFallbackLinks,
  NEWSLETTER_SIGNUP_URL,
  type NewsletterList,
} from "../lib/newsletterSignup";

const newsletterOptInSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email({ error: "Enter a valid email address" })),
});

const NewsletterOptInForm = createForm<NewsletterOptInValues>();

const EXPLAINER_LABEL = "How your address is used";

const DESCRIPTIONS = {
  installer:
    "Monthly product updates, plus a heads-up when a new major version or a required upgrade affects your instance.",
  invited:
    "One email a month with the newest Langfuse features and improvements.",
} as const;

const EXPLAINER_INTROS = {
  installer:
    "By subscribing, you'll be added to the Langfuse mailing lists for product updates and self-hosting notices. Expect a monthly email about new features, plus a heads-up when a new major version or a required upgrade affects your instance.",
  invited:
    "By subscribing, you'll be added to the Langfuse product updates list. Expect one email a month about new features.",
} as const;

const FALLBACK_REASONS = {
  unreachable:
    "This browser can't reach langfuse.com. To subscribe, open a link below on a device with internet access:",
  failed: "We couldn't subscribe you. You can sign up here instead:",
} as const;

const FALLBACK_LINK_LABELS: Record<NewsletterList, string> = {
  oss: "Self-hosting notices:",
  product: "Product updates:",
};

type NewsletterOptInProps =
  | { state: "loading" }
  | { state: "completing" }
  | {
      state: "form";
      lists: NewsletterList[];
      defaultEmail: string;
      onSubscribe: (values: NewsletterOptInValues) => Promise<void>;
      onSkip: () => Promise<void>;
    }
  | {
      state: "unreachable" | "failed";
      lists: NewsletterList[];
      isContinuing: boolean;
      onContinue: () => void;
    };

export function NewsletterOptIn(props: NewsletterOptInProps) {
  switch (props.state) {
    case "loading":
      return (
        <StatusCard
          title="Getting your workspace ready"
          description="One moment..."
        />
      );
    case "completing":
      return (
        <StatusCard
          title="Finishing setup"
          description="Taking you to your workspace..."
        />
      );
    case "form":
      return (
        <OnboardingCard>
          <NewsletterHeader audience={getAudience(props.lists)} />
          <NewsletterForm
            defaultEmail={props.defaultEmail}
            onSubscribe={props.onSubscribe}
            onSkip={props.onSkip}
          />
        </OnboardingCard>
      );
    case "unreachable":
    case "failed":
      return (
        <OnboardingCard>
          <NewsletterHeader audience={getAudience(props.lists)} />
          <NewsletterFallback
            reason={FALLBACK_REASONS[props.state]}
            lists={props.lists}
            isContinuing={props.isContinuing}
            onContinue={props.onContinue}
          />
        </OnboardingCard>
      );
  }
}

function OnboardingCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col py-6 sm:min-h-full sm:justify-start sm:px-6 sm:py-12 lg:px-8">
      <div className="flex items-center justify-center gap-2 sm:mx-auto sm:w-full sm:max-w-md">
        <LangfuseIcon size={32} />
      </div>

      <div className="bg-card mt-6 flex flex-col gap-6 rounded-lg px-6 py-6 shadow-sm sm:mx-auto sm:mt-16 sm:w-full sm:max-w-[480px] sm:px-12 sm:py-10">
        {children}
      </div>
    </div>
  );
}

function StatusCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <OnboardingCard>
      <div className="flex flex-col items-center py-4 text-center">
        <Spinner size="xl" variant="muted" />
        <h1 className="mt-6 text-xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      </div>
    </OnboardingCard>
  );
}

/** The ⓘ opens on hover and keyboard focus, and on click or tap for touch screens. */
function NewsletterHeader({ audience }: { audience: Audience }) {
  const [isExplainerOpen, setIsExplainerOpen] = useState(false);
  const openExplainer = () => setIsExplainerOpen(true);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <h1 className="text-xl font-bold">Stay up to date</h1>
        <ControlledHoverCard
          open={isExplainerOpen}
          onOpenChange={setIsExplainerOpen}
          content={<NewsletterExplainer audience={audience} />}
          aria-label={EXPLAINER_LABEL}
        >
          {({ getTriggerProps }) => (
            <IconButton
              {...getTriggerProps({ onClick: openExplainer })}
              icon={Info}
              label={EXPLAINER_LABEL}
              size="sm"
              variant="ghost"
            />
          )}
        </ControlledHoverCard>
      </div>
      <p className="text-muted-foreground text-sm">{DESCRIPTIONS[audience]}</p>
    </div>
  );
}

function NewsletterExplainer({ audience }: { audience: Audience }) {
  return (
    <div className="text-muted-foreground flex w-96 max-w-[calc(100vw-1rem)] flex-col gap-2 p-3 text-sm">
      <p>{EXPLAINER_INTROS[audience]}</p>
      <p>You can unsubscribe at any time with the link in every email.</p>
      <p>
        Shown once to new users. Your browser, not this instance, checks it can
        reach langfuse.com and sends your address to{" "}
        <span className="font-mono break-words">{NEWSLETTER_SIGNUP_URL}</span>{" "}
        when you subscribe. If it can&apos;t reach it, you&apos;ll see sign-up
        links instead.
      </p>
      <p>
        Langfuse admins can disable this question entirely by setting{" "}
        <span className="font-mono break-words">
          LANGFUSE_DISABLE_SIGNUP_ONBOARDING=true
        </span>
        .
      </p>
    </div>
  );
}

/** Skip leaves without checking the address; Subscribe (or Enter in the field) validates it first. */
function NewsletterForm({
  defaultEmail,
  onSubscribe,
  onSkip,
}: {
  defaultEmail: string;
  onSubscribe: (values: NewsletterOptInValues) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const form = NewsletterOptInForm.useForm({
    resolver: zodResolver(newsletterOptInSchema),
    defaultValues: { email: defaultEmail },
  });
  const [skip, isSkipping] = useWatchedPromiseCallback(onSkip, [onSkip]);
  const isSubscribing = form.formState.isSubmitting;

  return (
    <NewsletterOptInForm
      form={form}
      onSubmit={onSubscribe}
      actions={[
        {
          id: "subscribe",
          type: "submit",
          text: "Subscribe",
          loading: isSubscribing,
          disabled: isSkipping,
        },
        {
          id: "skip",
          type: "button",
          text: "Skip",
          variant: "ghost",
          loading: isSkipping,
          disabled: isSubscribing,
          onClick: skip,
        },
      ]}
    >
      <NewsletterOptInForm.Field name="email" label="Email">
        {(field) => (
          <Input
            id={field.id}
            inputMode="email"
            autoComplete="email"
            name={field.name}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
            ref={field.ref}
            aria-describedby={field.inputDescribedById}
            aria-invalid={Boolean(field.error)}
            error={Boolean(field.error)}
          />
        )}
      </NewsletterOptInForm.Field>
    </NewsletterOptInForm>
  );
}

/** Replaces a form that may have had focus, so the reason takes focus for keyboard and screen-reader users. */
function NewsletterFallback({
  reason,
  lists,
  isContinuing,
  onContinue,
}: {
  reason: string;
  lists: NewsletterList[];
  isContinuing: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p
          ref={focusOnMount}
          tabIndex={-1}
          className="text-muted-foreground text-sm outline-hidden"
        >
          {reason}
        </p>
        <ul className="flex flex-col gap-2">
          {getNewsletterFallbackLinks(lists).map(({ list, url }) => (
            <li key={list} className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">
                {FALLBACK_LINK_LABELS[list]}
              </span>
              <LinkBadge href={url} text={url} newTab shouldWrap />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <Button
          type="button"
          text="Continue"
          loading={isContinuing}
          onClick={onContinue}
        />
      </div>
    </div>
  );
}

type Audience = "installer" | "invited";

const getAudience = (lists: NewsletterList[]): Audience =>
  lists.includes("oss") ? "installer" : "invited";

const focusOnMount = (element: HTMLElement | null) => element?.focus();

export type NewsletterOptInValues = z.infer<typeof newsletterOptInSchema>;

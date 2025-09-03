import React from "react";
import { Lock, AlertCircle, Sparkle } from "lucide-react";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { HoverCardPortal } from "@radix-ui/react-hover-card";
import Link from "next/link";
import { useTranslation } from "next-i18next";

const BUTTON_STATE_MESSAGES = {
  limitReached: (current: number, max: number, t: any) =>
    t("actionButton.limitReached", { current, max }),
  noAccess: (t: any) => t("actionButton.noAccess"),
  entitlement: (t: any) => t("actionButton.entitlement"),
} as const;

interface ActionButtonProps extends ButtonProps {
  icon?: React.ReactNode;
  loading?: boolean;
  hasAccess?: boolean;
  hasEntitlement?: boolean;
  limitValue?: number;
  limit?: number | false;
  children: React.ReactNode;
  className?: string;
  href?: string;
}

export const ActionButton = React.forwardRef<
  HTMLButtonElement,
  ActionButtonProps
>(function ActionButton(
  {
    loading = false,
    hasAccess = true,
    hasEntitlement = true,
    limitValue,
    limit = false,
    disabled = false,
    children,
    icon,
    className,
    href,
    ...buttonProps
  },
  ref,
) {
  const { t } = useTranslation("common");
  const hasReachedLimit =
    typeof limit === "number" &&
    limitValue !== undefined &&
    limitValue >= limit;
  const isDisabled =
    disabled || !hasAccess || !hasEntitlement || hasReachedLimit;

  const getMessage = () => {
    if (!hasAccess) return BUTTON_STATE_MESSAGES.noAccess(t);
    if (!hasEntitlement) return BUTTON_STATE_MESSAGES.entitlement(t);
    if (
      hasReachedLimit &&
      typeof limit === "number" &&
      limitValue !== undefined
    ) {
      return BUTTON_STATE_MESSAGES.limitReached(limitValue, limit, t);
    }
    return null;
  };

  const message = getMessage();

  const btnContent = (
    <ButtonContent
      ref={ref}
      icon={icon}
      isDisabled={isDisabled}
      loading={loading}
      hasAccess={hasAccess}
      hasEntitlement={hasEntitlement}
      hasReachedLimit={hasReachedLimit}
      className={className}
      buttonProps={buttonProps}
      href={href}
    >
      {children}
    </ButtonContent>
  );

  if (isDisabled && message) {
    return (
      <HoverCard openDelay={200}>
        <HoverCardTrigger asChild>
          <span>{btnContent}</span>
        </HoverCardTrigger>
        <HoverCardPortal>
          <HoverCardContent className="w-80 text-sm">
            {message}
          </HoverCardContent>
        </HoverCardPortal>
      </HoverCard>
    );
  }

  return btnContent;
});

const ButtonContent = React.forwardRef<
  HTMLButtonElement,
  {
    icon?: React.ReactNode;
    isDisabled: boolean;
    loading: boolean;
    hasAccess: boolean;
    hasEntitlement: boolean;
    hasReachedLimit: boolean;
    className?: string;
    buttonProps: Omit<ButtonProps, "disabled" | "loading" | "className">;
    children: React.ReactNode;
    href?: string;
  }
>(function ButtonContent(
  {
    icon,
    isDisabled,
    loading,
    hasAccess,
    hasEntitlement,
    hasReachedLimit,
    className,
    buttonProps,
    children,
    href,
  },
  ref,
) {
  const content = (
    <>
      {!hasAccess ? (
        <Lock className="mr-1 h-4 w-4" />
      ) : !hasEntitlement ? (
        <AlertCircle className="mr-1 h-4 w-4" />
      ) : hasReachedLimit ? (
        <Sparkle className="mr-1 h-4 w-4" />
      ) : icon ? (
        <div className="mr-1">{icon}</div>
      ) : null}
      {children}
    </>
  );

  const renderLink = href && !isDisabled;

  return (
    <Button
      ref={ref}
      disabled={isDisabled}
      loading={loading}
      className={className}
      {...buttonProps}
      asChild={renderLink ? true : undefined}
    >
      {renderLink ? <Link href={href}>{content}</Link> : content}
    </Button>
  );
});

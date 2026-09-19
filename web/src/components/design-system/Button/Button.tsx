import { cva } from "class-variance-authority";
import { ExternalLink, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { type MouseEventHandler, type Ref } from "react";

import { Spinner } from "@/src/components/design-system/Spinner/Spinner";

const buttonVariants = cva(
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

type ButtonProps = {
  text: string;
  variant?: "primary" | "secondary" | "destructive" | "ghost";
} & (
  | {
      href: string;
      ref?: Ref<HTMLAnchorElement>;
      disabled?: never;
      loading?: never;
      icon?: LucideIcon;
      form?: never;
      onClick?: never;
      type?: never;
    }
  | {
      href?: never;
      ref?: Ref<HTMLButtonElement>;
      disabled?: boolean;
      form?: string;
      icon?: LucideIcon;
      loading?: boolean;
      onClick?: MouseEventHandler<HTMLButtonElement>;
      type?: "button" | "submit";
    }
);

export function Button(props: ButtonProps) {
  const className = buttonVariants({ variant: props.variant });

  if (props.href !== undefined) {
    const Icon = props.icon;
    const isExternal =
      props.href.startsWith("https://") || props.href.startsWith("http://");

    if (isExternal) {
      const hostname = new URL(props.href).hostname;
      const isLangfuseDomain =
        hostname === "langfuse.com" || hostname.endsWith(".langfuse.com");

      return (
        <a
          className={`${className} gap-1`}
          href={props.href}
          ref={props.ref}
          target="_blank"
          rel={isLangfuseDomain ? "noopener" : "noopener noreferrer"}
        >
          {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
          {props.text}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      );
    }

    return (
      <Link className={className} href={props.href} ref={props.ref}>
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
        {props.text}
      </Link>
    );
  }

  const Icon = props.icon;

  return (
    <button
      className={className}
      ref={props.ref}
      type={props.type ?? "button"}
      form={props.form}
      disabled={props.disabled || props.loading}
      onClick={props.loading || props.disabled ? undefined : props.onClick}
      aria-busy={props.loading}
      aria-label={props.text}
    >
      {props.loading ? (
        <span className="flex h-1/2 items-center justify-center">
          <Spinner size="full" />
        </span>
      ) : (
        <>
          {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
          {props.text}
        </>
      )}
    </button>
  );
}

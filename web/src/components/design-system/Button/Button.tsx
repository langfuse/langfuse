import { cva } from "class-variance-authority";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { type Ref } from "react";

import { Spinner } from "@/src/components/design-system/Spinner/Spinner";

const buttonVariants = cva(
  "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
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
  variant?: "primary" | "secondary" | "ghost";
} & (
  | {
      href: string;
      ref?: Ref<HTMLAnchorElement>;
      disabled?: never;
      loading?: never;
      onClick?: never;
      type?: never;
    }
  | ({
      href?: never;
      ref?: Ref<HTMLButtonElement>;
      disabled?: boolean;
      loading?: boolean;
    } & (
      | {
          type?: "button";
          onClick: () => void;
        }
      | {
          type: "submit";
          onClick?: never;
        }
    ))
);

export function Button(props: ButtonProps) {
  const className = buttonVariants({ variant: props.variant });

  if (props.href !== undefined) {
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
          {props.text}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      );
    }

    return (
      <Link className={className} href={props.href} ref={props.ref}>
        {props.text}
      </Link>
    );
  }

  return (
    <button
      className={className}
      ref={props.ref}
      type={props.type ?? "button"}
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
        props.text
      )}
    </button>
  );
}

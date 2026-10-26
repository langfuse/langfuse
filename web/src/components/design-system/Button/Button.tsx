import { cva } from "class-variance-authority";
import { ExternalLink, type IconComponent } from "@langfuse/icons";
import Link from "next/link";
import {
  type ButtonHTMLAttributes,
  type MouseEventHandler,
  type Ref,
} from "react";

import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { cn } from "@/src/utils/tailwind";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline:
          "border border-border-contrast bg-background hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        /** Inline text action: muted, underlined, no box. */
        text: "text-muted-foreground hover:text-foreground underline",
      },
      size: {
        default: "h-8 px-3 py-1 text-sm",
        sm: "h-7 px-2 text-xs",
      },
    },
    compoundVariants: [{ variant: "text", class: "h-auto px-0 py-0" }],
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type ButtonProps = {
  text: string;
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "destructive"
    | "ghost"
    | "text";
  size?: "default" | "sm";
} & (
  | {
      href: string;
      ref?: Ref<HTMLAnchorElement>;
      disabled?: never;
      loading?: never;
      icon?: IconComponent;
      form?: never;
      onClick?: never;
      type?: never;
    }
  | ({
      href?: never;
      ref?: Ref<HTMLButtonElement>;
      disabled?: boolean;
      form?: string;
      icon?: IconComponent;
      loading?: boolean;
      onClick?: MouseEventHandler<HTMLButtonElement>;
      type?: "button" | "submit";
      "data-state"?: string;
    } & Pick<
      ButtonHTMLAttributes<HTMLButtonElement>,
      "id" | "aria-controls" | "aria-expanded" | "aria-haspopup"
    >)
);

export function Button(props: ButtonProps) {
  // twMerge so the text variant's px-0/h-auto win over the size defaults.
  const className = cn(
    buttonVariants({
      variant: props.variant,
      size: props.size,
    }),
  );
  const iconColor = props.variant === "ghost" ? "default" : "inherit";

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
          {Icon ? <Icon color={iconColor} aria-hidden /> : null}
          {props.text}
          {/* The glyph reaches the bottom of its box, so centered it dips below the text baseline. */}
          <ExternalLink
            size="sm"
            color={iconColor}
            aria-hidden
            __rawClassName="-translate-y-px"
          />
        </a>
      );
    }

    return (
      <Link className={className} href={props.href} ref={props.ref}>
        {Icon ? <Icon color={iconColor} aria-hidden /> : null}
        {props.text}
      </Link>
    );
  }

  const Icon = props.icon;

  return (
    <button
      className={cn(className, "relative")}
      ref={props.ref}
      type={props.type ?? "button"}
      form={props.form}
      disabled={props.disabled || props.loading}
      onClick={props.loading || props.disabled ? undefined : props.onClick}
      aria-busy={props.loading}
      aria-label={props.text}
      id={props.id}
      aria-controls={props["aria-controls"]}
      aria-expanded={props["aria-expanded"]}
      aria-haspopup={props["aria-haspopup"]}
      data-state={props["data-state"]}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5",
          props.loading && "invisible",
        )}
      >
        {Icon ? <Icon color={iconColor} aria-hidden /> : null}
        {props.text}
      </span>
      {props.loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-1/2 items-center justify-center">
            <Spinner size="full" />
          </span>
        </span>
      )}
    </button>
  );
}

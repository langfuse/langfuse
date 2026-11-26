import Link from "next/link";

const QUIET_LINK =
  "text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50";

/** Small grey text for a secondary action on the plan card: a link with `href`, a button with `onClick`. */
export function BillingQuietLink(
  props: { label: string } & (
    | { href: string }
    | { onClick: () => void; disabled?: boolean }
  ),
) {
  if ("href" in props) {
    return (
      <Link
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        className={QUIET_LINK}
      >
        {props.label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={QUIET_LINK}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

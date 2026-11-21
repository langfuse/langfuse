const haloIconClassNames = {
  launcher: "size-3.5",
  launcherActive: "size-3.5 text-primary-accent",
  emptyState: "text-muted-foreground size-7 mx-auto",
  activityAccent: "text-primary-accent size-3.5 mt-0.5 shrink-0",
  activityDestructive: "text-destructive size-3.5 mt-0.5 shrink-0",
  notice: "size-3 shrink-0",
} as const;

/** Brand icon for Halo, based on the supplied 24px artwork. */
export function HaloIcon({ variant }: HaloIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={haloIconClassNames[variant]}
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="5" ry="1.5" />
      <path d="M8.8 18.8 5.6 22V10.8a1.6 1.6 0 0 1 1.6-1.6h9.6a1.6 1.6 0 0 1 1.6 1.6v6.4a1.6 1.6 0 0 1-1.6 1.6Z" />
      <path d="M4 14h1.6" />
      <path d="M9.6 13.2v1.6" />
      <path d="M14.4 13.2v1.6" />
      <path d="M18.4 14h1.6" />
    </svg>
  );
}

type HaloIconProps = {
  variant: keyof typeof haloIconClassNames;
};

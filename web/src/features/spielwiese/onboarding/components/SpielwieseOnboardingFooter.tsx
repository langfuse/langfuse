import type { MouseEvent } from "react";

const onboardingFooterButtonClassName =
  "text-[0.75rem]/4 font-medium tracking-[-0.01em] text-[rgba(0,0,0,0.55)] transition-colors hover:text-[rgba(0,0,0,0.72)]";

export function preventInertOnboardingClick(
  event: MouseEvent<HTMLButtonElement>,
) {
  event.preventDefault();
}

export function SpielwieseOnboardingFooter() {
  return (
    <footer className="flex w-full justify-center">
      <ul
        className="flex flex-wrap items-center justify-center gap-5"
        role="list"
      >
        <li>
          <button className={onboardingFooterButtonClassName} type="button">
            © 2022-2026 Langfuse GmbH / Finto Technologies Inc.
          </button>
        </li>
        <li>
          <button
            className={onboardingFooterButtonClassName}
            onClick={preventInertOnboardingClick}
            type="button"
          >
            Privacy Policy
          </button>
        </li>
        <li>
          <button
            className={onboardingFooterButtonClassName}
            onClick={preventInertOnboardingClick}
            type="button"
          >
            Support
          </button>
        </li>
      </ul>
    </footer>
  );
}

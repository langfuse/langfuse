import { env } from "@/src/env.mjs";

export const CloudPrivacyNotice = ({ action }: { action: string }) =>
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
    <div className="mx-auto mt-10 max-w-lg text-center text-xs text-muted-foreground">
      By {action} you are agreeing to our{" "}
      <a
        href="https://langfuse.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="italic"
      >
        Terms and Conditions
      </a>
      ,{" "}
      <a
        href="https://langfuse.com/privacy"
        rel="noopener noreferrer"
        className="italic"
      >
        Privacy Policy
      </a>
      , and{" "}
      <a
        href="https://langfuse.com/cookie-policy"
        rel="noopener noreferrer"
        className="italic"
      >
        Cookie Policy
      </a>
      . You also confirm that the entered data is accurate.
    </div>
  ) : null;

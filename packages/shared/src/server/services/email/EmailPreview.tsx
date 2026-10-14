import * as React from "react";

const PREVIEW_MAX_LENGTH = 150;

/**
 * Inbox preheader text, hidden in the rendered email body.
 *
 * Use this instead of `Preview` from `@react-email/components`: that component
 * pads the text with hundreds of hidden zero-width and bidi-control characters,
 * a pattern spam filters associate with phishing (Gmail flags such mail as
 * dangerous).
 */
export const EmailPreview = ({ children }: EmailPreviewProps) => {
  const text = Array.isArray(children) ? children.join("") : children;
  return (
    <div
      style={{
        display: "none",
        overflow: "hidden",
        lineHeight: "1px",
        opacity: 0,
        maxHeight: 0,
        maxWidth: 0,
      }}
      data-skip-in-text={true}
    >
      {text.substring(0, PREVIEW_MAX_LENGTH)}
    </div>
  );
};

type EmailPreviewProps = {
  children: string | Array<string | number>;
};

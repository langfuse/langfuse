/**
 * Clipboard Copy Fallback
 *
 * This fallback implementation enables copying text to clipboard when the secure Clipboard API
 * isn't available. This typically occurs when the page isn't served over HTTPS (TLS).
 *
 * Examples of affected scenarios:
 * - Self-hosted deployments without configured HTTPS certificates.
 * - Websites served over plain HTTP (except localhost and local IP addresses).
 *
 * Note:
 * - Local resources like http://localhost, http://127.0.0.1, and http://*.localhost are NOT affected.
 *
 * Important:
 * - This fallback method uses `execCommand`, which is deprecated.
 * - It will stop working once browsers fully remove support for `execCommand`.
 */
const _unsafeNonSecureCopyToClipboard = (text: string) => {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Fallback for non-secure contexts where the Clipboard API is unavailable.
    document.execCommand("copy");
    document.body.removeChild(textArea);
  } catch (error) {
    console.error("Unable to copy to clipboard", error);
  }
};

/**
 * Copy text to clipboard using clipboard api or fallback to _unsafeNonSecureCopyToClipboard for non secure contexts
 *
 * @param text - Text to copy to clipboard
 * @returns Promise<void>
 */
export const copyTextToClipboard = async (text: string) => {
  if (typeof navigator.clipboard?.writeText === "function") {
    return navigator.clipboard.writeText(text);
  }
  return _unsafeNonSecureCopyToClipboard(text);
};

/**
 * Copy rich content while keeping a useful plain-text representation.
 *
 * Exposing `navigator.clipboard.write` is not the same as accepting a
 * multi-MIME write: browsers reject unsupported types, and a rejection here
 * would otherwise leave the clipboard untouched while the caller reports
 * success. Fall back to the plain-text path so the copy still lands.
 */
export const copyRichTextToClipboard = async ({
  text,
  html,
}: {
  text: string;
  html: string;
}) => {
  if (
    typeof navigator.clipboard?.write === "function" &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      return await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
    } catch {
      // Fall through to the plain-text write below.
    }
  }

  return copyTextToClipboard(text);
};

/**
 * Read text from the clipboard. Returns null when the async Clipboard API is
 * unavailable (non-secure context) or the user/browser denied the read —
 * there is no legacy fallback for reading. Callers should treat null as
 * "cannot know what's in the clipboard", not as "clipboard is empty".
 */
export const readTextFromClipboard = async (): Promise<string | null> => {
  if (typeof navigator.clipboard?.readText !== "function") {
    return null;
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
};

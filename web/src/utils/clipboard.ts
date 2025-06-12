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

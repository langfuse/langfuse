import { splitEmailText } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/components/TeamInviteFields/components/EmailTagInput/fns/splitEmailText";

/** Adds the addresses typed or pasted as `text`, skipping ones already listed. */
export function appendEmails(current: string[], text: string) {
  const emails = new Set(current);
  for (const email of splitEmailText(text)) {
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 0) emails.add(normalized);
  }
  return [...emails];
}

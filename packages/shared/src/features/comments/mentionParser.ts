/**
 * Maximum number of mentions allowed per comment to prevent spam/abuse
 */
const MAX_MENTIONS_PER_COMMENT = 50;

/**
 * Mention format: @[Display Name](user:userId)
 * Regex pattern with bounded quantifiers to prevent ReDoS attacks
 * - Display name: 1-100 characters, excluding brackets
 * - User ID: 1-30 characters (CUID is 25 chars)
 */
const MENTION_REGEX = /@\[([^\[\]]{1,100})\]\(user:([a-z0-9]{1,30})\)/gi;

export interface ParsedMention {
  userId: string;
  displayName: string;
}

/**
 * Extract mentions from markdown content
 * @param content - Markdown string with embedded mentions
 * @returns Array of unique mentioned users
 */
export function extractMentionsFromMarkdown(content: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  const seen = new Set<string>();

  // Reset regex lastIndex
  MENTION_REGEX.lastIndex = 0;

  let match;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    // Prevent excessive mentions (spam/abuse protection)
    if (mentions.length >= MAX_MENTIONS_PER_COMMENT) {
      break;
    }

    const displayName = match[1];
    const userId = match[2];

    if (displayName && userId && !seen.has(userId)) {
      mentions.push({ userId, displayName });
      seen.add(userId);
    }
  }

  return mentions;
}

/**
 * Extract just user IDs for simpler validation
 */
export function extractMentionedUserIds(content: string): string[] {
  return extractMentionsFromMarkdown(content).map((m) => m.userId);
}

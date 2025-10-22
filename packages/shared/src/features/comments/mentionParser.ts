/**
 * Mention format: @[Display Name](user:userId)
 * Regex pattern to match this format in markdown
 */
const MENTION_REGEX = /@\[([^\]]+)\]\(user:([a-z0-9]+)\)/gi;

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

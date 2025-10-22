/**
 * Maximum number of mentions allowed per comment to prevent spam/abuse
 */
const MAX_MENTIONS_PER_COMMENT = 50;

/**
 * Mention format: @[Display Name](user:userId)
 * Regex pattern with bounded quantifiers to prevent ReDoS attacks
 * - Display name: 1-100 characters, excluding brackets
 * - User ID: 1-30 characters (CUID is 25 chars, custom IDs may include hyphens/underscores)
 */
const MENTION_REGEX = /@\[([^[\]]{1,100})\]\(user:([a-z0-9_-]{1,30})\)/gi;

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

export interface ProjectMember {
  id: string;
  name: string | null;
  email: string | null;
}

export interface SanitizeMentionsResult {
  sanitizedContent: string;
  validMentionedUserIds: string[];
}

/**
 * Sanitize mentions in comment content by validating user IDs against project members
 * and normalizing display names to match the database.
 *
 * Security features:
 * - Validates mentioned users exist and have project access
 * - Replaces display names with canonical names from DB (prevents social engineering)
 * - Strips invalid mentions to plain text (graceful degradation)
 *
 * @param content - Markdown string with embedded mentions
 * @param projectMembers - Array of project members with id, name, and email
 * @returns Sanitized content and array of valid user IDs
 *
 * @example
 * // Valid mention gets normalized display name
 * sanitizeMentions("Hey @[FakeAdmin](user:alice123)", [{id: "alice123", name: "Alice Smith", email: "..."}])
 * // Returns: { sanitizedContent: "Hey @[Alice Smith](user:alice123)", validMentionedUserIds: ["alice123"] }
 *
 * // Invalid mention gets stripped to plain text
 * sanitizeMentions("Hey @[Someone](user:invalid)", [{id: "alice123", name: "Alice Smith", email: "..."}])
 * // Returns: { sanitizedContent: "Hey Someone", validMentionedUserIds: [] }
 */
export function sanitizeMentions(
  content: string,
  projectMembers: ProjectMember[],
): SanitizeMentionsResult {
  // Create lookup map for O(1) user validation
  const memberMap = new Map(
    projectMembers.map((member) => [member.id, member]),
  );

  const validUserIds: string[] = [];
  let sanitizedContent = content;

  // Process mentions in reverse order to maintain correct string indices during replacement
  const mentionsWithIndices: Array<{
    mention: ParsedMention;
    startIndex: number;
    endIndex: number;
  }> = [];

  // Reset regex lastIndex
  MENTION_REGEX.lastIndex = 0;

  let match;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    const displayName = match[1];
    const userId = match[2];
    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;

    mentionsWithIndices.push({
      mention: { userId, displayName },
      startIndex,
      endIndex,
    });
  }

  // Process in reverse order to maintain indices
  for (let i = mentionsWithIndices.length - 1; i >= 0; i--) {
    const { mention, startIndex, endIndex } = mentionsWithIndices[i];
    const member = memberMap.get(mention.userId);

    if (member) {
      // Valid user: Replace with canonical display name from DB
      const canonicalName = member.name || member.email || "User";
      const replacement = `@[${canonicalName}](user:${mention.userId})`;

      sanitizedContent =
        sanitizedContent.substring(0, startIndex) +
        replacement +
        sanitizedContent.substring(endIndex);

      // Track valid user (only add once, in original order)
      if (!validUserIds.includes(mention.userId)) {
        validUserIds.push(mention.userId);
      }
    } else {
      // Invalid user: Strip mention markdown, keep display name as plain text
      sanitizedContent =
        sanitizedContent.substring(0, startIndex) +
        mention.displayName +
        sanitizedContent.substring(endIndex);
    }
  }

  // Reverse validUserIds back to original order
  validUserIds.reverse();

  return {
    sanitizedContent,
    validMentionedUserIds: validUserIds,
  };
}

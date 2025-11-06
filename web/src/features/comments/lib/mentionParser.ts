/**
 * Maximum number of mentions allowed per comment to prevent spam/abuse
 */
const MAX_MENTIONS_PER_COMMENT = 50;

/**
 * Prefix used in mention links to identify user references
 * Format: @[Display Name](user:userId)
 */
export const MENTION_USER_PREFIX = "user:";

/**
 * Mention format: @[Display Name](user:userId)
 * Regex pattern with bounded quantifiers to prevent ReDoS attacks
 * - Display name: 1-100 characters, excluding brackets
 * - User ID: 1-30 characters (CUID is 25 chars, custom IDs may include hyphens/underscores)
 */
const MENTION_REGEX = new RegExp(
  `@\\[([^[\\]]{1,100})\\]\\(${MENTION_USER_PREFIX}([a-z0-9_-]{1,30})\\)`,
  "gi",
);

/**
 * Extract unique mentioned user IDs from markdown content
 * @param content - Markdown string with embedded mentions in format @[Display Name](user:userId)
 * @returns Array of unique user IDs (deduplicated, order preserved, max 50 mentions)
 */
export function extractUniqueMentionedUserIds(content: string): string[] {
  const userIds: string[] = [];
  const seen = new Set<string>();

  // Reset regex lastIndex to ensure clean state
  MENTION_REGEX.lastIndex = 0;

  let match;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    // Prevent excessive mentions (spam/abuse protection)
    if (userIds.length >= MAX_MENTIONS_PER_COMMENT) {
      break;
    }

    const userId = match[2]; // Extract userId from capture group

    if (userId && !seen.has(userId)) {
      userIds.push(userId);
      seen.add(userId);
    }
  }

  return userIds;
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
  const seenUserIds = new Set<string>();

  // Reset regex lastIndex to ensure clean state
  MENTION_REGEX.lastIndex = 0;

  // Single pass using String.replace() - O(n) complexity
  const sanitizedContent = content.replace(
    MENTION_REGEX,
    (match, displayName, userId) => {
      const member = memberMap.get(userId);

      if (member) {
        // Valid user: Replace with canonical display name from DB
        const canonicalName = member.name || member.email || "User";

        // Track valid user (deduplicate with Set)
        if (!seenUserIds.has(userId)) {
          validUserIds.push(userId);
          seenUserIds.add(userId);
        }

        return `@[${canonicalName}](${MENTION_USER_PREFIX}${userId})`;
      } else {
        // Invalid user: Strip mention markdown, keep display name as plain text
        return displayName;
      }
    },
  );

  return {
    sanitizedContent,
    validMentionedUserIds: validUserIds,
  };
}

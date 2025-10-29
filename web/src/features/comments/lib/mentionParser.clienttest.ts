import {
  extractUniqueMentionedUserIds,
  MENTION_USER_PREFIX,
  sanitizeMentions,
  type ProjectMember,
} from "./mentionParser";

describe("mentionParser", () => {
  describe("MENTION_USER_PREFIX", () => {
    it("should be 'user:'", () => {
      expect(MENTION_USER_PREFIX).toBe("user:");
    });
  });

  describe("extractUniqueMentionedUserIds", () => {
    describe("valid patterns", () => {
      it("should extract a single mention", () => {
        const content = "Hey @[Alice](user:alice123), how are you?";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["alice123"]);
      });

      it("should extract multiple mentions", () => {
        const content =
          "@[Alice](user:alice123) and @[Bob](user:bob456) please review";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["alice123", "bob456"]);
      });

      it("should handle mentions with special characters in display name", () => {
        const content = "Ask @[O'Connor](user:user123) about it";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["user123"]);
      });

      it("should handle mentions with numbers in display name", () => {
        const content = "Tell @[User 2](user:user-2) to check";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["user-2"]);
      });

      it("should handle user IDs with hyphens and underscores", () => {
        const content = "@[Test User](user:test_user-123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["test_user-123"]);
      });

      it("should handle mentions at start of text", () => {
        const content = "@[Alice](user:alice123) please help";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toHaveLength(1);
        expect(result[0]).toBe("alice123");
      });

      it("should handle mentions at end of text", () => {
        const content = "Please review @[Alice](user:alice123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toHaveLength(1);
        expect(result[0]).toBe("alice123");
      });

      it("should handle mentions with surrounding punctuation", () => {
        const content = "Hey, @[Alice](user:alice123)! Can you help?";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["alice123"]);
      });

      it("should handle mentions in middle of long text", () => {
        const content =
          "This is a long text with @[Alice](user:alice123) mentioned somewhere in the middle of it all.";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["alice123"]);
      });

      it("should handle display names with spaces", () => {
        const content = "@[Alice Smith Johnson](user:alice123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["alice123"]);
      });

      it("should handle display names with dots", () => {
        const content = "@[Dr. Smith](user:user123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["user123"]);
      });

      it("should preserve user ID case exactly as written", () => {
        const content = "@[Alice](user:AlIcE123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["AlIcE123"]);
      });
    });

    describe("invalid patterns", () => {
      it("should not match mentions without brackets", () => {
        const content = "@Alice(user:alice123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should not match mentions without parentheses", () => {
        const content = "@[Alice]user:alice123";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should not match mentions with wrong prefix", () => {
        const content = "@[Alice](member:alice123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should not match mentions without user ID", () => {
        const content = "@[Alice](user:)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should not match mentions with nested brackets", () => {
        const content = "@[Alice [Admin]](user:alice123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should not match mentions with user ID containing invalid characters", () => {
        const content = "@[Alice](user:alice@123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should not match mentions with user ID containing spaces", () => {
        const content = "@[Alice](user:alice 123)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should not match mentions with user ID too long (>30 chars)", () => {
        const longUserId = "a".repeat(31);
        const content = `@[Alice](user:${longUserId})`;
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should not match mentions with display name too long (>100 chars)", () => {
        const longName = "A".repeat(101);
        const content = `@[${longName}](user:alice123)`;
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should not match partial mention formats", () => {
        const content = "@[Alice] or (user:alice123) or @Alice";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });
    });

    describe("edge cases", () => {
      it("should return empty array for empty string", () => {
        const result = extractUniqueMentionedUserIds("");

        expect(result).toEqual([]);
      });

      it("should return empty array when no mentions present", () => {
        const content = "This is just regular text without any mentions";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([]);
      });

      it("should deduplicate mentions of same user ID", () => {
        const content = "@[Alice](user:alice123) and @[Alicia](user:alice123)";
        const result = extractUniqueMentionedUserIds(content);

        // Should only return first occurrence
        expect(result).toEqual(["alice123"]);
      });

      it("should enforce maximum of 50 mentions", () => {
        // Create content with 52 mentions
        const mentions = Array.from(
          { length: 52 },
          (_, i) => `@[User${i}](user:user${i})`,
        ).join(" ");

        const result = extractUniqueMentionedUserIds(mentions);

        // Should only return first 50
        expect(result).toHaveLength(50);
      });

      it("should handle mentions with maximum valid display name length (100 chars)", () => {
        const maxName = "A".repeat(100);
        const content = `@[${maxName}](user:alice123)`;
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["alice123"]);
      });

      it("should handle mentions with maximum valid user ID length (30 chars)", () => {
        const maxUserId = "a".repeat(30);
        const content = `@[Alice](user:${maxUserId})`;
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual([maxUserId]);
      });

      it("should handle mentions with minimum valid lengths (1 char each)", () => {
        const content = "@[A](user:a)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["a"]);
      });

      it("should handle newlines in content", () => {
        const content =
          "First line @[Alice](user:alice123)\nSecond line @[Bob](user:bob456)";
        const result = extractUniqueMentionedUserIds(content);

        expect(result).toEqual(["alice123", "bob456"]);
      });
    });

    describe("ReDoS prevention", () => {
      it("should handle very long display names without hanging", () => {
        const longName = "A".repeat(1000);
        const content = `@[${longName}](user:alice123)`;

        const startTime = Date.now();
        const result = extractUniqueMentionedUserIds(content);
        const duration = Date.now() - startTime;

        // Should complete quickly (invalid pattern, >100 chars)
        expect(duration).toBeLessThan(100);
        expect(result).toEqual([]);
      });

      it("should handle many repeated brackets without hanging", () => {
        const content = "@[[[[[[[Alice](user:alice123)";

        const startTime = Date.now();
        const result = extractUniqueMentionedUserIds(content);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(100);
        expect(result).toEqual([]);
      });

      it("should handle pathological regex patterns efficiently", () => {
        // Pattern that could cause catastrophic backtracking in poorly designed regex
        const content =
          "@[" + "A".repeat(50) + "[" + "B".repeat(50) + "](user:test)";

        const startTime = Date.now();
        void extractUniqueMentionedUserIds(content);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(100);
      });

      it("should handle very large input efficiently", () => {
        // Create 10KB of text with scattered mentions
        const largeContent =
          "Lorem ipsum ".repeat(800) +
          "@[Alice](user:alice123) " +
          "dolor sit amet ".repeat(800);

        const startTime = Date.now();
        const result = extractUniqueMentionedUserIds(largeContent);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(500);
        expect(result).toEqual(["alice123"]);
      });
    });
  });

  describe("sanitizeMentions", () => {
    const mockMembers: ProjectMember[] = [
      { id: "alice123", name: "Alice Smith", email: "alice@example.com" },
      { id: "bob456", name: "Bob Jones", email: "bob@example.com" },
      { id: "noname789", name: null, email: "noname@example.com" },
      { id: "noemail000", name: "No Email User", email: null },
      { id: "minimal111", name: null, email: null },
    ];

    describe("valid user normalization", () => {
      it("should normalize display names to match database names", () => {
        const content = "Hey @[FakeAdmin](user:alice123), can you help?";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe(
          "Hey @[Alice Smith](user:alice123), can you help?",
        );
        expect(result.validMentionedUserIds).toEqual(["alice123"]);
      });

      it("should use name when available", () => {
        const content = "@[RandomName](user:bob456) please review";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe(
          "@[Bob Jones](user:bob456) please review",
        );
      });

      it("should fall back to email when name is null", () => {
        const content = "@[SomeName](user:noname789) check this";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe(
          "@[noname@example.com](user:noname789) check this",
        );
      });

      it("should fall back to 'User' when both name and email are null", () => {
        const content = "@[AnyName](user:minimal111) review";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe("@[User](user:minimal111) review");
      });
    });

    describe("invalid user handling", () => {
      it("should strip markdown for invalid user IDs", () => {
        const content = "Hey @[Someone](user:invalid123), check this";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe("Hey Someone, check this");
        expect(result.validMentionedUserIds).toEqual([]);
      });

      it("should handle mixed valid and invalid mentions", () => {
        const content =
          "@[Alice](user:alice123) and @[Nobody](user:invalid) review";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe(
          "@[Alice Smith](user:alice123) and Nobody review",
        );
        expect(result.validMentionedUserIds).toEqual(["alice123"]);
      });

      it("should handle multiple invalid mentions", () => {
        const content = "@[User1](user:invalid1) @[User2](user:invalid2)";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe("User1 User2");
        expect(result.validMentionedUserIds).toEqual([]);
      });
    });

    describe("social engineering prevention", () => {
      it("should prevent fake admin impersonation", () => {
        const content = "@[System Administrator](user:alice123) approved this";
        const result = sanitizeMentions(content, mockMembers);

        // Should replace with actual user's name
        expect(result.sanitizedContent).toBe(
          "@[Alice Smith](user:alice123) approved this",
        );
      });

      it("should prevent email impersonation", () => {
        const content = "@[support@company.com](user:alice123) says";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe(
          "@[Alice Smith](user:alice123) says",
        );
      });

      it("should prevent Unicode lookalike attacks", () => {
        // Using Cyrillic 'А' instead of Latin 'A'
        const content = "@[Аdmin](user:alice123) approved";
        const result = sanitizeMentions(content, mockMembers);

        // Should use canonical name from DB
        expect(result.sanitizedContent).toBe(
          "@[Alice Smith](user:alice123) approved",
        );
      });
    });

    describe("edge cases", () => {
      it("should handle empty content", () => {
        const result = sanitizeMentions("", mockMembers);

        expect(result.sanitizedContent).toBe("");
        expect(result.validMentionedUserIds).toEqual([]);
      });

      it("should handle content with no mentions", () => {
        const content = "Just regular text here";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe(content);
        expect(result.validMentionedUserIds).toEqual([]);
      });

      it("should handle empty project members array", () => {
        const content = "@[Alice](user:alice123) @[Bob](user:bob456)";
        const result = sanitizeMentions(content, []);

        // All mentions should be stripped
        expect(result.sanitizedContent).toBe("Alice Bob");
        expect(result.validMentionedUserIds).toEqual([]);
      });

      it("should preserve order of validMentionedUserIds", () => {
        const content =
          "@[Alice](user:alice123) then @[Bob](user:bob456) then @[Alice](user:noname789)";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.validMentionedUserIds).toEqual([
          "alice123",
          "bob456",
          "noname789",
        ]);
      });

      it("should deduplicate user IDs in validMentionedUserIds", () => {
        const content =
          "@[Alice](user:alice123) and @[Alice Again](user:alice123)";
        const result = sanitizeMentions(content, mockMembers);

        // Should normalize both but only list user ID once
        expect(result.sanitizedContent).toBe(
          "@[Alice Smith](user:alice123) and @[Alice Smith](user:alice123)",
        );
        expect(result.validMentionedUserIds).toEqual(["alice123"]);
      });

      it("should handle mentions at different positions correctly", () => {
        const content =
          "@[Alice](user:alice123) start, middle @[Bob](user:bob456) end @[NoName](user:noname789)";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe(
          "@[Alice Smith](user:alice123) start, middle @[Bob Jones](user:bob456) end @[noname@example.com](user:noname789)",
        );
        expect(result.validMentionedUserIds).toEqual([
          "alice123",
          "bob456",
          "noname789",
        ]);
      });

      it("should correctly handle string indices when replacing multiple mentions", () => {
        // This tests that replacements don't mess up subsequent indices
        const content =
          "A @[User1](user:alice123) B @[User2](user:bob456) C @[User3](user:noname789) D";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe(
          "A @[Alice Smith](user:alice123) B @[Bob Jones](user:bob456) C @[noname@example.com](user:noname789) D",
        );
      });

      it("should handle adjacent mentions", () => {
        const content = "@[Alice](user:alice123)@[Bob](user:bob456)";
        const result = sanitizeMentions(content, mockMembers);

        expect(result.sanitizedContent).toBe(
          "@[Alice Smith](user:alice123)@[Bob Jones](user:bob456)",
        );
      });
    });

    describe("performance", () => {
      it("should handle large project member list efficiently", () => {
        // Create 1000 mock members
        const largeMembers: ProjectMember[] = Array.from(
          { length: 1000 },
          (_, i) => ({
            id: `user${i}`,
            name: `User ${i}`,
            email: `user${i}@example.com`,
          }),
        );

        const content = "@[Someone](user:user500) check this";

        const startTime = Date.now();
        const result = sanitizeMentions(content, largeMembers);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(100);
        expect(result.validMentionedUserIds).toEqual(["user500"]);
      });

      it("should handle many mentions efficiently", () => {
        // Create content with 50 mentions (max allowed)
        const mentions = Array.from(
          { length: 50 },
          (_, i) => `@[User${i}](user:alice123)`,
        ).join(" ");

        const startTime = Date.now();
        const result = sanitizeMentions(mentions, mockMembers);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(500);
        expect(result.validMentionedUserIds).toEqual(["alice123"]);
      });
    });
  });
});

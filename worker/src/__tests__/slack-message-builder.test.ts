import { describe, it, expect } from "vitest";
import { SlackMessageBuilder } from "../features/slack/slackMessageBuilder";
import type { WebhookInput } from "@langfuse/shared/src/server";

describe("SlackMessageBuilder", () => {
  const mockPromptPayload: WebhookInput["payload"] = {
    action: "created",
    type: "prompt-version",
    prompt: {
      id: "prompt-123",
      name: "test-prompt",
      version: 2,
      projectId: "project-456",
      type: "text",
      labels: ["production", "v2"],
      tags: ["ai", "completion"],
      commitMessage: "Added new context handling",
      createdAt: new Date("2023-12-15T10:30:00Z"),
      updatedAt: new Date("2023-12-15T10:30:00Z"),
      createdBy: "user-123",
      isActive: true,
      prompt: { text: "Hello {{name}}" },
      config: { temperature: 0.7 },
    },
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
  };

  describe("buildPromptVersionMessage", () => {
    it("should build complete prompt-version message with all fields", () => {
      const blocks =
        SlackMessageBuilder.buildPromptVersionMessage(mockPromptPayload);

      expect(blocks).toHaveLength(5); // header, main, details, commit, actions

      // Check header block
      expect(blocks[0]).toMatchObject({
        type: "header",
        text: {
          type: "plain_text",
          text: "✨ Prompt created",
          emoji: true,
        },
      });

      // Check main content
      expect(blocks[1]).toMatchObject({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*test-prompt* (version 2) has been *created*",
        },
      });

      // Check details section with fields
      expect(blocks[2]).toMatchObject({
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: "*Change author:*\nTest User",
          },
          {
            type: "mrkdwn",
            text: "*Type:*\ntext",
          },
          {
            type: "mrkdwn",
            text: "*Version:*\n2",
          },
          {
            type: "mrkdwn",
            text: "*Labels:*\nproduction, v2",
          },
          {
            type: "mrkdwn",
            text: "*Tags:*\nai, completion",
          },
        ],
      });

      // Check commit message section
      expect(blocks[3]).toMatchObject({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Commit Message:*\n> Added new context handling",
        },
      });

      // Check action buttons
      expect(blocks[4]).toMatchObject({
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "View Prompt",
              emoji: true,
            },
            url: expect.stringContaining(
              "/project/project-456/prompts/test-prompt?version=2",
            ),
            style: "primary",
          },
        ],
      });
    });

    it("should handle missing optional fields gracefully", () => {
      const minimalPayload: WebhookInput["payload"] = {
        action: "updated",
        type: "prompt-version",
        prompt: {
          id: "prompt-123",
          name: "minimal-prompt",
          version: 1,
          projectId: "project-456",
          type: "chat",
          labels: [],
          tags: [],
          commitMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: "user-123",
          isActive: true,
          prompt: null,
          config: null,
        },
        user: {
          id: "user-123",
          name: null,
          email: "test@example.com",
        },
      };

      const blocks =
        SlackMessageBuilder.buildPromptVersionMessage(minimalPayload);

      expect(blocks).toHaveLength(4); // No commit message section

      // Check "Change author" falls back to email when name is null
      const detailsSection = blocks[2];
      expect(detailsSection.fields[0].text).toBe(
        "*Change author:*\ntest@example.com",
      );

      // Check labels and tags show "None"
      expect(detailsSection.fields[3].text).toBe("*Labels:*\nNone");
      expect(detailsSection.fields[4].text).toBe("*Tags:*\nNone");

      // Ensure no commit message section
      expect(
        blocks.find((block) => block.text?.text?.includes("*Commit Message:*")),
      ).toBeUndefined();
    });

    it("should show 'API User' when user is not provided", () => {
      const apiPayload: WebhookInput["payload"] = {
        action: "created",
        type: "prompt-version",
        prompt: {
          ...mockPromptPayload.prompt,
        },
      };

      const blocks = SlackMessageBuilder.buildPromptVersionMessage(apiPayload);

      const detailsSection = blocks[2];
      expect(detailsSection.fields[0].text).toBe("*Change author:*\nAPI User");
    });

    it("should escape Slack mrkdwn special characters in user name", () => {
      const injectionPayload: WebhookInput["payload"] = {
        action: "created",
        type: "prompt-version",
        prompt: { ...mockPromptPayload.prompt },
        user: {
          id: "user-123",
          name: "<!channel>",
          email: "attacker@example.com",
        },
      };

      const blocks =
        SlackMessageBuilder.buildPromptVersionMessage(injectionPayload);

      const detailsSection = blocks[2];
      expect(detailsSection.fields[0].text).toBe(
        "*Change author:*\n&lt;!channel&gt;",
      );
    });

    it("should fall back to email when name is empty string", () => {
      const emptyNamePayload: WebhookInput["payload"] = {
        action: "created",
        type: "prompt-version",
        prompt: { ...mockPromptPayload.prompt },
        user: {
          id: "user-123",
          name: "",
          email: "alice@example.com",
        },
      };

      const blocks =
        SlackMessageBuilder.buildPromptVersionMessage(emptyNamePayload);

      const detailsSection = blocks[2];
      expect(detailsSection.fields[0].text).toBe(
        "*Change author:*\nalice@example.com",
      );
    });

    it("should generate correct action emojis for different actions", () => {
      const testCases = [
        { action: "created", expectedEmoji: "✨" },
        { action: "updated", expectedEmoji: "📝" },
        { action: "deleted", expectedEmoji: "🗑️" },
        { action: "unknown", expectedEmoji: "📋" },
      ];

      testCases.forEach(({ action, expectedEmoji }) => {
        const payload = { ...mockPromptPayload, action: action as any };
        const blocks = SlackMessageBuilder.buildPromptVersionMessage(payload);

        expect(blocks[0].text.text).toBe(`${expectedEmoji} Prompt ${action}`);
      });
    });

    it("should generate correct URLs for different environments", () => {
      let blocks =
        SlackMessageBuilder.buildPromptVersionMessage(mockPromptPayload);
      expect(blocks[4].elements[0].url).toContain(
        "http://localhost:3000/project/project-456/prompts/test-prompt?version=2",
      );
    });
  });

  describe("buildFallbackMessage", () => {
    it("should build simple fallback message for unknown event types", () => {
      const unknownPayload = {
        action: "triggered",
        type: "unknown-event" as any,
      };

      const blocks = SlackMessageBuilder.buildFallbackMessage(
        unknownPayload as any,
      );

      expect(blocks).toHaveLength(1);

      expect(blocks[0]).toMatchObject({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Langfuse Notification*\nunknown-event event: *triggered*",
        },
      });
    });
  });

  describe("buildMessage", () => {
    it("should route prompt-version events to prompt message builder", () => {
      const blocks = SlackMessageBuilder.buildMessage(mockPromptPayload);

      // Should be a full prompt message (5 blocks with commit message)
      expect(blocks).toHaveLength(5);
      expect(blocks[0].text.text).toContain("Prompt created");
    });

    it("should route unknown events to fallback message builder", () => {
      const unknownPayload = {
        action: "executed",
        type: "trace-evaluation" as any,
      };

      const blocks = SlackMessageBuilder.buildMessage(unknownPayload as any);

      // Should be a fallback message (1 block)
      expect(blocks).toHaveLength(1);
      expect(blocks[0].text.text).toContain("Langfuse Notification");
    });

    it("should handle errors gracefully and return fallback", () => {
      // Create a payload that would cause an error (missing required fields)
      const malformedPayload = {
        action: "created",
        type: "prompt-version",
        prompt: null, // This should cause an error
      } as any;

      const blocks = SlackMessageBuilder.buildMessage(malformedPayload);

      // Should fallback to simple message
      expect(blocks).toHaveLength(1);
      expect(blocks[0].text.text).toContain("Langfuse Notification");
    });
  });
});

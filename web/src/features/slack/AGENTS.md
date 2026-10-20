# Slack

- Render links in Slack messages with `buildSlackLinkSection` (mrkdwn), not Block Kit URL buttons: Slack sends an interaction payload for every button click and shows an error unless the app acknowledges it, and we have no interactivity endpoint.
- Private channels: the bot token sees every private channel it was invited to, so only the installer (`installerUserId`/`installerSlackUserId` on `SlackIntegration`) may list or use private channels they are a member of (`users.conversations`). Saved private channel names are masked server-side for everyone else, and an inaccessible private channel must fail exactly like a non-existent one (`SLACK_CHANNEL_NOT_FOUND_MESSAGE`). Helpers live in `packages/shared/src/server/services/SlackService.ts`.

# Slack Integration Setup Guide

This guide walks you through setting up and testing the Langfuse Slack integration for local development.

## Prerequisites

- Node.js and pnpm installed
- Access to a Slack workspace where you can create apps
- A tunneling tool for a public HTTPS URL (ngrok, or VS Code port forwarding)

## Setup Steps

### 1. Create a Slack App

1. Go to [Slack API Apps page](https://api.slack.com/apps)
2. Click "Create New App" → "From an app manifest"
3. Select your workspace
4. Copy the contents of `app_manifest.json` from this directory and paste it into the manifest editor
5. Click "Create" to create your app

### 2. (Optional) Add App Icon

1. In your Slack app settings, go to "Basic Information"
2. Upload the Langfuse icon from `web/public/icon512.png` as your app's avatar
3. This will make your app more recognizable in Slack

### 3. Configure Environment Variables

1. In your Slack app settings, go to "Basic Information"
2. Copy the **Client ID** and **Client Secret**
3. Generate a random secret using `openssl rand -base64 32 | tr -d "=+/" | cut -c1-32` to use as [state secret](https://docs.slack.dev/tools/node-slack-sdk/oauth/#initialize-the-installer)
4. Add these to your `.env` file:
   ```bash
   SLACK_CLIENT_ID=your_client_id_here
   SLACK_CLIENT_SECRET=your_client_secret_here
   SLACK_STATE_SECRET=your_state_secret_here
   ```

### 4. Expose your local server over a public HTTPS URL

Slack's OAuth flow only redirects back to a **publicly reachable HTTPS URL** —
`http://localhost:3000` is rejected with `bad_redirect_uri`. The simplest way to
get one in dev is a tunnel:

- **ngrok** (`brew install ngrok`):
  ```bash
  ngrok http 3000
  ```
  Use the printed `https://<subdomain>.ngrok-free.app` URL.
- **VS Code port forwarding**: open the **Ports** panel, forward port `3000`,
  and set its visibility to **Public**. Use the printed
  `https://<id>-3000.<region>.devtunnels.ms` URL.

Then point Langfuse and Slack at that URL:

1. Set `NEXTAUTH_URL` in your `.env` to the tunnel URL (it is used to build the
   OAuth `redirect_uri`):
   ```bash
   NEXTAUTH_URL="https://<your-tunnel-host>"
   ```
2. In your Slack app's **OAuth & Permissions** settings, register the redirect
   URL `https://<your-tunnel-host>/api/public/slack/oauth` (the `app_manifest.json`
   ships the `localhost` URL; replace/add your tunnel host).

> Tunnel hosts usually change each run (unless you have a reserved domain), so
> update both `NEXTAUTH_URL` and the Slack redirect URL whenever it changes.

### 5. Start Development Server

From the repository root, run:

```bash
pnpm run dev
```

The tunnel from step 4 terminates TLS and forwards to your local server, so plain
HTTP dev is fine — no local certificates needed.

### 6. Test the Integration

1. Navigate to your Langfuse project settings
2. Look for the Slack integration section
3. Click "Connect to Slack" to initiate the OAuth flow
4. Authorize the app in your Slack workspace
5. Test sending a message using the "Send Test Message" button

## Troubleshooting

### Common Issues

- **`bad_redirect_uri` / "Invalid redirect URI"**: `NEXTAUTH_URL` and the redirect
  URL registered in your Slack app must both be the exact public HTTPS tunnel
  host (`https://<your-tunnel-host>/api/public/slack/oauth`). A `localhost` or
  `http://` value will be rejected. If your tunnel host changed, update both.
- **Environment variables not found**: Verify your `.env` file is in the correct location and contains the Slack credentials

## Features

The Slack integration provides:

- **Real-time alerts**: Get notified about critical errors and anomalies
- **Prompt monitoring**: Receive alerts on prompt edits and creations
- **Direct links**: Jump from Slack messages directly to prompts in Langfuse
- **Channel configuration**: Set up different notification channels per project
- **Test messages**: Verify your integration is working correctly

## Development Notes

- The integration uses Slack's OAuth 2.0 flow for secure authentication
- Webhook endpoints are available at `/api/public/slack/install`
- OAuth callback is handled at `/api/public/slack/oauth`
- All Slack API interactions are handled through the `SlackService` in the shared package

## Production Deployment

For production deployment, ensure:

- Update the OAuth redirect URLs in your Slack app to include your production domain
- Set up proper SSL certificates for your production environment
- Configure environment variables in your production environment

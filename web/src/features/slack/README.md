# Slack Integration Setup Guide

This guide walks you through setting up and testing the Langfuse Slack integration for local development.

## Prerequisites

- Node.js and pnpm installed
- Access to a Slack workspace where you can create apps
- macOS (for mkcert installation)

## Setup Steps

### 1. Create a Slack App

1. Go to [Slack API Apps page](https://api.slack.com/apps)
2. Click "Create New App" → "From an app manifest"
3. Select your workspace
4. Copy the contents of `app_manifest.json` from this directory and paste it into the manifest editor
5. Click "Create" to create your app

### 2. (Optional) Add App Icon

1. In your Slack app settings, go to "Basic Information"
2. Upload the Langfuse icon from `web/public/icon1024.png` as your app's avatar
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

### 4. Set Up HTTPS for Local Development

The Slack OAuth flow requires HTTPS. Set up local certificates:

```bash
# Install mkcert
brew install mkcert

# Install the local CA
mkcert -install

# Generate certificates for localhost
mkcert localhost 127.0.0.1

# Move certificates to web directory
mv localhost+1*.pem web/
```

### 5. Start Development Server

From the repository root, run:

```bash
pnpm run dev:https
```

This starts the Next.js development server with HTTPS enabled on `https://localhost:3000`.

### 6. Test the Integration

1. Navigate to your Langfuse project settings
2. Look for the Slack integration section
3. Click "Connect to Slack" to initiate the OAuth flow
4. Authorize the app in your Slack workspace
5. Test sending a message using the "Send Test Message" button

## Troubleshooting

### Common Issues

- **"Invalid redirect URI"**: Ensure your Slack app's OAuth redirect URLs include `https://localhost:3000/api/public/slack/oauth`
- **Certificate errors**: Make sure you've installed the mkcert CA and moved the certificates to the `web/` directory
- **Environment variables not found**: Verify your `.env` file is in the correct location and contains the Slack credentials

### SSL Certificate Issues

If you encounter SSL certificate warnings in your browser:

1. Make sure you ran `mkcert -install` to install the local CA
2. Try accessing `https://localhost:3000` directly and accept the certificate
3. Restart your development server after certificate changes

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

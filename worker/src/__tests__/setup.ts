// Set whitelist environment variables before any imports to allow test domains
process.env.LANGFUSE_WEBHOOK_WHITELISTED_HOST =
  "webhook.example.com,webhook-error.example.com,webhook-201.example.com,webhook-timeout.example.com,redirect.example.com";

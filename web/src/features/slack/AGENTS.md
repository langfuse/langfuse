# Slack

- Use a link instead of a `LinkButton` for Slack messages as buttons need to follow the Slack user interaction guidelines to stay Slack marketplace compliant: https://docs.slack.dev/interactivity/handling-user-interaction/
- Private channels can't be exposed to anyone who is not in the private channel. E.g. if the app is in channel A but the user who connected the app isn't, then the user shouldn't see channel A

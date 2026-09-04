# Session timeline issues

## Public session authorization

The conversational timeline shares the sidebar's observation chronology,
which is loaded through `events.all`, and hydrates parser input through
`events.batchIO`. `events.all` uses project authentication, unlike the previous
session-specific endpoint, which accepted public-session authorization.

Before enabling this timeline for anonymous public session links, add a
paginated observations path that authorizes against the session grant while
preserving project and session scoping. Do not expose `events.all` broadly or
drop the `sessionId` filter to work around this limitation.

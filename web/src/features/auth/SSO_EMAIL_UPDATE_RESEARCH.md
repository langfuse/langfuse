# SSO User Email Update on Re-Login: Research Report

## Problem Statement

When users authenticate via SSO (Single Sign-On), their identity provider may return a different email address than what was originally stored in Langfuse. This can happen due to:

- Corporate email migrations (e.g., CreditKarma → Intuit)
- Email domain changes after mergers or acquisitions
- User email updates in the identity provider
- Identity provider configuration changes

Currently, Langfuse stores the user's email at first registration and ties the SSO account to that user without automatically updating the email on subsequent logins. This causes users to appear with outdated email addresses.

## Implemented Solution

An opt-in environment flag `AUTH_SSO_UPDATE_USER_EMAIL_ON_LOGIN` that, when enabled, updates the user's stored email to match the SSO provider's email during sign-in.

### Configuration

```bash
AUTH_SSO_UPDATE_USER_EMAIL_ON_LOGIN=true
```

Default: `false` (disabled)

### How It Works

The implementation is optimized to avoid unnecessary database queries:

1. **JWT Callback (runs once per sign-in)**:
   - On initial SSO sign-in, stores the user ID and a `isSsoLogin` flag in the JWT token
   - This allows looking up users by ID instead of email (more robust)

2. **Session Callback (reuses existing query)**:
   - The session callback already queries the database for user data
   - We piggyback on this existing query to compare emails
   - If the SSO-provided email (from `token.email`) differs from the stored email (`dbUser.email`):
     - Checks if the new email is already in use by another user
     - If not in use, updates the user's email
     - Logs the change for audit purposes

This approach:
- Adds only one small DB query on sign-in (to get user ID for the JWT)
- Reuses the existing session query for email comparison
- Only performs the "email exists" check when emails actually differ (rare)

## Security Considerations and Risks

### 1. Account Takeover Risk (Mitigated)

**Risk**: If an attacker gains control of a user's SSO account, they could change the email to one they control.

**Mitigation**:
- The user is still identified by their SSO provider's `providerAccountId`, not email
- Email changes are logged for audit trails
- The SSO provider remains the source of truth for authentication

### 2. Email Collision Risk (Handled)

**Risk**: The new email from SSO might already be used by another Langfuse user.

**Mitigation**:
- Before updating, we check if the new email exists for another user
- If collision detected, the update is blocked and a warning is logged
- The user can still sign in with their existing account

### 3. Audit Trail Loss Risk (Mitigated)

**Risk**: Historical references to the old email might become confusing.

**Mitigation**:
- All email changes are logged with old and new values
- The user's internal ID remains unchanged
- Organizations should implement their own audit logging if needed

### 4. Accidental Email Changes

**Risk**: Temporary SSO misconfigurations could cause unintended email changes.

**Mitigation**:
- Feature is opt-in (disabled by default)
- Changes are logged for review
- Rolling back requires manual database update or SSO re-authentication with correct email

### 5. JWT Token Stale Data

**Risk**: Active sessions may have stale email in their JWT tokens until refresh.

**Mitigation**:
- Sessions are refreshed every 5 minutes (configurable via `AUTH_SESSION_MAX_AGE`)
- The session callback always fetches fresh user data from the database

## Alternative Solutions Considered

### 1. Manual Admin Override

**Approach**: Provide an admin interface to manually update user emails.

**Pros**:
- Full control over changes
- Clear audit trail

**Cons**:
- High operational overhead
- Doesn't scale for bulk migrations
- Delays for users

### 2. User Self-Service Email Update

**Approach**: Allow users to update their own email with verification.

**Pros**:
- User-controlled
- Works for non-SSO users too

**Cons**:
- Adds complexity to the UI
- May conflict with SSO-managed identity
- Verification emails add friction

### 3. Email Alias/Secondary Email

**Approach**: Store multiple emails per user, mark one as primary.

**Pros**:
- Preserves historical data
- Flexible for complex scenarios

**Cons**:
- Significant schema changes required
- Increases complexity throughout the codebase
- Overkill for the primary use case

### 4. Periodic Batch Sync

**Approach**: Scheduled job to sync emails from IdP.

**Pros**:
- Centralized control
- Can include additional validation

**Cons**:
- Requires IdP API access (not always available)
- Delayed updates
- Complex to implement per-provider

### 5. SCIM Provisioning (Existing EE Feature)

**Approach**: Use SCIM protocol for user provisioning and updates.

**Pros**:
- Industry standard
- Bi-directional sync
- Already partially implemented in Langfuse EE

**Cons**:
- Requires IdP SCIM support
- More complex setup
- Enterprise-only feature

## Industry Practices

### How Other Products Handle This

1. **Slack**: Updates email on SSO login, with email change notifications
2. **GitHub**: Keeps SSO identity separate, allows multiple emails
3. **Notion**: Updates email from SSO, logs changes
4. **Linear**: Uses SCIM for enterprise, SSO email updates for others

### OIDC/OAuth2 Best Practices

- The `sub` (subject) claim should be the primary identifier, not email
- Email is considered mutable and should not be used as a unique identifier for SSO
- Most implementations use `provider` + `providerAccountId` (which maps to `sub`) as the stable identifier

## Recommendations

### For Self-Hosted Deployments

1. **Enable the flag** if you have enterprise SSO and expect email migrations
2. **Monitor logs** for email update events
3. **Communicate to users** that their displayed email will update automatically
4. **Consider SCIM** for more sophisticated user lifecycle management

### For Langfuse Cloud

1. Keep the flag **disabled by default** for safety
2. Enable per-organization upon request with documented consent
3. Include email changes in audit logs (if available)

## Testing Recommendations

1. Test with a user who has an existing SSO account
2. Update their email in the identity provider
3. Have them sign in again
4. Verify:
   - Email is updated in the database
   - Session reflects the new email
   - Old invitations/references still work
   - Audit log captures the change

## Conclusion

The implemented solution provides a pragmatic balance between:
- Addressing real-world email migration scenarios
- Maintaining security (opt-in, collision detection, logging)
- Keeping implementation simple and maintainable

For organizations with complex identity management needs, SCIM provisioning remains the recommended approach for full user lifecycle management.

## References

- [OIDC Core Spec - Subject Identifier](https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [SCIM Protocol](https://www.simplecloud.info/)
- [NextAuth.js Account Linking](https://next-auth.js.org/configuration/providers/oauth#allowdangerousemailaccountlinking-option)

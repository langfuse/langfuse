# Last Used Login Feature

This feature implements a "Last Used" bubble that appears on sign-in buttons to indicate which authentication method was previously used by the user for a specific email address.

## Features

- **localStorage Tracking**: Stores successful login attempts in browser localStorage
- **Email-based Matching**: Shows "Last Used" bubble for the authentication method previously used with the current email
- **Multi-provider Support**: Works with all supported authentication providers including:
  - Google, GitHub, GitLab, Azure AD, Okta, Auth0, Cognito, Keycloak, WorkOS
  - Email/Password (credentials)
  - Custom SSO providers
  - Multi-tenant SSO configurations
- **Automatic Cleanup**: Removes expired entries (30+ days old) automatically
- **Privacy-conscious**: Only stores necessary information and respects user privacy

## Implementation Details

### Core Components

1. **`lastUsedLogin.ts`** - Core utilities for managing localStorage data
2. **`useLastUsedLogin.ts`** - React hooks for tracking and retrieving login data
3. **`LastUsedBubble.tsx`** - UI component that displays the "Last Used" badge
4. **`LoginTracker.tsx`** - Background component that completes login tracking

### Data Storage

Login data is stored in localStorage under the key `langfuse_last_used_login` with the following structure:

```typescript
interface LastUsedLogin {
  provider: string;        // e.g., "google", "github", "example.com.okta"
  email: string;          // User's email address
  timestamp: number;      // When the login occurred
  providerName: string;   // Display name (e.g., "Google", "GitHub")
  providerIcon: string;   // Icon identifier for UI
}
```

### Security & Privacy

- **No Sensitive Data**: Only stores provider type, email, and timestamp
- **Automatic Expiry**: Entries older than 30 days are automatically removed
- **Limited Storage**: Maximum of 3 entries are kept
- **Error Handling**: Gracefully handles localStorage errors and corrupted data

### Integration Points

The feature integrates with the existing authentication flow at several points:

1. **Sign-in Page**: `SSOButtons` component shows "Last Used" bubbles
2. **Login Tracking**: Tracks login attempts when users click sign-in buttons
3. **Session Monitoring**: `LoginTracker` component completes tracking on successful auth
4. **Multi-tenant SSO**: Properly handles domain-specific SSO configurations

## Usage

The feature works automatically once integrated. When a user:

1. Enters an email address on the sign-in page
2. The system checks localStorage for previous successful logins with that email
3. If found, a "Last Used" bubble appears next to the corresponding authentication button
4. When the user successfully signs in, the choice is saved/updated in localStorage

## Testing

Run the test suite:

```bash
npm test src/features/auth/__tests__/lastUsedLogin.test.ts
```

The tests cover:
- localStorage operations
- Data validation and cleanup
- Error handling
- Provider name/icon mapping
- Email matching (case-insensitive)

## Configuration

No additional configuration is required. The feature uses sensible defaults:

- **Storage Duration**: 30 days
- **Max Entries**: 3 login methods per user
- **Storage Key**: `langfuse_last_used_login`

These can be modified in `lastUsedLogin.ts` if needed.
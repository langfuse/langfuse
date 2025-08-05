# OmAI HQ Custom Features Documentation

This document outlines the custom features and modifications added to Langfuse by the **OmAI HQ team** (David Halapir and Adrian Punkt). These features extend the base Langfuse functionality to support specialized conversation analytics, user management, and research capabilities.

## Table of Contents

- [Overview](#overview)
- [Custom Navigation & Routing](#custom-navigation--routing)
- [Accounts Management System](#accounts-management-system)
- [Advanced Conversations Feature](#advanced-conversations-feature)
- [Scoring System](#scoring-system)
- [Backend Integrations](#backend-integrations)
- [Database Schema Extensions](#database-schema-extensions)
- [Usage Guide](#usage-guide)
- [Technical Implementation](#technical-implementation)

## Overview

The OmAI HQ customizations focus on:
- **Multi-type user management** (Real, Synthetic, Snapshot users)
- **Advanced conversation analytics** with custom scoring
- **Conversation replay and generation capabilities**
- **Research-oriented data collection and analysis**

### Key Contributors
- **David Halapir** (`halapir.david@gmail.com`) - Backend systems, scoring, user management
- **Adrian Punkt** (`me@adrianpunkt.com`) - Frontend integration, routing, conversation features

## Custom Navigation & Routing

### OMAI-Specific Navigation Routes

**File:** [`web/src/components/layouts/routes.tsx`](web/src/components/layouts/routes.tsx)

```typescript
export const OMAI_ROUTES: Route[] = [
  {
    title: "Go to...",
    pathname: "",
    icon: Search,
    menuNode: <CommandMenuTrigger />,
    section: RouteSection.Main,
  },
  {
    title: "Accounts",
    pathname: `/project/[projectId]/accounts`,
    icon: UserIcon,
    group: RouteGroup.OMAI,
    section: RouteSection.Main,
  },
  {
    title: "Conversations",
    pathname: `/project/[projectId]/conversations`,
    icon: MessageSquare,
    group: RouteGroup.OMAI,
    section: RouteSection.Main,
  },
  // ... other routes
];
```

### Features:
- Dedicated OMAI route group in sidebar navigation
- Admin-only visibility controls
- Custom command menu integration

## Accounts Management System

### Three-Tier User System

**Main Component:** [`web/src/features/accounts/AccountsPage.tsx`](web/src/features/accounts/AccountsPage.tsx)

The system provides three distinct user types:

#### 1. Real Users
- Standard users from Supabase authentication
- Full access to all features
- No special metadata flags

#### 2. Synthetic Users
**Component:** [`web/src/features/accounts/synthetic/SyntheticUsersPage.tsx`](web/src/features/accounts/synthetic/SyntheticUsersPage.tsx)

```typescript
// Auto-generated username pattern
const generateSyntheticUsername = ({name}: {name: string}) => {
  return `synth_${name}_${Date.now()}`;
};

// DJB metadata structure
djb_metadata: {
  synthetic: {
    prompt_name: promptName,
    notes: input.notes,
  },
}
```

**Features:**
- Auto-generated usernames with `synth_` prefix
- Hardcoded passwords for testing environments
- Associated prompt templates for conversation generation
- Custom metadata tracking

#### 3. Snapshot Users
**Component:** [`web/src/features/accounts/snapshot/SnapshotUsersPage.tsx`](web/src/features/accounts/snapshot/SnapshotUsersPage.tsx)

```typescript
// Snapshot users are read-only
<p>
  Snapshot users are automatically created from message views and
  cannot be manually created or edited. They are read-only and
  contain metadata from the original conversation context.
</p>
```

**Features:**
- Auto-created from conversation contexts
- Read-only (cannot be manually created/edited)
- Contains conversation metadata snapshots

### Backend Router

**File:** [`web/src/features/accounts/server/accounts.router.ts`](web/src/features/accounts/server/accounts.router.ts)

Key endpoints:
- `getUsers` - Fetches real users (filters out synthetic/snapshot)
- `getSyntheticUsers` - Fetches users with `synthetic` metadata
- `getSnapshotUsers` - Fetches users with `snapshot` metadata
- `createSyntheticUser` - Creates synthetic users with prompts

## Advanced Conversations Feature

### Conversation View System

**Main Component:** [`web/src/features/conversations/conversation-view/ConversationView.tsx`](web/src/features/conversations/conversation-view/ConversationView.tsx)

#### Recent Conversations Integration
**Component:** [`web/src/features/conversations/conversation-view/RecentConversations.tsx`](web/src/features/conversations/conversation-view/RecentConversations.tsx)

```typescript
export function RecentConversations({
  projectId,
  userId,
  currentSessionId,
}: RecentConversationsProps) {
  const recentConversations = api.conversation.getRecentConversationsForUser.useQuery({
    projectId,
    userId: userId || "",
    limit: 10,
  });
  
  // Shows conversation history for specific users
  // Links to individual conversation sessions
}
```

#### Conversation Replay Functionality
**Component:** [`web/src/features/conversations/table-definition.tsx`](web/src/features/conversations/table-definition.tsx)

```typescript
const handleConfirmReplay = () => {
  const threadId = extractUuidFromSessionId(row.original.id);
  
  replayConversation.mutate({
    threadId: threadId,
    userIdentifier: replayUsername.trim(),
    projectId: projectId,
  });
};
```

**Features:**
- Replay conversations with different usernames
- UUID extraction from session IDs
- Integration with backend replay API

## Scoring System

### Custom Score Configuration

**File:** [`web/src/features/conversations/conversation-view/score-config.ts`](web/src/features/conversations/conversation-view/score-config.ts)

```typescript
export type OmaiScoreConfig = {
  id: string;
  label: string;
  options: readonly string[];
};

export const OMAI_SCORE_CONFIGS: Array<OmaiScoreConfig> = [
  {
    id: "overall-rating",
    label: "Overall Rating & Error Coding",
    options: [
      "Good", "Just Ok", "Not good", "Discussion", "Sycophancy", 
      "Vague", "Leading", "Unnecessary Restating", "Wrong Information",
      "Gears Wrong", "Safety Flag", "Multiple Questions", 
      "Overinterpretation", "Giving Advice", "Inquiry Needed"
    ],
  },
  {
    id: "conversation-indicator", 
    label: "Gears & Good Conversation Indicator",
    options: [
      "Competence", "Checking Comprehension", "Value Alignment",
      "Empathy/Rapport", "Transparency", "Reliability/Consistency",
      "Autonomy Support", "First Gear", "Second Gear", "Third Gear",
      "Experiential Exploration", "Explaining the Method"
    ],
  },
];
```

### Score Color Coding

**File:** [`web/src/features/conversations/conversation-view/score-colors.ts`](web/src/features/conversations/conversation-view/score-colors.ts)

```typescript
export const SCORE_COLORS: Record<string, string> = {
  "Good": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "Not good": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "Just Ok": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  // ... more color mappings
};
```

### Message Scoring Component

The scoring system integrates directly into the conversation view with:
- Multi-select scoring interface
- Real-time score updates
- User-specific score tracking
- Score deletion with confirmation dialogs

## Backend Integrations

### DJB Backend Support

**Environment Variables:**
```typescript
// Multiple environment support
DJB_BACKEND_URL_DEVELOP=<development_url>
DJB_BACKEND_URL_PRODUCTION=<production_url>

// Supabase multi-connection support
SUPABASE_URL_PRIMARY=<primary_supabase_url>
SUPABASE_URL_SECONDARY=<secondary_supabase_url>
```

### Notify Backend Endpoint

**Commit:** `0b65c8ae - David Halapir: add notify backend endpoint`

Custom notification system integration for backend communication.

## Database Schema Extensions

### User Metadata Structure

The system extends the standard User model with custom `djb_metadata`:

```typescript
// For Synthetic Users
djb_metadata: {
  synthetic: {
    prompt_name: string,
    notes: string,
  }
}

// For Snapshot Users  
djb_metadata: {
  snapshot: {
    session_id: string,
    turn_number: number,
    context_data: object,
  }
}
```

### Test Users Table

Additional table for synthetic user authentication:
```sql
test_users (
  id: string,
  username: string, 
  password: string (hashed)
)
```

## Usage Guide

### Creating Synthetic Users

1. Navigate to **Accounts** → **Synthetic Users** tab
2. Click **Create Synthetic User**
3. Provide username and notes
4. System auto-generates:
   - Username with `synth_` prefix
   - Associated prompt template
   - Test user credentials

### Using the Scoring System

1. Open any conversation view
2. Use the scoring interface on each message
3. Select from predefined score categories
4. Scores are color-coded and saved per user
5. Add comments for additional context

### Conversation Replay

1. Go to **Conversations** table
2. Click **Replay** button on any conversation
3. Enter target username for replay
4. System extracts conversation UUID and initiates replay

## Technical Implementation

### Key Technologies
- **Frontend**: Next.js with TypeScript
- **Backend**: TRPC for type-safe APIs
- **Database**: Postgres (Supabase) + ClickHouse
- **UI**: Shadcn/ui components with custom styling
- **Authentication**: Custom user type management

### Code Structure
```
web/src/features/
├── accounts/                 # User management system
│   ├── synthetic/           # Synthetic user components
│   ├── snapshot/            # Snapshot user components
│   └── server/              # Backend router and logic
├── conversations/           # Conversation analytics
│   ├── conversation-view/   # Scoring and comments
│   └── server/              # Conversation APIs
```

### API Endpoints

**Accounts Router:**
- `accounts.getUsers` - Real users
- `accounts.getSyntheticUsers` - Synthetic users  
- `accounts.getSnapshotUsers` - Snapshot users
- `accounts.createSyntheticUser` - Create synthetic user
- `accounts.threadReplay` - Replay conversations

**Conversations Router:**
- `conversation.getSessionTraces` - Get conversation messages
- `conversation.getRecentConversationsForUser` - User conversation history
- `conversation.upsertScore` - Create/update scores
- `conversation.deleteScore` - Delete scores

## Development Notes

### Environment Setup
The OMAI features require additional environment variables for:
- DJB backend integration
- Multiple Supabase connections
- Synthetic user credentials

### Feature Flags
Some OMAI features are controlled by:
- Project admin permissions
- User role checks
- Environment-specific configurations

### Testing
- Synthetic users use hardcoded passwords for testing
- Snapshot users are automatically generated
- Conversation replay supports development/production environments

---

## Recent Changes Summary

Based on git history analysis, the most recent feature developments include:

1. **OMAI-1477**: Tab-based user type navigation
2. **OMAI-1472**: Custom scoring system implementation  
3. **OMAI-1476**: Enhanced conversation view with recent conversations
4. **OMAI-1473**: New sidebar sections and routing

For detailed commit history, see git log with `--author="David Halapir"` and `--author="Adrian Punkt"`.
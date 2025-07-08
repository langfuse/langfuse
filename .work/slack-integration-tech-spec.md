# Langfuse Slack Integration Technical Specification

## 1. System Overview

### Core Purpose and Value Proposition
The Slack integration enables Langfuse users to receive real-time notifications about LLM application events (trace failures, evaluation results, custom alerts) directly in their Slack workspace. This provides a native Slack experience that complements the existing webhook system, allowing teams to stay informed about their AI applications without constantly monitoring the Langfuse dashboard.

### Key Workflows
1. **Slack App Installation**: Project owners connect their Langfuse project to a Slack workspace via OAuth 2.0
2. **Channel Automation Setup**: Users configure multiple channel-specific automations with event filters and Block Kit message templates
3. **Event Processing**: When Langfuse events match automation triggers, formatted messages are sent to designated Slack channels
4. **Message Threading**: Follow-up events create threaded replies for better conversation organization
5. **Token Management**: Secure storage and rotation of Slack OAuth tokens with error handling

### System Architecture
- **Frontend**: React components for Slack connection setup and automation management
- **Backend**: tRPC API routes for OAuth flow, token management, and automation configuration
- **Worker**: Background job processing for message delivery with rate limiting and retry logic
- **Database**: Extended Action/Trigger/Automation schema to support Slack-specific configurations

## 2. Project Structure

### 2.1 Feature Directory Structure
```
web/src/features/slack/
├── components/
│   ├── SlackConnectionBanner.tsx           # Connection status UI
│   ├── SlackOAuthButton.tsx                # OAuth flow initiation
│   ├── SlackChannelSelector.tsx            # Channel selection component
│   ├── SlackMessageTemplateEditor.tsx     # Block Kit template editor
│   ├── SlackAutomationForm.tsx             # Slack-specific automation form
│   └── SlackAutomationList.tsx             # List of Slack automations
├── server/
│   ├── slackRouter.ts                      # Main tRPC router
│   ├── slackOAuthHandler.ts                # OAuth flow handling
│   ├── slackChannelService.ts              # Channel management
│   ├── slackMessageService.ts              # Message formatting & delivery
│   └── slackTokenService.ts                # Token management & validation
├── utils/
│   ├── slackBlockKitSchemas.ts             # Block Kit validation schemas
│   ├── slackMessageTemplates.ts            # Default message templates
│   └── slackRateLimiter.ts                 # Rate limiting utilities
└── types/
    ├── slackTypes.ts                       # Slack-specific TypeScript types
    └── slackWebhookTypes.ts                # Slack webhook payload types
```

### 2.2 Worker Integration
```
worker/src/features/slack/
├── slackMessageDelivery.ts                 # Message delivery service
├── slackMessageFormatting.ts               # Block Kit message formatting
├── slackRateLimitHandler.ts                # Rate limiting & retry logic
└── slackTokenValidator.ts                  # Token validation & refresh
```

### 2.3 Shared Domain Extensions
```
packages/shared/src/domain/
├── automations.ts                          # Extended with Slack action types
└── slack.ts                               # New Slack-specific domain models
```

## 3. Feature Specification

### 3.1 Slack App Setup & OAuth Flow

#### User Story
As a Langfuse project owner, I want to connect my project to a Slack workspace so that I can receive notifications about LLM events in my team's Slack channels.

#### Implementation Steps
1. **Slack App Manifest Creation**
   - Create minimal Slack app with required scopes: `chat:write`, `channels:read`, `groups:read`
   - Configure OAuth redirect URI: `{LANGFUSE_URL}/api/slack/oauth/callback`
   - Set up app distribution for both internal and external use

2. **OAuth Flow Implementation**
   - **Initiate OAuth**: `SlackOAuthButton` component generates secure state parameter and redirects to Slack OAuth
   - **OAuth Callback**: API route `/api/slack/oauth/callback` validates state, exchanges code for tokens
   - **Token Storage**: Securely store bot token with project association in encrypted format
   - **Channel Discovery**: Fetch available channels user has access to via Slack Web API

3. **Connection Status Management**
   - **Connection Banner**: Display current connection status with reconnection option
   - **Token Validation**: Periodic validation of stored tokens with automatic refresh
   - **Error Handling**: Graceful handling of revoked tokens, expired apps, and API errors

#### Error Handling and Edge Cases
- **Invalid State Parameter**: Reject OAuth callback with CSRF protection
- **Token Revocation**: Detect `invalid_auth` errors and pause all automations
- **Rate Limiting**: Handle Slack API rate limits during channel discovery
- **App Uninstall**: Clean up all stored tokens and disable automations

### 3.2 Channel Automation Configuration

#### User Story
As a Langfuse user, I want to create multiple Slack automations for different channels so that relevant team members receive appropriate notifications.

#### Implementation Steps
1. **Channel Selection Interface**
   - **Channel Dropdown**: `SlackChannelSelector` component with real-time channel list
   - **Permission Validation**: Only show channels the installing user belongs to
   - **New Channel Creation**: Option to create `#langfuse-alerts` channel with bot auto-invite

2. **Automation Form Extension**
   - **Reuse Existing UI**: Extend `AutomationForm` to support Slack action type
   - **Event Source Configuration**: Same event source/action/filter system as webhooks
   - **Slack-Specific Fields**: Channel selection, message template, threading preferences

3. **Message Template Editor**
   - **Default Templates**: Pre-configured Block Kit templates for each event type
   - **Advanced Editor**: JSON editor with syntax highlighting for custom templates
   - **Template Validation**: Real-time validation against Slack Block Kit schema
   - **Preview Mode**: Live preview with sample data

#### Error Handling and Edge Cases
- **Channel Access Changes**: Handle cases where bot loses channel access
- **Template Validation**: Prevent invalid Block Kit JSON from being saved
- **Channel Deletion**: Graceful handling when configured channels are deleted
- **Permission Changes**: Detect when user loses channel access and update UI

### 3.3 Message Delivery & Threading

#### User Story
As a Langfuse user, I want to receive well-formatted Slack messages with follow-up updates in threads so that I can easily track event lifecycles.

#### Implementation Steps
1. **Message Formatting Service**
   - **Block Kit Templates**: Convert Langfuse events to rich Block Kit messages
   - **Data Truncation**: Automatically truncate long content with "view full" links
   - **Deep Linking**: Include "Open in Langfuse" buttons with direct links to events
   - **Template Rendering**: Support for dynamic content based on event data

2. **Message Delivery System**
   - **Queue Integration**: Use existing BullMQ infrastructure for reliable delivery
   - **Rate Limiting**: Implement Slack's rate limits (~1 msg/sec/channel)
   - **Retry Logic**: Exponential backoff for failed deliveries with `Retry-After` header handling
   - **Threading Support**: Create parent messages for new events, replies for updates

3. **Message State Management**
   - **Message Tracking**: Store Slack message IDs for threading and updates
   - **Thread Management**: Link follow-up events to original messages via `thread_ts`
   - **Message Updates**: Use `chat.update` for status changes, `chat.postMessage` for new info

#### Error Handling and Edge Cases
- **Rate Limit Exceeded**: Transparent retry without user-facing errors
- **Message Too Large**: Automatic truncation with overflow handling
- **Channel Restrictions**: Handle cases where bot can't post to channel
- **Thread Limits**: Graceful handling of Slack's threading limitations

### 3.4 Token Management & Security

#### User Story
As a security-conscious user, I want my Slack tokens to be stored securely and managed properly so that my workspace remains protected.

#### Implementation Steps
1. **Secure Token Storage**
   - **Encryption**: Use existing `@langfuse/shared/encryption` for token encryption
   - **Database Schema**: Extend Action config to include encrypted Slack tokens
   - **Access Control**: Project-level token isolation with proper RBAC checks

2. **Token Lifecycle Management**
   - **Validation**: Regular token validation with automatic refresh
   - **Rotation**: Handle token rotation events from Slack
   - **Revocation**: Detect and handle token revocation gracefully
   - **Cleanup**: Remove tokens when project is deleted or integration disabled

3. **Multi-tenant Safety**
   - **Project Isolation**: Ensure tokens are scoped to correct projects
   - **User Permissions**: Validate user permissions before token operations
   - **Audit Logging**: Log all token operations for security auditing

#### Error Handling and Edge Cases
- **Token Corruption**: Detect and handle corrupted encrypted tokens
- **Permission Changes**: Handle workspace permission changes affecting bot
- **App Reinstall**: Graceful handling of app reinstallation scenarios
- **Token Expiry**: Automatic refresh of expired tokens

## 4. Database Schema

### 4.1 Extended Action Configuration

#### Action Table Updates
The existing `Action` table's `config` JSONB field will be extended to support Slack configurations:

```typescript
// Existing webhook config
type WebhookActionConfig = {
  type: "WEBHOOK";
  url: string;
  headers: Record<string, string>;
  apiVersion: Record<"prompt", "v1">;
  secretKey: string;
  displaySecretKey: string;
};

// New Slack config
type SlackActionConfig = {
  type: "SLACK";
  workspaceId: string;
  channelId: string;
  channelName: string;
  botToken: string; // encrypted
  messageTemplate: SlackBlockKitTemplate;
  threadingEnabled: boolean;
  displayBotToken: string; // masked version
};
```

### 4.2 Message Tracking Table

#### New SlackMessage Table
```sql
CREATE TABLE "slack_messages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "project_id" TEXT NOT NULL,
  "automation_execution_id" TEXT NOT NULL,
  "slack_channel_id" TEXT NOT NULL,
  "slack_message_ts" TEXT NOT NULL,
  "slack_thread_ts" TEXT,
  "message_type" TEXT NOT NULL, -- 'parent' | 'thread_reply'
  "event_source_id" TEXT NOT NULL,
  
  CONSTRAINT "slack_messages_project_id_fkey" 
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "slack_messages_automation_execution_id_fkey" 
    FOREIGN KEY ("automation_execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE
);

CREATE INDEX "slack_messages_project_id_idx" ON "slack_messages"("project_id");
CREATE INDEX "slack_messages_source_id_idx" ON "slack_messages"("event_source_id");
CREATE INDEX "slack_messages_thread_ts_idx" ON "slack_messages"("slack_thread_ts");
```

### 4.3 Slack Workspace Integration Table

#### New SlackWorkspace Table
```sql
CREATE TABLE "slack_workspaces" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "project_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "workspace_name" TEXT NOT NULL,
  "bot_token" TEXT NOT NULL, -- encrypted
  "bot_user_id" TEXT NOT NULL,
  "installing_user_id" TEXT NOT NULL,
  "token_valid" BOOLEAN NOT NULL DEFAULT true,
  "last_validated_at" TIMESTAMP(3),
  "error_message" TEXT,
  
  CONSTRAINT "slack_workspaces_project_id_fkey" 
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "slack_workspaces_project_id_workspace_id_unique" 
    UNIQUE ("project_id", "workspace_id")
);

CREATE INDEX "slack_workspaces_project_id_idx" ON "slack_workspaces"("project_id");
CREATE INDEX "slack_workspaces_workspace_id_idx" ON "slack_workspaces"("workspace_id");
```

## 5. Server Actions

### 5.1 Database Actions

#### 5.1.1 SlackWorkspace Operations
```typescript
// Create workspace connection
async function createSlackWorkspace(params: {
  projectId: string;
  workspaceId: string;
  workspaceName: string;
  botToken: string;
  botUserId: string;
  installingUserId: string;
}): Promise<SlackWorkspace>

// Get workspace by project
async function getSlackWorkspaceByProject(projectId: string): Promise<SlackWorkspace | null>

// Update token validation status
async function updateTokenValidation(params: {
  projectId: string;
  workspaceId: string;
  isValid: boolean;
  errorMessage?: string;
}): Promise<void>

// Delete workspace connection
async function deleteSlackWorkspace(params: {
  projectId: string;
  workspaceId: string;
}): Promise<void>
```

#### 5.1.2 SlackMessage Operations
```typescript
// Create message tracking record
async function createSlackMessage(params: {
  projectId: string;
  automationExecutionId: string;
  slackChannelId: string;
  slackMessageTs: string;
  slackThreadTs?: string;
  messageType: 'parent' | 'thread_reply';
  eventSourceId: string;
}): Promise<SlackMessage>

// Find parent message for threading
async function findParentMessage(params: {
  projectId: string;
  eventSourceId: string;
  channelId: string;
}): Promise<SlackMessage | null>

// Get thread messages
async function getThreadMessages(params: {
  projectId: string;
  parentMessageTs: string;
}): Promise<SlackMessage[]>
```

### 5.2 Slack API Integrations

#### 5.2.1 OAuth Flow
```typescript
// Exchange OAuth code for tokens
async function exchangeOAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  botToken: string;
  teamId: string;
  teamName: string;
  botUserId: string;
}>

// Validate OAuth state parameter
function validateOAuthState(params: {
  state: string;
  expectedProjectId: string;
  expectedUserId: string;
}): boolean
```

#### 5.2.2 Channel Management
```typescript
// Get channels user has access to
async function getUserChannels(params: {
  botToken: string;
  userId: string;
}): Promise<SlackChannel[]>

// Create new channel
async function createChannel(params: {
  botToken: string;
  name: string;
  isPrivate?: boolean;
}): Promise<SlackChannel>

// Invite bot to channel
async function inviteBotToChannel(params: {
  botToken: string;
  channelId: string;
  botUserId: string;
}): Promise<void>
```

#### 5.2.3 Message Delivery
```typescript
// Send message to channel
async function sendSlackMessage(params: {
  botToken: string;
  channelId: string;
  blocks: SlackBlock[];
  threadTs?: string;
}): Promise<{
  messageTs: string;
  channelId: string;
}>

// Update existing message
async function updateSlackMessage(params: {
  botToken: string;
  channelId: string;
  messageTs: string;
  blocks: SlackBlock[];
}): Promise<void>

// Delete message
async function deleteSlackMessage(params: {
  botToken: string;
  channelId: string;
  messageTs: string;
}): Promise<void>
```

### 5.3 Background Job Processing

#### 5.3.1 Message Delivery Queue
```typescript
// Queue job for message delivery
async function queueSlackMessageDelivery(params: {
  automationExecutionId: string;
  eventData: LangfuseEvent;
  slackConfig: SlackActionConfig;
  projectId: string;
}): Promise<void>

// Process message delivery job
async function processSlackMessageDelivery(job: SlackMessageDeliveryJob): Promise<void>
```

#### 5.3.2 Token Validation Queue
```typescript
// Queue token validation job
async function queueTokenValidation(params: {
  projectId: string;
  workspaceId: string;
}): Promise<void>

// Process token validation job
async function processTokenValidation(job: TokenValidationJob): Promise<void>
```

## 6. Design System

### 6.1 Visual Style

#### Color Palette
- **Slack Brand Colors**: 
  - Primary: `#4A154B` (Slack Purple)
  - Secondary: `#ECB22E` (Slack Yellow)
  - Success: `#2EB67D` (Slack Green)
  - Warning: `#E01E5A` (Slack Red)
- **Integration Status Colors**:
  - Connected: `#10B981` (Emerald-500)
  - Disconnected: `#EF4444` (Red-500)
  - Error: `#F59E0B` (Amber-500)

#### Typography
- **Headers**: Use existing Langfuse typography system
- **Code Blocks**: `font-family: 'JetBrains Mono', monospace` for JSON editor
- **Status Text**: `font-weight: 600` for connection status indicators

#### Component Styling Patterns
- **Connection Cards**: Rounded corners (`border-radius: 8px`), subtle shadows
- **OAuth Buttons**: Slack purple background with white text
- **Status Indicators**: Colored dots with text labels
- **Template Editor**: Dark background for JSON editing with syntax highlighting

#### Spacing and Layout
- **Card Spacing**: `16px` padding for connection cards
- **Form Spacing**: `12px` gap between form elements
- **Button Spacing**: `8px` gap between action buttons
- **List Spacing**: `4px` gap between list items

### 6.2 Core Components

#### Layout Structure
```typescript
// Main Slack integration page
<SlackIntegrationPage>
  <SlackConnectionBanner />
  <SlackAutomationList />
  <SlackAutomationForm />
</SlackIntegrationPage>

// Settings integration
<AutomationSettings>
  <SlackConnectionCard />
  <WebhookConnectionCard />
</AutomationSettings>
```

#### Navigation Patterns
- **Breadcrumb Navigation**: Project Settings → Automations → Slack
- **Tab Navigation**: "Webhooks" | "Slack" tabs in automation interface
- **Modal Navigation**: OAuth flow in popup window

#### Shared Components
```typescript
// Connection status indicator
<ConnectionStatus 
  status="connected" | "disconnected" | "error"
  message?: string
  onReconnect?: () => void
/>

// OAuth connection button
<SlackOAuthButton 
  projectId={string}
  onSuccess={(workspace) => void}
  onError={(error) => void}
/>

// Channel selector with search
<SlackChannelSelector
  workspaceId={string}
  selectedChannelId={string}
  onChannelSelect={(channel) => void}
  allowCreateNew={boolean}
/>

// Message template editor
<SlackTemplateEditor
  template={SlackBlockKitTemplate}
  eventType={EventType}
  onTemplateChange={(template) => void}
  onValidationError={(errors) => void}
/>
```

#### Interactive States
- **Loading States**: Skeleton loaders for channel lists, spinner for OAuth
- **Error States**: Red border with error message below input
- **Success States**: Green checkmark with success message
- **Disabled States**: Grayed out components with tooltip explanations

## 7. Component Architecture

### 7.1 Server Components

#### Data Fetching Strategy
```typescript
// Server-side data fetching for workspace info
async function getSlackWorkspaceData(projectId: string): Promise<{
  workspace: SlackWorkspace | null;
  channels: SlackChannel[];
  automations: SlackAutomation[];
}>;

// Server-side automation list
async function getSlackAutomations(projectId: string): Promise<SlackAutomation[]>;
```

#### Suspense Boundaries
```typescript
// Wrap async components in Suspense
<Suspense fallback={<SkeletonLoader />}>
  <SlackWorkspaceInfo projectId={projectId} />
</Suspense>

<Suspense fallback={<ChannelListSkeleton />}>
  <SlackChannelList workspaceId={workspaceId} />
</Suspense>
```

#### Error Handling
```typescript
// Error boundary for Slack integration
<ErrorBoundary fallback={<SlackErrorFallback />}>
  <SlackIntegrationPanel />
</ErrorBoundary>

// API error handling
async function handleSlackAPIError(error: SlackAPIError): Promise<void> {
  if (error.code === 'invalid_auth') {
    // Trigger token refresh
    await refreshSlackToken(projectId);
  }
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: error.message
  });
}
```

#### Props Interfaces
```typescript
interface SlackWorkspaceInfoProps {
  projectId: string;
  workspace: SlackWorkspace;
}

interface SlackChannelSelectorProps {
  workspaceId: string;
  selectedChannelId?: string;
  onChannelSelect: (channel: SlackChannel) => void;
  allowCreateNew?: boolean;
}

interface SlackTemplateEditorProps {
  template: SlackBlockKitTemplate;
  eventType: EventType;
  onTemplateChange: (template: SlackBlockKitTemplate) => void;
  onValidationError: (errors: string[]) => void;
}
```

### 7.2 Client Components

#### State Management Approach
```typescript
// Use React Query for server state
const { data: workspace, isLoading, error } = api.slack.getWorkspace.useQuery({
  projectId
});

// Use useState for local UI state
const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(null);
const [templateValid, setTemplateValid] = useState(true);
const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
```

#### Event Handlers
```typescript
// OAuth flow completion
const handleOAuthSuccess = useCallback((workspace: SlackWorkspace) => {
  setConnectionStatus('connected');
  showSuccessToast({
    title: 'Slack Connected',
    description: `Successfully connected to ${workspace.name}`
  });
  onConnectionSuccess?.(workspace);
}, [onConnectionSuccess]);

// Channel selection
const handleChannelSelect = useCallback((channel: SlackChannel) => {
  setSelectedChannel(channel);
  form.setValue('channelId', channel.id);
}, [form]);

// Template validation
const handleTemplateChange = useCallback((template: SlackBlockKitTemplate) => {
  const validation = validateBlockKitTemplate(template);
  setTemplateValid(validation.isValid);
  onTemplateChange(template);
}, [onTemplateChange]);
```

#### UI Interactions
```typescript
// Connection flow
const initiateSlackConnection = useCallback(async () => {
  const state = generateOAuthState(projectId, userId);
  const oauthUrl = buildSlackOAuthUrl(state);
  window.open(oauthUrl, 'slack-oauth', 'width=500,height=600');
}, [projectId, userId]);

// Message template preview
const showTemplatePreview = useCallback(() => {
  const sampleData = generateSampleEventData(eventType);
  const renderedTemplate = renderBlockKitTemplate(template, sampleData);
  setPreviewData(renderedTemplate);
  setPreviewModalOpen(true);
}, [template, eventType]);
```

#### Props Interfaces
```typescript
interface SlackOAuthButtonProps {
  projectId: string;
  onSuccess: (workspace: SlackWorkspace) => void;
  onError: (error: Error) => void;
  disabled?: boolean;
}

interface SlackAutomationFormProps {
  projectId: string;
  automation?: SlackAutomation;
  onSubmit: (automation: SlackAutomation) => void;
  onCancel: () => void;
}

interface SlackMessagePreviewProps {
  template: SlackBlockKitTemplate;
  eventData: LangfuseEvent;
  isOpen: boolean;
  onClose: () => void;
}
```

## 8. Authentication & Authorization

### 8.1 Slack OAuth Implementation

#### OAuth 2.0 Flow
```typescript
// Step 1: Generate OAuth URL with state
function generateSlackOAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string;

// Step 2: Handle OAuth callback
async function handleSlackOAuthCallback(params: {
  code: string;
  state: string;
  projectId: string;
  userId: string;
}): Promise<SlackWorkspace>;

// Step 3: Store tokens securely
async function storeSlackTokens(params: {
  projectId: string;
  workspaceId: string;
  botToken: string;
  userToken: string;
}): Promise<void>;
```

#### State Parameter Security
```typescript
// Generate secure state parameter
function generateOAuthState(projectId: string, userId: string): string {
  const timestamp = Date.now();
  const payload = `${projectId}:${userId}:${timestamp}`;
  return encrypt(payload, process.env.OAUTH_STATE_SECRET);
}

// Validate state parameter
function validateOAuthState(state: string, expectedProjectId: string, expectedUserId: string): boolean {
  try {
    const payload = decrypt(state, process.env.OAUTH_STATE_SECRET);
    const [projectId, userId, timestamp] = payload.split(':');
    
    // Check if state is recent (within 10 minutes)
    const isRecent = Date.now() - parseInt(timestamp) < 10 * 60 * 1000;
    
    return projectId === expectedProjectId && 
           userId === expectedUserId && 
           isRecent;
  } catch {
    return false;
  }
}
```

### 8.2 Project-Level Authorization

#### Access Control Integration
```typescript
// Check automation permissions
export const slackAutomationMiddleware = protectedProjectProcedure
  .input(z.object({ projectId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    throwIfNoProjectAccess({
      session: ctx.session,
      projectId: input.projectId,
      scope: "automations:CUD"
    });
    return next();
  });

// Check Slack integration permissions
export const slackIntegrationMiddleware = protectedProjectProcedure
  .input(z.object({ projectId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    throwIfNoProjectAccess({
      session: ctx.session,
      projectId: input.projectId,
      scope: "integrations:CRUD"
    });
    return next();
  });
```

#### Role-Based Access Control
```typescript
// Define Slack-specific permissions
const slackPermissions = {
  'slack:connect': ['OWNER', 'ADMIN'],
  'slack:disconnect': ['OWNER', 'ADMIN'],
  'slack:automation:create': ['OWNER', 'ADMIN', 'MEMBER'],
  'slack:automation:read': ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'],
  'slack:automation:update': ['OWNER', 'ADMIN', 'MEMBER'],
  'slack:automation:delete': ['OWNER', 'ADMIN', 'MEMBER'],
};

// Check specific Slack permissions
function hasSlackPermission(
  userRole: Role,
  permission: keyof typeof slackPermissions
): boolean {
  return slackPermissions[permission].includes(userRole);
}
```

### 8.3 Token Security

#### Encryption Strategy
```typescript
// Encrypt Slack tokens before storage
async function encryptSlackToken(token: string): Promise<string> {
  return encrypt(token, process.env.SLACK_TOKEN_SECRET);
}

// Decrypt tokens for API calls
async function decryptSlackToken(encryptedToken: string): Promise<string> {
  return decrypt(encryptedToken, process.env.SLACK_TOKEN_SECRET);
}

// Rotate encryption keys
async function rotateSlackTokens(oldSecret: string, newSecret: string): Promise<void> {
  // Batch update all encrypted tokens with new secret
  const workspaces = await prisma.slackWorkspace.findMany();
  
  for (const workspace of workspaces) {
    const decryptedToken = decrypt(workspace.botToken, oldSecret);
    const reencryptedToken = encrypt(decryptedToken, newSecret);
    
    await prisma.slackWorkspace.update({
      where: { id: workspace.id },
      data: { botToken: reencryptedToken }
    });
  }
}
```

## 9. Data Flow

### 9.1 Server/Client Data Flow

#### OAuth Connection Flow
```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server
    participant Slack as Slack API
    
    U->>C: Click "Connect Slack"
    C->>S: Generate OAuth URL
    S->>C: Return OAuth URL with state
    C->>Slack: Redirect to OAuth
    Slack->>S: OAuth callback with code
    S->>Slack: Exchange code for tokens
    Slack->>S: Return bot token
    S->>S: Encrypt and store tokens
    S->>C: Return workspace info
    C->>U: Show connection success
```

#### Message Delivery Flow
```mermaid
sequenceDiagram
    participant E as Event Source
    participant T as Trigger
    participant W as Worker
    participant S as Slack API
    
    E->>T: Langfuse event occurs
    T->>T: Check automation filters
    T->>W: Queue Slack message job
    W->>W: Format Block Kit message
    W->>S: Send message to channel
    S->>W: Return message timestamp
    W->>W: Store message for threading
```

### 9.2 State Management Architecture

#### Client State Management
```typescript
// Global state for Slack integration
const slackIntegrationState = {
  // Connection state
  workspace: SlackWorkspace | null,
  connectionStatus: 'connected' | 'disconnected' | 'error',
  
  // UI state
  isConnecting: boolean,
  selectedChannel: SlackChannel | null,
  templateEditorOpen: boolean,
  previewModalOpen: boolean,
  
  // Form state
  activeAutomation: SlackAutomation | null,
  formErrors: Record<string, string>,
  isSubmitting: boolean,
};

// State update actions
const actions = {
  setWorkspace: (workspace: SlackWorkspace) => void,
  setConnectionStatus: (status: ConnectionStatus) => void,
  setSelectedChannel: (channel: SlackChannel) => void,
  setActiveAutomation: (automation: SlackAutomation) => void,
  resetState: () => void,
};
```

#### Server State Synchronization
```typescript
// React Query integration
const useSlackWorkspace = (projectId: string) => {
  return api.slack.getWorkspace.useQuery(
    { projectId },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        if (error.data?.code === 'UNAUTHORIZED') return false;
        return failureCount < 3;
      },
    }
  );
};

// Optimistic updates
const useSlackAutomationMutations = () => {
  const utils = api.useUtils();
  
  return api.slack.createAutomation.useMutation({
    onMutate: async (newAutomation) => {
      // Cancel outgoing queries
      await utils.slack.getAutomations.cancel();
      
      // Optimistically update cache
      const previousAutomations = utils.slack.getAutomations.getData();
      utils.slack.getAutomations.setData(previousAutomations => [
        ...previousAutomations,
        newAutomation
      ]);
      
      return { previousAutomations };
    },
    onError: (error, newAutomation, context) => {
      // Revert optimistic update
      utils.slack.getAutomations.setData(context.previousAutomations);
    },
    onSettled: () => {
      // Refetch to ensure consistency
      utils.slack.getAutomations.invalidate();
    },
  });
};
```

## 10. Testing Strategy

### 10.1 Unit Tests with Jest

#### Slack Service Tests
```typescript
// Test Slack OAuth flow
describe('SlackOAuthService', () => {
  it('should generate valid OAuth URL', () => {
    const url = generateSlackOAuthUrl({
      clientId: 'test-client-id',
      redirectUri: 'http://localhost:3000/callback',
      state: 'encrypted-state',
      scopes: ['chat:write', 'channels:read']
    });
    
    expect(url).toContain('https://slack.com/oauth/v2/authorize');
    expect(url).toContain('client_id=test-client-id');
    expect(url).toContain('scope=chat:write,channels:read');
  });
  
  it('should validate OAuth state correctly', () => {
    const validState = generateOAuthState('project-1', 'user-1');
    const isValid = validateOAuthState(validState, 'project-1', 'user-1');
    
    expect(isValid).toBe(true);
  });
  
  it('should reject expired OAuth state', () => {
    // Mock Date.now to return time from 15 minutes ago
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(fifteenMinutesAgo);
    
    const expiredState = generateOAuthState('project-1', 'user-1');
    
    // Restore current time
    jest.spyOn(Date, 'now').mockRestore();
    
    const isValid = validateOAuthState(expiredState, 'project-1', 'user-1');
    expect(isValid).toBe(false);
  });
});
```

#### Block Kit Template Tests
```typescript
// Test message template rendering
describe('SlackMessageTemplates', () => {
  const sampleTraceEvent = {
    type: 'trace',
    action: 'created',
    data: {
      id: 'trace-123',
      name: 'Test Trace',
      status: 'ERROR',
      projectId: 'project-1'
    }
  };
  
  it('should render trace event template correctly', () => {
    const template = getDefaultTemplate('trace');
    const rendered = renderBlockKitTemplate(template, sampleTraceEvent);
    
    expect(rendered.blocks).toHaveLength(2);
    expect(rendered.blocks[0].type).toBe('header');
    expect(rendered.blocks[0].text.text).toContain('Test Trace');
  });
  
  it('should truncate long content', () => {
    const longContent = 'x'.repeat(3000);
    const eventWithLongContent = {
      ...sampleTraceEvent,
      data: { ...sampleTraceEvent.data, input: longContent }
    };
    
    const template = getDefaultTemplate('trace');
    const rendered = renderBlockKitTemplate(template, eventWithLongContent);
    
    const contentBlock = rendered.blocks.find(b => b.type === 'section');
    expect(contentBlock.text.text.length).toBeLessThan(3000);
    expect(contentBlock.text.text).toContain('...');
  });
  
  it('should validate Block Kit schema', () => {
    const invalidTemplate = {
      blocks: [
        { type: 'invalid_type', text: 'Invalid block' }
      ]
    };
    
    const validation = validateBlockKitTemplate(invalidTemplate);
    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('Invalid block type');
  });
});
```

#### Rate Limiting Tests
```typescript
// Test rate limiting logic
describe('SlackRateLimiter', () => {
  let rateLimiter: SlackRateLimiter;
  
  beforeEach(() => {
    rateLimiter = new SlackRateLimiter();
  });
  
  it('should allow messages within rate limit', async () => {
    const canSend = await rateLimiter.canSendMessage('channel-1');
    expect(canSend).toBe(true);
  });
  
  it('should throttle messages exceeding rate limit', async () => {
    // Send messages up to rate limit
    for (let i = 0; i < 50; i++) {
      await rateLimiter.recordMessage('channel-1');
    }
    
    const canSend = await rateLimiter.canSendMessage('channel-1');
    expect(canSend).toBe(false);
  });
  
  it('should reset rate limit after time window', async () => {
    // Fill up rate limit
    for (let i = 0; i < 50; i++) {
      await rateLimiter.recordMessage('channel-1');
    }
    
    // Mock time advancement
    jest.advanceTimersByTime(60 * 1000); // 1 minute
    
    const canSend = await rateLimiter.canSendMessage('channel-1');
    expect(canSend).toBe(true);
  });
});
```

### 10.2 Integration Tests

#### OAuth Flow Integration
```typescript
// Test complete OAuth flow
describe('Slack OAuth Integration', () => {
  it('should complete OAuth flow successfully', async () => {
    const mockOAuthResponse = {
      access_token: 'xoxb-mock-token',
      team: { id: 'T123456', name: 'Test Team' },
      bot_user_id: 'U123456'
    };
    
    // Mock Slack API
    nock('https://slack.com')
      .post('/api/oauth.v2.access')
      .reply(200, mockOAuthResponse);
    
    const result = await handleSlackOAuthCallback({
      code: 'oauth-code',
      state: validState,
      projectId: 'project-1',
      userId: 'user-1'
    });
    
    expect(result.workspaceId).toBe('T123456');
    expect(result.workspaceName).toBe('Test Team');
  });
  
  it('should handle OAuth errors gracefully', async () => {
    nock('https://slack.com')
      .post('/api/oauth.v2.access')
      .reply(400, { error: 'invalid_code' });
    
    await expect(handleSlackOAuthCallback({
      code: 'invalid-code',
      state: validState,
      projectId: 'project-1',
      userId: 'user-1'
    })).rejects.toThrow('Invalid OAuth code');
  });
});
```

#### Message Delivery Integration
```typescript
// Test message delivery end-to-end
describe('Slack Message Delivery', () => {
  it('should deliver message to Slack channel', async () => {
    const mockSlackResponse = {
      ok: true,
      channel: 'C123456',
      ts: '1234567890.123456'
    };
    
    nock('https://slack.com')
      .post('/api/chat.postMessage')
      .reply(200, mockSlackResponse);
    
    const result = await sendSlackMessage({
      botToken: 'xoxb-mock-token',
      channelId: 'C123456',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Test Message' }
        }
      ]
    });
    
    expect(result.messageTs).toBe('1234567890.123456');
    expect(result.channelId).toBe('C123456');
  });
  
  it('should handle rate limiting with retry', async () => {
    // First call returns rate limit error
    nock('https://slack.com')
      .post('/api/chat.postMessage')
      .reply(429, { 
        error: 'rate_limited',
        headers: { 'Retry-After': '30' }
      });
    
    // Second call succeeds
    nock('https://slack.com')
      .post('/api/chat.postMessage')
      .reply(200, { ok: true, ts: '1234567890.123456' });
    
    const result = await sendSlackMessage({
      botToken: 'xoxb-mock-token',
      channelId: 'C123456',
      blocks: []
    });
    
    expect(result.messageTs).toBe('1234567890.123456');
  });
});
```

### 10.3 End-to-End Tests

#### Complete Automation Flow
```typescript
// Test complete automation setup and execution
describe('Slack Automation E2E', () => {
  it('should create and execute Slack automation', async () => {
    // Setup: Create Slack workspace connection
    const workspace = await createSlackWorkspace({
      projectId: 'project-1',
      workspaceId: 'T123456',
      botToken: 'xoxb-mock-token'
    });
    
    // Create Slack automation
    const automation = await createSlackAutomation({
      projectId: 'project-1',
      name: 'Test Slack Automation',
      eventSource: 'trace',
      eventActions: ['created'],
      channelId: 'C123456',
      messageTemplate: defaultTraceTemplate
    });
    
    // Mock Slack API for message delivery
    nock('https://slack.com')
      .post('/api/chat.postMessage')
      .reply(200, { ok: true, ts: '1234567890.123456' });
    
    // Trigger automation with trace event
    await triggerAutomation({
      projectId: 'project-1',
      eventType: 'trace',
      eventAction: 'created',
      eventData: {
        id: 'trace-123',
        name: 'Test Trace',
        status: 'ERROR'
      }
    });
    
    // Verify message was sent
    expect(nock.isDone()).toBe(true);
    
    // Verify message tracking record was created
    const slackMessage = await prisma.slackMessage.findFirst({
      where: { eventSourceId: 'trace-123' }
    });
    expect(slackMessage).toBeTruthy();
    expect(slackMessage.slackMessageTs).toBe('1234567890.123456');
  });
});
```
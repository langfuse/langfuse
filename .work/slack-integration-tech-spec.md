# Langfuse Slack Integration Technical Specification

## 1. System Overview

### Core Purpose and Value Proposition

The Slack integration enables Langfuse users to receive real-time notifications about LLM application events (trace failures, evaluation results, custom alerts) directly in their Slack workspace. This provides a native Slack experience that complements the existing webhook system, allowing teams to stay informed about their AI applications without constantly monitoring the Langfuse dashboard.

### Key Workflows

1. **Slack OAuth Connection**: Project owners connect their Langfuse project to a Slack workspace via simple OAuth 2.0 flow
2. **Channel Automation Setup**: Users create Slack automations using the existing automation form with new Slack action type
3. **Event Processing**: When Langfuse events match automation triggers, formatted Block Kit messages are sent to designated Slack channels
4. **Token Management**: Secure centralized storage of Slack OAuth tokens using existing Action config encryption patterns

### System Architecture

- **Frontend**: Extend existing automation UI components with Slack action type support
- **Backend**: Extend existing tRPC automation router with Slack OAuth and channel management
- **Worker**: Extend existing automation execution system to handle Slack message delivery
- **Database**: New `slack_integrations` table for centralized token storage, extend existing Action schema

## 2. Project Structure

### 2.1 Minimal Feature Extensions

```
web/src/features/automations/
├── components/
│   ├── automationForm.tsx              # EXTEND: Add Slack action type case
│   └── actions/
│       ├── SlackActionForm.tsx         # NEW: Slack-specific configuration form
│       └── SlackOAuthButton.tsx        # NEW: OAuth connection button
├── server/
│   ├── router.ts                       # EXTEND: Add Slack OAuth and channel routes
│   └── slackService.ts                 # NEW: Simple Slack Web API wrapper
└── utils/
    └── slackTemplates.ts               # NEW: Default Block Kit message templates

web/src/pages/api/slack/
└── oauth.ts                            # NEW: Single OAuth callback handler

worker/src/features/automations/
└── slackExecutor.ts                    # NEW: Slack message delivery executor

packages/shared/src/domain/
└── automations.ts                      # EXTEND: Add SlackActionConfig type

packages/shared/prisma/
├── schema.prisma                       # EXTEND: Add SlackIntegration model
└── migrations/
    └── [timestamp]_add_slack_integration.sql  # NEW: Database migration
```

### 2.2 Shared Domain Extensions

```typescript
// Extend existing packages/shared/src/domain/automations.ts
export const SlackActionConfigSchema = z.object({
  type: z.literal("SLACK"),
  channelId: z.string(),
  channelName: z.string(),
  messageTemplate: z.record(z.any()).optional(), // Block Kit JSON
});

export const ActionTypeSchema = z.enum(["WEBHOOK", "SLACK"]);
export const ActionConfigSchema = z.discriminatedUnion("type", [
  WebhookActionConfigSchema,
  SlackActionConfigSchema,
]);
```

## 3. Dependencies

### 3.1 New Dependencies

```json
{
  "dependencies": {
    "@slack/web-api": "^7.0.0",
    "@slack/oauth": "^2.6.0"
  }
}
```

### 3.2 Environment Variables

```bash
# Required for Slack OAuth
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_OAUTH_REDIRECT_URI=https://your-domain.com/api/slack/callback
```

## 4. Implementation Details

### 4.1 Database Schema

#### 4.1.1 New Slack Integration Table

```typescript
// packages/shared/prisma/schema.prisma
model SlackIntegration {
  id        String   @id @default(cuid())
  projectId String   @unique @map("project_id")
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Installation details (encrypted)
  teamId    String   @map("team_id")
  teamName  String   @map("team_name")
  botToken  String   @map("bot_token") // encrypted
  botUserId String   @map("bot_user_id")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("slack_integrations")
}
```

#### 4.1.2 Extend Existing Action Types

```typescript
// Extend packages/shared/src/domain/automations.ts
export type SlackActionConfig = {
  type: "SLACK";
  channelId: string;
  channelName: string;
  messageTemplate: string; // Block Kit JSON template
};

// Add to existing ActionConfig discriminated union
export type ActionConfig = WebhookActionConfig | SlackActionConfig; // Add this line
```

### 4.2 Core Service Implementation

#### 4.2.1 Slack Service with Official Libraries and Installation Store

```typescript
// web/src/features/automations/server/slackService.ts
import { WebClient } from "@slack/web-api";
import { InstallProvider } from "@slack/oauth";
import { encrypt, decrypt } from "@/src/utils/encryption";

export class SlackService {
  private static getOAuthProvider() {
    return new InstallProvider({
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
      stateSecret: process.env.SLACK_STATE_SECRET!,
      installationStore: {
        // Store installation in our database
        storeInstallation: async (installation, installOptions) => {
          const projectId = installOptions.metadata as string;

          await prisma.slackIntegration.upsert({
            where: { projectId },
            create: {
              projectId,
              teamId: installation.team?.id!,
              teamName: installation.team?.name!,
              botToken: encrypt(installation.bot?.token!),
              botUserId: installation.bot?.userId!,
            },
            update: {
              teamId: installation.team?.id!,
              teamName: installation.team?.name!,
              botToken: encrypt(installation.bot?.token!),
              botUserId: installation.bot?.userId!,
            },
          });
        },

        // Fetch installation for SDK operations
        fetchInstallation: async (installQuery) => {
          const integration = await prisma.slackIntegration.findUnique({
            where: { projectId: installQuery.projectId },
          });

          if (!integration) {
            throw new Error("Slack integration not found");
          }

          return {
            team: { id: integration.teamId, name: integration.teamName },
            bot: {
              token: decrypt(integration.botToken),
              userId: integration.botUserId,
            },
          };
        },
      },
    });
  }

  static async generateOAuthUrl(projectId: string): Promise<string> {
    const installer = this.getOAuthProvider();

    return installer.generateInstallUrl({
      scopes: ["channels:read", "chat:write", "chat:write.public"],
      userScopes: [],
      metadata: projectId, // Pass project ID in metadata
    });
  }

  static async exchangeOAuthCode(params: {
    code: string;
    state: string;
  }): Promise<{
    botToken: string;
    teamId: string;
    teamName: string;
    botUserId: string;
    projectId: string;
  }> {
    const installer = this.getOAuthProvider();

    const installation = await installer.handleCallback(
      { code: params.code, state: params.state },
      {}, // No additional options needed
      {
        success: async (installation, installOptions, callbackOptions) => {
          return {
            botToken: installation.bot?.token!,
            teamId: installation.team?.id!,
            teamName: installation.team?.name!,
            botUserId: installation.bot?.userId!,
            projectId: installOptions.metadata as string,
          };
        },
        failure: async (error, installOptions, callbackOptions) => {
          throw new Error(`OAuth failed: ${error.message}`);
        },
      },
    );

    return installation;
  }

  static async getChannels(botToken: string): Promise<SlackChannel[]> {
    const client = new WebClient(botToken);

    try {
      const result = await client.conversations.list({
        exclude_archived: true,
        types: "public_channel,private_channel",
      });

      return (
        result.channels?.map((channel) => ({
          id: channel.id!,
          name: channel.name!,
          isPrivate: channel.is_private || false,
          isMember: channel.is_member || false,
        })) || []
      );
    } catch (error) {
      throw new Error(`Failed to fetch channels: ${error.message}`);
    }
  }

  static async sendMessage(params: {
    botToken: string;
    channelId: string;
    blocks: any[];
    text?: string;
  }): Promise<{ messageTs: string }> {
    const client = new WebClient(params.botToken);

    try {
      const result = await client.chat.postMessage({
        channel: params.channelId,
        blocks: params.blocks,
        text: params.text || "Langfuse Notification",
        unfurl_links: false,
        unfurl_media: false,
      });

      if (!result.ok) {
        throw new Error(`Failed to send message: ${result.error}`);
      }

      return { messageTs: result.ts! };
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  static async validateToken(botToken: string): Promise<boolean> {
    const client = new WebClient(botToken);

    try {
      const result = await client.auth.test();
      return result.ok || false;
    } catch {
      return false;
    }
  }
}
```

#### 4.2.2 Action Management with Centralized Tokens

```typescript
// Extend existing action management patterns
export async function createSlackAction(params: {
  projectId: string;
  triggerId: string;
  slackConfig: SlackActionConfig;
}): Promise<Action> {
  // Verify Slack integration exists for project
  const integration = await prisma.slackIntegration.findUnique({
    where: { projectId: params.projectId },
  });

  if (!integration) {
    throw new Error("Slack integration not found for project");
  }

  return prisma.action.create({
    data: {
      projectId: params.projectId,
      triggerId: params.triggerId,
      type: "SLACK",
      config: slackConfig, // No token storage needed in action config
    },
  });
}

// Reuse existing action CRUD operations - no new operations needed
```

### 5.3 Worker Integration

#### 5.3.1 Slack Action Executor with Centralized Tokens

```typescript
// Extend existing automation execution patterns
export async function executeSlackAction(
  action: ActionDomain,
  eventData: any,
  automationExecutionId: string,
): Promise<void> {
  if (action.config.type !== "SLACK") return;

  try {
    // Get centralized installation
    const integration = await prisma.slackIntegration.findUnique({
      where: { projectId: action.projectId },
    });

    if (!integration) {
      throw new Error("Slack integration not found for project");
    }

    // Decrypt bot token
    const botToken = decrypt(integration.botToken);

    // Format message using template
    const blocks = formatEventAsBlocks(
      eventData,
      action.config.messageTemplate,
    );

    // Send message using Web API client
    const result = await SlackService.sendMessage({
      botToken,
      channelId: action.config.channelId,
      blocks,
    });

    // Log success (reuse existing automation execution logging)
    await logAutomationExecution({
      automationExecutionId,
      status: "SUCCESS",
      response: { messageTs: result.messageTs },
    });
  } catch (error) {
    // Log failure (reuse existing error handling)
    await logAutomationExecution({
      automationExecutionId,
      status: "ERROR",
      error: error.message,
    });
    throw error;
  }
}
```

## 5. API Routes

### 5.1 OAuth Routes with Slack Libraries

#### 5.1.1 OAuth Initiation

```typescript
// pages/api/slack/oauth.ts
import { SlackService } from "@/src/features/automations/server/slackService";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId } = req.query;

  if (!projectId || typeof projectId !== "string") {
    return res.status(400).json({ error: "Project ID required" });
  }

  try {
    const oauthUrl = await SlackService.generateOAuthUrl(projectId);
    return res.json({ oauthUrl });
  } catch (error) {
    console.error("OAuth URL generation failed:", error);
    return res.status(500).json({ error: "Failed to generate OAuth URL" });
  }
}
```

#### 5.1.2 OAuth Callback

```typescript
// pages/api/slack/callback.ts
import { SlackService } from "@/src/features/automations/server/slackService";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, state } = req.query;

  if (
    !code ||
    !state ||
    typeof code !== "string" ||
    typeof state !== "string"
  ) {
    return res.status(400).json({ error: "Invalid OAuth parameters" });
  }

  try {
    const result = await SlackService.exchangeOAuthCode({ code, state });

    // Redirect back to automation form with success data
    const successUrl = new URL(
      "/project/" + result.projectId + "/automations",
      req.headers.origin,
    );
    successUrl.searchParams.set("slack_success", "true");
    successUrl.searchParams.set("slack_data", JSON.stringify(result));

    return res.redirect(successUrl.toString());
  } catch (error) {
    console.error("OAuth callback failed:", error);

    // Redirect back with error
    const errorUrl = new URL(
      "/project/" + req.query.projectId + "/automations",
      req.headers.origin,
    );
    errorUrl.searchParams.set("slack_error", error.message);

    return res.redirect(errorUrl.toString());
  }
}
```

## 6. Design System

### 6.1 Visual Style

#### Color Palette

- **Slack Brand Integration**:
  - Primary: `#4A154B` (Slack Purple) for OAuth buttons
  - Success: `#2EB67D` (Slack Green) for connected status
  - Warning: `#E01E5A` (Slack Red) for errors
- **Consistent with Langfuse**: Use existing color variables for all other elements

#### Typography

- **Reuse Existing**: Follow existing Langfuse typography system
- **Code Blocks**: Use existing JSON editor styling for Block Kit templates
- **Status Indicators**: Use existing badge/chip styling patterns

#### Component Styling Patterns

- **Form Sections**: Reuse existing automation form styling
- **OAuth Integration**: Style Slack OAuth button to match existing external integration patterns
- **Status Displays**: Use existing connection status patterns from other integrations

### 6.2 Core Components

#### Layout Structure

```typescript
// Extend existing automation form
<AutomationForm>
  {/* Existing trigger configuration */}
  <TriggerSection />

  {/* Extended action section */}
  <ActionSection>
    <ActionTypeSelector /> {/* Add "SLACK" option */}

    {actionType === "SLACK" && (
      <SlackActionForm
        value={actionConfig}
        onChange={setActionConfig}
        projectId={projectId}
      />
    )}
  </ActionSection>
</AutomationForm>
```

#### Slack-Specific Components

```typescript
// SlackActionForm Component
interface SlackActionFormProps {
  value: SlackActionConfig;
  onChange: (config: SlackActionConfig) => void;
  projectId: string;
}

// SlackOAuthButton Component
interface SlackOAuthButtonProps {
  projectId: string;
  onSuccess: (tokens: SlackOAuthResult) => void;
  onError: (error: Error) => void;
}

// SlackChannelSelector Component
interface SlackChannelSelectorProps {
  botToken: string;
  selectedChannelId?: string;
  onChannelSelect: (channel: SlackChannel) => void;
}
```

#### Interactive States

- **Loading States**: Reuse existing skeleton loaders and spinners
- **Error States**: Use existing error message styling and patterns
- **Success States**: Use existing success indicators
- **Connection Status**: Extend existing integration status patterns

## 7. Component Architecture

### 7.1 Server Components

#### Data Fetching Strategy

```typescript
// Extend existing automation data fetching patterns
export const slackRouter = createTRPCRouter({
  // Extend existing automation routes
  getChannels: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        botToken: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return SlackService.getChannels(input.botToken);
    }),

  oauthExchange: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        code: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      return SlackService.exchangeOAuthCode({
        code: input.code,
        clientId: process.env.SLACK_CLIENT_ID!,
        clientSecret: process.env.SLACK_CLIENT_SECRET!,
      });
    }),
});
```

#### Error Handling

```typescript
// Reuse existing tRPC error handling patterns
export const slackMiddleware = protectedProjectProcedure.use(
  async ({ ctx, next }) => {
    try {
      return await next();
    } catch (error) {
      if (error.message.includes("invalid_auth")) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Slack token is invalid. Please reconnect.",
        });
      }
      throw error;
    }
  },
);
```

### 7.2 Client Components

#### State Management Approach

```typescript
// Extend existing automation form state patterns
const SlackActionForm: React.FC<SlackActionFormProps> = ({
  value,
  onChange,
  projectId
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [channels, setChannels] = useState<SlackChannel[]>([]);

  // Use existing tRPC patterns
  const { mutate: exchangeOAuth } = api.slack.oauthExchange.useMutation({
    onSuccess: (result) => {
      onChange({
        ...value,
        channelId: result.channelId,
        channelName: result.channelName,
      });
      setIsConnecting(false);
    },
    onError: (error) => {
      showErrorToast(error.message);
      setIsConnecting(false);
    }
  });

  // Reuse existing form patterns
  return (
    <div className="space-y-4">
      {!value.channelId ? (
        <SlackOAuthButton
          projectId={projectId}
          onSuccess={(result) => exchangeOAuth({ projectId, code: result.code })}
          isLoading={isConnecting}
        />
      ) : (
        <>
          <ConnectionStatus team={value.teamName} />
          <SlackChannelSelector
            botToken={value.botToken}
            selectedChannelId={value.channelId}
            onChannelSelect={(channel) =>
              onChange({ ...value, channelId: channel.id, channelName: channel.name })
            }
          />
          <MessageTemplateEditor
            template={value.messageTemplate}
            onChange={(template) => onChange({ ...value, messageTemplate: template })}
          />
        </>
      )}
    </div>
  );
};
```

#### Event Handlers

```typescript
// OAuth flow handling
const handleOAuthClick = useCallback(() => {
  const state = generateOAuthState(projectId, userId);
  const oauthUrl =
    `https://slack.com/oauth/v2/authorize?` +
    `client_id=${process.env.NEXT_PUBLIC_SLACK_CLIENT_ID}&` +
    `scope=chat:write,channels:read&` +
    `state=${state}&` +
    `redirect_uri=${encodeURIComponent(window.location.origin + "/api/slack/oauth")}`;

  window.open(oauthUrl, "slack-oauth", "width=500,height=600");
}, [projectId, userId]);

// Channel selection handling
const handleChannelSelect = useCallback(
  (channel: SlackChannel) => {
    onChange({
      ...value,
      channelId: channel.id,
      channelName: channel.name,
    });
  },
  [value, onChange],
);
```

## 8. Authentication & Authorization

### 8.1 OAuth Implementation

#### Simple OAuth Flow

```typescript
// pages/api/slack/oauth.ts
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/automations?slack_error=${error}`);
  }

  try {
    // Validate state parameter (reuse existing CSRF protection patterns)
    const { projectId } = validateOAuthState(state as string);

    // Exchange code for tokens using SDK installation store
    const tokens = await SlackService.exchangeOAuthCode({
      code: code as string,
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
    });

    // Store in session for form pickup (reuse existing session patterns)
    req.session.slackTokens = tokens;
    await req.session.save();

    res.redirect(
      `/project/${projectId}/settings/automations?slack_connected=true`,
    );
  } catch (error) {
    res.redirect(`/automations?slack_error=${error.message}`);
  }
}
```

#### State Parameter Security

```typescript
// Reuse existing CSRF protection patterns
function generateOAuthState(projectId: string, userId: string): string {
  const payload = JSON.stringify({ projectId, userId, timestamp: Date.now() });
  return encrypt(payload, process.env.OAUTH_STATE_SECRET!);
}

function validateOAuthState(state: string): {
  projectId: string;
  userId: string;
} {
  try {
    const decrypted = decrypt(state, process.env.OAUTH_STATE_SECRET!);
    const { projectId, userId, timestamp } = JSON.parse(decrypted);

    // Check if state is recent (within 10 minutes)
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      throw new Error("OAuth state expired");
    }

    return { projectId, userId };
  } catch (error) {
    throw new Error("Invalid OAuth state");
  }
}
```

### 8.2 Project-Level Authorization

```typescript
// Reuse existing automation permission patterns
export const slackActionMiddleware = protectedProjectProcedure
  .input(z.object({ projectId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    // Reuse existing automation permission checks
    throwIfNoProjectAccess({
      session: ctx.session,
      projectId: input.projectId,
      scope: "automations:CUD",
    });
    return next();
  });
```

## 9. Data Flow

### 9.1 OAuth Connection Flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant API as API Route
    participant S as Slack API

    U->>F: Click "Connect Slack"
    F->>F: Generate OAuth URL with state
    F->>S: Redirect to Slack OAuth
    S->>API: OAuth callback with code
    API->>S: Exchange code for bot token
    S->>API: Return bot token & team info
    API->>F: Redirect with success
    F->>F: Update form state with tokens
```

### 9.2 Message Delivery Flow

```mermaid
sequenceDiagram
    participant E as Event
    participant T as Trigger
    participant W as Worker
    participant S as Slack API

    E->>T: Langfuse event occurs
    T->>T: Check automation filters
    T->>W: Execute Slack action
    W->>W: Format Block Kit message
    W->>S: POST to chat.postMessage
    S->>W: Return message timestamp
    W->>W: Log execution result
```

### 9.3 State Management Architecture

#### Client State

```typescript
// Extend existing automation form state patterns
const automationFormState = {
  // Existing automation state
  trigger: TriggerConfig,

  // Extended with Slack action state
  action: {
    type: "SLACK",
    config: {
      channelId: string,
      channelName: string,
      messageTemplate: BlockKitTemplate,
    },
  },
};
```

#### Server State Synchronization

```typescript
// Use existing React Query patterns from automation features
const useSlackChannels = (botToken: string) => {
  return api.slack.getChannels.useQuery(
    { botToken },
    {
      enabled: !!botToken,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  );
};
```

## 10. Testing

### 10.1 Unit Tests with Jest

#### Slack Service Tests

```typescript
describe("SlackService", () => {
  describe("exchangeOAuthCode", () => {
    it("should exchange OAuth code for bot token", async () => {
      // Mock Slack API response
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: true,
            access_token: "xoxb-test-token",
            team: { id: "T123", name: "Test Team" },
            bot_user_id: "U456",
          }),
      });

      const result = await SlackService.exchangeOAuthCode({
        code: "oauth-code",
        clientId: "client-id",
        clientSecret: "client-secret",
      });

      expect(result.botToken).toBe("xoxb-test-token");
      expect(result.teamId).toBe("T123");
      expect(result.teamName).toBe("Test Team");
    });

    it("should handle OAuth errors", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: false,
            error: "invalid_code",
          }),
      });

      await expect(
        SlackService.exchangeOAuthCode({
          code: "invalid-code",
          clientId: "client-id",
          clientSecret: "client-secret",
        }),
      ).rejects.toThrow("Slack OAuth error: invalid_code");
    });
  });

  describe("sendMessage", () => {
    it("should send Block Kit message to channel", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            ok: true,
            ts: "1234567890.123456",
          }),
      });

      const result = await SlackService.sendMessage({
        botToken: "xoxb-token",
        channelId: "C123456",
        blocks: [{ type: "section", text: { type: "mrkdwn", text: "Test" } }],
      });

      expect(result.messageTs).toBe("1234567890.123456");
      expect(fetch).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer xoxb-token",
          }),
        }),
      );
    });
  });
});
```

#### Message Template Tests

```typescript
describe("SlackTemplates", () => {
  it("should format trace event as Block Kit", () => {
    const traceEvent = {
      type: "trace",
      action: "created",
      data: {
        id: "trace-123",
        name: "Test Trace",
        status: "ERROR",
      },
    };

    const blocks = formatEventAsBlocks(traceEvent);

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("header");
    expect(blocks[0].text.text).toContain("Test Trace");
    expect(blocks[1].type).toBe("section");
    expect(blocks[1].text.text).toContain("ERROR");
  });

  it("should truncate long content", () => {
    const longEvent = {
      type: "trace",
      data: {
        input: "x".repeat(3000), // Very long input
      },
    };

    const blocks = formatEventAsBlocks(longEvent);
    const contentText = blocks.find((b) => b.type === "section")?.text?.text;

    expect(contentText.length).toBeLessThan(3000);
    expect(contentText).toContain("...");
  });
});
```

#### Integration Tests

```typescript
describe("Slack Automation Integration", () => {
  it("should execute Slack automation end-to-end", async () => {
    // Create automation with Slack action
    const automation = await createAutomation({
      projectId: "project-1",
      trigger: { eventSource: "trace", eventActions: ["created"] },
      action: {
        type: "SLACK",
        config: {
          channelId: "C456",
          messageTemplate: defaultTraceTemplate,
        },
      },
    });

    // Mock Slack API
    global.fetch = jest.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true, ts: "1234567890.123456" }),
    });

    // Trigger automation
    await executeAutomation(automation.id, {
      type: "trace",
      data: { id: "trace-123", name: "Test", status: "ERROR" },
    });

    // Verify Slack API was called
    expect(fetch).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        body: expect.stringContaining('"channel":"C456"'),
      }),
    );
  });
});
```

### 10.2 Error Handling Tests

```typescript
describe("Slack Error Handling", () => {
  it("should handle rate limiting gracefully", async () => {
    // Mock rate limit response
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        json: () =>
          Promise.resolve({
            ok: false,
            error: "rate_limited",
            headers: { "Retry-After": "30" },
          }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            ok: true,
            ts: "1234567890.123456",
          }),
      });

    const result = await SlackService.sendMessage({
      botToken: "xoxb-token",
      channelId: "C123",
      blocks: [],
    });

    expect(result.messageTs).toBe("1234567890.123456");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("should handle invalid tokens", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: false,
          error: "invalid_auth",
        }),
    });

    await expect(
      SlackService.sendMessage({
        botToken: "invalid-token",
        channelId: "C123",
        blocks: [],
      }),
    ).rejects.toThrow("Failed to send message: invalid_auth");
  });
});
```

---

## Key Benefits of Using @slack/web-api and @slack/oauth

### Implementation Improvements

**Before (Manual HTTP calls):**

```typescript
// Manual OAuth - error prone
const response = await fetch("https://slack.com/api/oauth.v2.access", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
  }),
});
const data = await response.json();
if (!data.ok) {
  throw new Error(`Slack OAuth error: ${data.error}`);
}
```

**After (Using @slack/oauth):**

```typescript
// Built-in OAuth handling with security and state management
const installation = await installer.handleCallback(
  { code: params.code, state: params.state },
  {},
  {
    success: async (installation, installOptions, callbackOptions) => {
      return { botToken: installation.bot?.token!, ... };
    },
    failure: async (error, installOptions, callbackOptions) => {
      throw new Error(`OAuth failed: ${error.message}`);
    },
  }
);
```

### Technical Advantages

**@slack/web-api Benefits:**

- ✅ **Automatic rate limiting**: Built-in exponential backoff for 429 responses
- ✅ **TypeScript support**: Full type safety for all API methods and responses
- ✅ **Error handling**: Proper Slack error types and debugging information
- ✅ **Retry logic**: Automatic retries for transient failures
- ✅ **Token management**: Handles token rotation and validation automatically

**@slack/oauth Benefits:**

- ✅ **State management**: Secure state generation and validation
- ✅ **Security features**: Built-in PKCE and CSRF protection
- ✅ **Scope validation**: Ensures proper OAuth scope handling
- ✅ **Installation store**: Flexible installation persistence patterns

### Code Quality Improvements

**Reliability:**

- Robust error handling vs manual status checking
- Built-in retry logic for transient failures
- Proper timeout handling

**Maintainability:**

- Official Slack SDK means better long-term support
- Consistent patterns across all Slack API interactions
- Less custom code to maintain

**Developer Experience:**

- IntelliSense/autocomplete for all API methods
- Built-in documentation and examples
- Consistent error messages and debugging

### Updated Dependencies

```json
{
  "dependencies": {
    "@slack/web-api": "^7.0.0", // ~85KB - Web API client
    "@slack/oauth": "^2.6.0" // ~25KB - OAuth utilities
  }
}
```

**Total bundle impact: ~110KB** - Much smaller than Bolt.js (~2MB+) while providing core functionality we need.

---

## Implementation Summary

This simplified approach delivers the same core value with significantly reduced complexity:

- **Reuses existing automation patterns** instead of creating new systems
- **Centralized token storage** with proper Slack SDK installation store
- **Simple Slack Web API** instead of complex Bolt.js setup
- **Extends existing UI components** instead of building from scratch
- **Single OAuth route** instead of multiple API endpoints
- **MVP approach** - no threading complexity initially

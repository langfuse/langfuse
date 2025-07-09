# Slack Integration Implementation Plan

## Dependencies & Setup
- [ ] Step 1: Install Slack SDK dependencies
  - **Task**: Add Slack SDK libraries to project dependencies
  - **Files**: 
    - `web/package.json`: Add @slack/web-api and @slack/oauth dependencies
    - `worker/package.json`: Add @slack/web-api dependency
  - **Step Dependencies**: None
  - **User Instructions**: Run `pnpm install` after adding dependencies

## Database Schema & Domain Models
- [ ] Step 2: Add Slack-specific database tables and types
  - **Task**: Create database migration for Slack integration tables and extend existing automation types
  - **Files**: 
    - `packages/shared/prisma/migrations/[timestamp]_add_slack_integration.sql`: New migration file
    - `packages/shared/prisma/schema.prisma`: Add slack_integrations table, extend ActionType enum
    - `packages/shared/src/domain/automations.ts`: Add SlackActionConfig types and schemas
  - **Step Dependencies**: Step 1
  - **User Instructions**: Run `pnpm run db:migrate` in packages/shared after migration is created

- [ ] Step 3: Update shared types and validation schemas
  - **Task**: Extend domain types and Zod schemas for Slack actions
  - **Files**:
    - `packages/shared/src/domain/automations.ts`: Add SLACK to ActionType enum, create SlackActionConfigSchema
    - `packages/shared/src/domain/index.ts`: Export new Slack types
  - **Step Dependencies**: Step 2
  - **User Instructions**: None

## Slack App Infrastructure
- [ ] Step 4: Create Slack service with official SDK
  - **Task**: Set up Slack service using @slack/web-api and @slack/oauth libraries
  - **Files**:
    - `web/src/features/slack/server/slackService.ts`: Unified service using Slack SDK libraries
    - `web/src/pages/api/slack/oauth.ts`: Simplified OAuth callback handler
  - **Step Dependencies**: Step 3
  - **User Instructions**: Create Slack App at api.slack.com with OAuth redirect URI pointing to callback endpoint

## tRPC API Routes & Channel Management
- [ ] Step 5: Create Slack tRPC router with OAuth and channel endpoints
  - **Task**: Build tRPC endpoints for Slack OAuth and channel management using SDK
  - **Files**:
    - `web/src/server/api/routers/slack.ts`: Slack tRPC router with OAuth and channel endpoints
    - `web/src/server/api/root.ts`: Register slack router
  - **Step Dependencies**: Step 4
  - **User Instructions**: None

## Slack Action Handler
- [ ] Step 6: Implement Slack action handler
  - **Task**: Create action handler for Slack following existing webhook pattern
  - **Files**:
    - `web/src/features/automations/components/actions/SlackActionHandler.ts`: Slack action handler implementation
    - `web/src/features/automations/components/actions/SlackActionForm.tsx`: Slack action form component with OAuth integration
    - `web/src/features/automations/components/actions/ActionHandlerRegistry.ts`: Register Slack handler
  - **Step Dependencies**: Step 5
  - **User Instructions**: None

- [ ] Step 7: Block Kit template system
  - **Task**: Create Block Kit message templates with JSON editor
  - **Files**:
    - `web/src/features/slack/components/BlockKitTemplate.tsx`: Block Kit template editor
    - `web/src/features/slack/components/BlockKitPreview.tsx`: Template preview component
    - `web/src/features/slack/server/blockKitTemplates.ts`: Default templates for different event types
    - `web/src/features/slack/server/blockKitValidator.ts`: Block Kit validation logic
  - **Step Dependencies**: Step 6
  - **User Instructions**: None

## Message Sending Service
- [ ] Step 8: Slack message service using Web API
  - **Task**: Implement message sending using @slack/web-api with built-in rate limiting
  - **Files**:
    - `worker/src/services/slack/slackMessageService.ts`: Message sending using Web API client
    - `worker/src/queues/slackQueue.ts`: Slack message queue processor
    - `worker/src/app.ts`: Register Slack queue worker
    - `packages/shared/src/server/queues/slackQueue.ts`: Queue definition and types
  - **Step Dependencies**: Step 7
  - **User Instructions**: None

## Automation Integration
- [ ] Step 9: Extend automation system for Slack
  - **Task**: Integrate Slack actions into existing automation event processing
  - **Files**:
    - `worker/src/features/entityChange/promptVersionProcessor.ts`: Add Slack action processing
    - `worker/src/features/entityChange/slackActionProcessor.ts`: Slack-specific action processor using Web API
  - **Step Dependencies**: Step 8
  - **User Instructions**: None

## Frontend Components
- [ ] Step 10: Slack connection and channel selection UI
  - **Task**: Create UI components for OAuth connection and channel selection
  - **Files**:
    - `web/src/features/slack/components/SlackConnectionCard.tsx`: Connection status and management
    - `web/src/features/slack/components/SlackConnectButton.tsx`: OAuth connection button
    - `web/src/features/slack/components/ChannelSelector.tsx`: Channel selection dropdown using SDK
    - `web/src/features/slack/components/SlackDisconnectButton.tsx`: Disconnect functionality
  - **Step Dependencies**: Step 9
  - **User Instructions**: None

## Settings Pages & Integration
- [ ] Step 11: Integration with existing automation UI
  - **Task**: Integrate Slack actions into existing automation form and create settings page
  - **Files**:
    - `web/src/features/automations/components/automationForm.tsx`: Add Slack action type
    - `web/src/features/automations/components/AutomationSidebar.tsx`: Display Slack automations
    - `web/src/features/automations/components/AutomationDetails.tsx`: Show Slack automation details
    - `web/src/pages/project/[projectId]/settings/slack.tsx`: Main Slack settings page
    - `web/src/features/slack/components/SlackSettings.tsx`: Settings page layout
  - **Step Dependencies**: Step 10
  - **User Instructions**: None

## Error Handling & Reliability
- [ ] Step 12: Error handling using SDK error types
  - **Task**: Implement error handling leveraging built-in SDK error types and recovery
  - **Files**:
    - `worker/src/services/slack/slackErrorHandler.ts`: Error handling using SDK error types
    - `web/src/features/slack/server/slackErrorRecovery.ts`: Token validation using SDK
    - `web/src/features/slack/components/SlackErrorBanner.tsx`: User-facing error notifications
    - `web/src/features/slack/hooks/useSlackConnection.ts`: React hook for connection status
  - **Step Dependencies**: Step 11
  - **User Instructions**: None

## Testing
- [ ] Step 13: Comprehensive test suite
  - **Task**: Create test suite for Slack integration using SDK mocking
  - **Files**:
    - `web/src/__tests__/async/slack-integration.servertest.ts`: Integration tests with SDK mocking
    - `web/src/__tests__/slack-oauth.servertest.ts`: OAuth flow tests
    - `web/src/__tests__/slack-components.test.tsx`: Component unit tests
    - `web/src/__tests__/slack-automation-form.test.tsx`: Form validation tests
  - **Step Dependencies**: Step 12
  - **User Instructions**: None

## Documentation & Polish
- [ ] Step 14: Navigation, documentation and final polish
  - **Task**: Add navigation, help content, and performance optimizations
  - **Files**:
    - `web/src/components/nav/ProjectNavigation.tsx`: Add Slack settings link
    - `web/src/features/slack/components/SlackHelpModal.tsx`: Help documentation
    - `web/src/features/slack/README.md`: Feature documentation
    - `web/src/features/slack/hooks/useSlackOptimistic.ts`: Optimistic UI updates
    - `web/src/features/slack/components/SlackLoadingStates.tsx`: Loading state components
  - **Step Dependencies**: Step 13
  - **User Instructions**: None

## Summary

This implementation plan provides a streamlined roadmap for building the Slack integration feature using official Slack SDK libraries. The plan reduces complexity by leveraging `@slack/web-api` and `@slack/oauth` while following existing codebase patterns and architecture.

### Key Architectural Decisions:
1. **Official Slack SDKs**: Uses `@slack/web-api` and `@slack/oauth` for robust, well-maintained functionality
2. **Reuse Existing Patterns**: Leverages the existing automation architecture with triggers, actions, and the ActionHandlerRegistry
3. **Secure Token Management**: Implements OAuth v2 flow with built-in security features and encrypted token storage
4. **Built-in Rate Limiting**: Leverages automatic rate limiting and retry logic from the Web API client
5. **TypeScript Support**: Full type safety with official SDK types
6. **Multi-tenant Safety**: Ensures proper isolation between projects and workspaces

### Technical Implementation Benefits:
- **Simplified OAuth**: Built-in state management, CSRF protection, and secure token exchange
- **Automatic Rate Limiting**: No custom rate limiting implementation needed - handled by SDK
- **Built-in Error Handling**: Proper Slack error types and automatic retry logic
- **Smaller Bundle Size**: ~110KB total vs 2MB+ for Bolt.js alternative
- **Better Maintainability**: Official SDK support and consistent patterns
- **Reduced Complexity**: 14 steps vs 22 in the original complex approach

### Implementation Strategy:
The implementation reduces from 22 to 14 steps by:
- Consolidating OAuth and channel management with SDK utilities
- Eliminating custom rate limiting (built into Web API client)
- Simplifying error handling with SDK error types
- Combining related UI components into fewer steps
- Leveraging SDK features to reduce custom code

**Estimated implementation time: 1-2 weeks** with significantly reduced maintenance overhead and better integration with existing Langfuse patterns.

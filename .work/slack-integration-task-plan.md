# Slack Integration Implementation Plan

## Dependencies & Setup

- [x] Step 1: Install Slack SDK dependencies
  - **Task**: Add Slack SDK libraries to project dependencies
  - **Files**:
    - `web/package.json`: Add @slack/web-api and @slack/oauth dependencies
    - `worker/package.json`: Add @slack/web-api dependency
  - **Step Dependencies**: None
  - **User Instructions**: Run `pnpm install` after adding dependencies

## Database Schema & Domain Models

- [x] Step 2: Add Slack integration database table and types
  - **Task**: Create database migration for Slack integration table and extend existing automation types
  - **Files**:
    - `packages/shared/prisma/migrations/[timestamp]_add_slack_integration.sql`: New migration file for SlackIntegration table
    - `packages/shared/prisma/schema.prisma`: Add SlackIntegration model, extend ActionType enum
    - `packages/shared/src/domain/automations.ts`: Add SlackActionConfig types and schemas
  - **Step Dependencies**: Step 1
  - **User Instructions**: Run `pnpm run db:migrate` in packages/shared after migration is created

- [x] Step 3: Update shared types and validation schemas
  - **Task**: Extend domain types and Zod schemas for Slack actions with centralized token storage
  - **Files**:
    - `packages/shared/src/domain/automations.ts`: Add SLACK to ActionType enum, create SlackActionConfigSchema (without token fields)
    - `packages/shared/src/domain/index.ts`: Export new Slack types
  - **Step Dependencies**: Step 2
  - **User Instructions**: None

## Slack App Infrastructure

- [x] Step 4: Create Slack service with official SDK
  - **Task**: Set up Slack service using @slack/web-api and @slack/oauth libraries
  - **Files**:
    - `web/src/features/slack/server/slackService.ts`: Unified service using Slack SDK libraries
    - `web/src/pages/api/public/slack/oauth.ts`: Simplified OAuth callback handler
  - **Step Dependencies**: Step 3
  - **User Instructions**: Create Slack App at api.slack.com with OAuth redirect URI pointing to callback endpoint

## tRPC API Routes & Channel Management

- [x] Step 5: Create Slack tRPC router with OAuth and channel endpoints
  - **Task**: Build tRPC endpoints for Slack OAuth and channel management using SDK
  - **Files**:
    - `web/src/features/slack/server/router.ts`: Slack tRPC router with OAuth and channel endpoints
  - **Step Dependencies**: Step 4
  - **User Instructions**: None

## Slack Action Handler

- [x] Step 6: Implement Slack action handler
  - **Task**: Create action handler for Slack following existing webhook pattern
  - **Files**:
    - `web/src/features/automations/components/actions/SlackActionHandler.ts`: Slack action handler implementation
    - `web/src/features/automations/components/actions/SlackActionForm.tsx`: Slack action form component with OAuth integration
    - `web/src/features/automations/components/actions/ActionHandlerRegistry.ts`: Register Slack handler
  - **Step Dependencies**: Step 5
  - **User Instructions**: None

- [ ] (SKIP) Step 7: Block Kit template system
  - **Task**: Create Block Kit message templates with JSON editor
  - **Files**:
    - `web/src/features/slack/components/BlockKitTemplate.tsx`: Block Kit template editor
    - `web/src/features/slack/components/BlockKitPreview.tsx`: Template preview component
    - `web/src/features/slack/server/blockKitTemplates.ts`: Default templates for different event types
    - `web/src/features/slack/server/blockKitValidator.ts`: Block Kit validation logic
  - **Step Dependencies**: Step 6
  - **User Instructions**: None

## Message Sending Service

- [x] Step 8: Slack message service using Web API
  - **Task**: Implement message sending using @slack/web-api with built-in rate limiting
  - **Files**:
    - `worker/src/services/slack/slackMessageService.ts`: Message sending using Web API client
    - `worker/src/queues/slackQueue.ts`: Slack message queue processor
    - `worker/src/app.ts`: Register Slack queue worker
    - `packages/shared/src/server/queues/slackQueue.ts`: Queue definition and types
  - **Step Dependencies**: Step 7
  - **User Instructions**: None

## Automation Integration

- [x] Step 9: Extend automation system for Slack
  - **Task**: Integrate Slack actions into existing automation event processing
  - **Files**:
    - `worker/src/features/entityChange/promptVersionProcessor.ts`: Add Slack action processing
    - `worker/src/features/entityChange/slackActionProcessor.ts`: Slack-specific action processor using Web API
  - **Step Dependencies**: Step 8
  - **User Instructions**: None

## Frontend Components

- [x] Step 10: Slack connection and channel selection UI
  - **Task**: Create UI components for OAuth connection and channel selection
  - **Files**:
    - `web/src/features/slack/components/SlackConnectionCard.tsx`: Connection status and management
    - `web/src/features/slack/components/SlackConnectButton.tsx`: OAuth connection button
    - `web/src/features/slack/components/ChannelSelector.tsx`: Channel selection dropdown using SDK
    - `web/src/features/slack/components/SlackDisconnectButton.tsx`: Disconnect functionality
  - **Step Dependencies**: Step 9
  - **User Instructions**: None

## Settings Pages & Integration

- [x] Step 11: Integration with existing automation UI
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

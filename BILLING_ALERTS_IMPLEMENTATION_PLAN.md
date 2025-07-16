# Stripe Billing Alerts Implementation Plan

## Overview

This document outlines the implementation plan for adding Stripe-based billing alerts to Langfuse.
The feature will allow customers to configure billing alerts within their organization settings to receive notifications when their usage exceeds specified thresholds.

## Requirements Summary

- **Customer Configuration**: Users can set custom billing alert thresholds in organization settings
- **Default Threshold**: $10,000 default threshold for all organizations
- **Stripe Integration**: Leverage Stripe's billing alert system for threshold monitoring
- **Webhook Processing**: Handle `billing.alert.triggered` webhooks from Stripe
- **Notification System**: Send alerts via email when thresholds are exceeded
- **Dynamic Updates**: Sync alert configuration changes to Stripe in real-time

## Current State Analysis

### Existing Infrastructure
- **Stripe Integration**: Fully functional with metered billing using `tracing_events` meter
- **Organization Storage**: Uses `cloudConfig` JSON field for Stripe configuration
- **Webhook Handler**: Processes subscription events in `/web/src/ee/features/billing/server/stripeWebhookApiHandler.ts`
- **Billing UI**: Organization settings with billing tab at `/organization/[id]/settings/billing`
- **Usage Tracking**: Hourly meter events sent to Stripe via `CloudUsageMeteringJob`

### Key Components
- **Stripe Client**: `/web/src/ee/features/billing/utils/stripe.ts`
- **Billing Router**: `/web/src/ee/features/billing/server/cloudBillingRouter.ts`
- **Cloud Config Schema**: `/packages/shared/src/interfaces/cloudConfigSchema.ts`
- **Billing Settings UI**: `/web/src/ee/features/billing/components/BillingSettings.tsx`

## Implementation Plan

### Phase 1: Database Schema Extension

#### 1.1 Update CloudConfig Schema
**File**: `/packages/shared/src/interfaces/cloudConfigSchema.ts`

```typescript
// Add to existing CloudConfigSchema
billingAlerts: z.object({
  enabled: z.boolean().default(true),
  thresholdAmount: z.number().positive().default(10000), // $10,000 default
  currency: z.string().default("USD"),
  stripeAlertId: z.string().optional(), // Stripe alert ID for tracking
  lastTriggeredAt: z.date().optional(),
  notifications: z.object({
    email: z.boolean().default(true),
    recipients: z.array(z.string().email()).default([]),
  }),
}).optional(),
```

#### 1.2 Database Migration
**Action**: No migration required - using existing JSON field
**Validation**: Ensure `parseDbOrg` function handles new schema structure

### Phase 2: Stripe Integration

#### 2.1 Stripe Alert Management Service
**File**: `/web/src/ee/features/billing/server/stripeAlertService.ts` (new)

```typescript
// Core functions needed:
- createStripeAlert(customerId: string, threshold: number, meterId: string)
- updateStripeAlert(alertId: string, threshold: number)
- deleteStripeAlert(alertId: string)
- getStripeAlerts(customerId: string)
```

**Key Implementation Details**:
- Use Stripe's `billing.alerts.create` API with `usage_threshold` type
- Configure alerts for the `tracing_events` meter
- Set `recurrence: "one_time"` for per-billing-cycle alerts
- Use customer filter to apply alerts to specific organizations

#### 2.2 Stripe Product Configuration
**File**: `/web/src/ee/features/billing/utils/stripeProducts.ts`

```typescript
// Add meter ID configuration
export const STRIPE_METERS = {
  TRACING_EVENTS: process.env.STRIPE_TRACING_EVENTS_METER_ID || 'mtr_default',
} as const;
```

### Phase 3: Backend API Implementation

#### 3.1 Extend Billing Router
**File**: `/web/src/ee/features/billing/server/cloudBillingRouter.ts`

```typescript
// Add new procedures:
getBillingAlerts: protectedProcedure
  .input(z.object({ organizationId: z.string() }))
  .output(BillingAlertsSchema)
  .query(async ({ input, ctx }) => {
    // Get organization billing alerts configuration
  }),

updateBillingAlerts: protectedProcedure
  .input(z.object({ 
    organizationId: z.string(),
    billingAlerts: BillingAlertsSchema 
  }))
  .mutation(async ({ input, ctx }) => {
    // Update organization billing alerts
    // Sync changes to Stripe
  }),
```

#### 3.2 Implementation Logic
1. **Get Alerts**: Read from `organization.cloudConfig.billingAlerts`
2. **Update Alerts**: 
   - Validate user permissions (`cloud-billing:CRUD`)
   - Update database record
   - Create/update/delete Stripe alert via `stripeAlertService`
   - Handle errors and rollback if Stripe operations fail

### Phase 4: Webhook Enhancement

#### 4.1 Extend Webhook Handler
**File**: `/web/src/ee/features/billing/server/stripeWebhookApiHandler.ts`

```typescript
// Add new event handler in switch statement:
case "billing.alert.triggered":
  const alertData = event.data.object;
  await handleBillingAlertTriggered(alertData);
  break;
```

#### 4.2 Alert Processing Function
```typescript
async function handleBillingAlertTriggered(alertData: Stripe.BillingAlert) {
  // 1. Find organization by Stripe customer ID
  // 2. Extract usage amount and threshold from alert data
  // 3. Send email notifications
  // 4. Update lastTriggeredAt timestamp
  // 5. Log event for monitoring
}
```

### Phase 5: Frontend Implementation

#### 5.1 Billing Alerts Component
**File**: `/web/src/ee/features/billing/components/BillingAlerts.tsx` (new)

```typescript
// Component structure:
- Alert configuration form
- Threshold amount input (with currency display)
- Email notification preferences
- Recipients management
- Enable/disable toggle
- Real-time validation
- Save/cancel actions
```

#### 5.2 Integration with Billing Settings
**File**: `/web/src/ee/features/billing/components/BillingSettings.tsx`

```typescript
// Add BillingAlerts component after usage chart:
<div className="space-y-6">
  <OrganizationUsageChart />
  <BillingAlerts /> {/* New component */}
</div>
```

#### 5.3 Form Implementation
- **Form Library**: React Hook Form with Zod validation
- **UI Components**: shadcn/ui (Card, Form, Input, Button, Switch)
- **Styling**: Consistent with existing billing UI patterns
- **Error Handling**: Display Stripe API errors and validation messages

### Phase 6: Email Notification System

#### 6.1 Email Template Implementation
**File**: `/packages/shared/src/server/services/email/billingAlert/BillingAlertEmailTemplate.tsx` (new)

**Template Structure**:
- **Subject**: "Billing Alert: [Organization Name] usage threshold exceeded"
- **Header**: Langfuse branding with alert icon
- **Alert Summary**: Current usage vs threshold with visual emphasis
- **Usage Details**: Breakdown of current billing period usage
- **Action Items**: Clear next steps and dashboard link
- **Footer**: Contact information and unsubscribe options

**Visual Design Requirements**:
- **Color Scheme**: Warning orange (#f59e0b) for alerts, consistent with Langfuse brand
- **Typography**: Clear hierarchy with emphasized numbers and thresholds
- **Layout**: 465px width, mobile-responsive design
- **Branding**: Langfuse logo and consistent styling with existing emails

#### 6.2 Email Service Implementation
**File**: `/packages/shared/src/server/services/email/billingAlert/sendBillingAlertEmail.ts` (new)

**Email Content Structure**:
```typescript
interface BillingAlertEmailProps {
  organizationName: string;
  currentUsage: number;
  threshold: number;
  currency: string;
  billingPeriod: string;
  usageBreakdown: {
    traces: number;
    observations: number;
    scores: number;
  };
  dashboardUrl: string;
  manageAlertsUrl: string;
  receiverEmail: string;
}
```

**Key Email Features**:
- **Urgency Indicator**: Visual prominence for threshold exceeded
- **Usage Visualization**: Progress bar or percentage indicator
- **Cost Projection**: Estimated cost based on current usage trajectory
- **Action Buttons**: Primary CTA for dashboard, secondary for alert settings
- **Helpful Context**: Billing period dates, previous period comparison

#### 6.3 Email Template Content

**Subject Line**: `Billing Alert: ${organizationName} exceeded $${threshold} usage threshold`

**Preview Text**: `Your current usage is $${currentUsage} for the ${billingPeriod} billing period`

**Email Body Structure**:
1. **Alert Header**
   - Warning icon with orange background
   - "Usage Threshold Exceeded" headline
   - Organization name prominently displayed

2. **Usage Summary Card**
   - Current usage amount (large, bold)
   - Threshold amount for comparison
   - Percentage over threshold (if applicable)
   - Billing period dates

3. **Usage Breakdown Section**
   - Traces: X,XXX events
   - Observations: X,XXX events  
   - Scores: X,XXX events
   - Total: X,XXX events

4. **Action Section**
   - Primary button: "View Usage Dashboard"
   - Secondary button: "Manage Alert Settings"
   - Text link: "View detailed usage breakdown"

5. **Next Steps**
   - Clear explanation of what happens next
   - Information about billing cycle and charges
   - Contact information for billing questions

6. **Footer**
   - Standard Langfuse footer with links
   - Unsubscribe option (if applicable)
   - Organization and recipient information

#### 6.4 Email Delivery Logic
**Recipients**: 
- Organization admins (users with `admin` or `owner` roles)
- Additional recipients configured in alert settings
- Fallback to organization owner if no admins found

**Delivery Rules**:
- Send immediately when alert is triggered
- Implement rate limiting (max 1 alert per billing period per threshold)
- Track delivery status and retry failed sends
- Log all email activities for monitoring

#### 6.5 Email Template Examples

**Standard Alert Email**:
```
Subject: Billing Alert: Acme Corp exceeded $10,000 usage threshold

[Langfuse Logo]

⚠️ Usage Threshold Exceeded

Your organization Acme Corp has exceeded the configured billing threshold.

┌─────────────────────────────────────┐
│ Current Usage: $12,450              │
│ Alert Threshold: $10,000            │
│ Billing Period: Jan 1-31, 2024      │
│ Overage: $2,450 (24.5%)            │
└─────────────────────────────────────┘

Usage Breakdown:
• Traces: 1,250,000 events
• Observations: 3,750,000 events
• Scores: 125,000 events
• Total: 5,125,000 events

[View Usage Dashboard] [Manage Alert Settings]

What happens next:
• Your current billing cycle continues normally
• Charges will appear on your next invoice
• You can adjust usage or modify alert thresholds

Questions? Contact support@langfuse.com
```

**Multi-Threshold Alert Email**:
```
Subject: Billing Alert: Multiple usage thresholds exceeded

[For organizations with multiple alerts triggered]
```

### Phase 7: Default Setup

#### 7.1 Migration for Existing Organizations
**File**: `/worker/src/jobs/setupDefaultBillingAlerts.ts` (new)

```typescript
// One-time job to:
- Find organizations with active Stripe subscriptions
- Set default $10,000 threshold
- Create Stripe alerts for each organization
- Update cloudConfig with default settings
```

#### 7.2 New Organization Setup
**File**: `/web/src/ee/features/billing/server/cloudBillingRouter.ts`

```typescript
// Extend subscription creation logic:
- When new subscription is created
- Automatically set up default billing alert
- Create Stripe alert with $10,000 threshold
```

## Technical Considerations

### Error Handling
- **Stripe API Failures**: Graceful degradation, retry logic
- **Database Consistency**: Transactional updates for critical operations
- **Webhook Reliability**: Idempotent processing, duplicate event handling

### Performance
- **Webhook Processing**: Async processing for non-critical operations
- **Database Queries**: Efficient queries for organization lookups
- **Stripe API Limits**: Rate limiting and retry mechanisms

### Security
- **Permission Validation**: Ensure only authorized users can modify alerts
- **Data Validation**: Strict input validation for all user inputs
- **Webhook Security**: Proper signature verification for Stripe webhooks

### Monitoring
- **Alert Delivery**: Track successful/failed alert deliveries
- **Stripe Sync**: Monitor sync operations between Langfuse and Stripe
- **Usage Patterns**: Monitor alert trigger frequency and accuracy

## Testing Strategy

### Unit Tests
- **Backend API**: Test all billing alert CRUD operations
- **Stripe Integration**: Mock Stripe API calls and test error conditions
- **Webhook Processing**: Test alert triggered event handling

### Integration Tests
- **End-to-End Flow**: Test complete alert setup and triggering
- **Stripe Webhook**: Test webhook processing with real Stripe events
- **Database Operations**: Test schema updates and data consistency

### Manual Testing
- **UI Components**: Test form validation and user interactions
- **Alert Configuration**: Test various threshold amounts and settings
- **Email Delivery**: Verify email notifications are sent and received correctly

## Deployment Plan

### Phase 1: Database Schema (No downtime)
- Deploy CloudConfig schema updates
- Test with existing data

### Phase 2: Backend API (No downtime)
- Deploy new API endpoints
- Deploy Stripe integration services
- Test API functionality

### Phase 3: Frontend UI (No downtime)
- Deploy billing alerts component
- Test UI integration
- Verify form functionality

### Phase 4: Webhook Handler (Minimal downtime)
- Deploy webhook handler updates
- Test webhook processing
- Monitor webhook delivery

### Phase 5: Default Setup (Background job)
- Run migration job for existing organizations
- Monitor job progress
- Verify default alerts are created

## Success Metrics

### Technical Metrics
- **Alert Accuracy**: 99%+ accuracy in threshold detection
- **Webhook Processing**: <5 second processing time
- **API Response Time**: <200ms for alert configuration operations
- **Error Rate**: <1% error rate for Stripe operations

### Business Metrics
- **Adoption Rate**: % of organizations that configure custom alerts
- **Alert Effectiveness**: Reduction in billing surprises
- **User Satisfaction**: Positive feedback on alert timing and accuracy

## Risks and Mitigation

### Technical Risks
- **Stripe API Changes**: Monitor Stripe API updates and deprecations
- **Webhook Reliability**: Implement retry mechanisms and monitoring
- **Database Performance**: Monitor query performance with increased data

### Business Risks
- **Alert Fatigue**: Implement smart thresholds and rate limiting
- **False Positives**: Accurate usage calculation and threshold logic
- **Customer Confusion**: Clear documentation and UI messaging

## Next Steps

1. **Review and Approval**: Get stakeholder approval for implementation plan
2. **Environment Setup**: Configure Stripe billing meters in dev/staging
3. **Phase 1 Implementation**: Start with database schema extension
4. **Iterative Development**: Implement phases sequentially with testing
5. **Production Rollout**: Deploy with monitoring and gradual rollout

This implementation plan provides a comprehensive roadmap for adding Stripe-based billing alerts to Langfuse while leveraging existing infrastructure and maintaining system reliability.
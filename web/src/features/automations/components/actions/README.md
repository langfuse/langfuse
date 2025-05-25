# Automation Action Handlers

This directory contains the action handler system for automations. Each action type (webhook, annotation queue, etc.) is implemented as a separate handler that follows the `BaseActionHandler` interface.

## Architecture

- **BaseActionHandler**: Interface that defines the contract for all action handlers
- **ActionHandlerRegistry**: Central registry that manages all action handlers
- **Individual Handlers**: Specific implementations for each action type (webhook, annotation queue, etc.)

## Adding a New Action Type

To add a new action type (e.g., "EMAIL"), follow these steps:

### 1. Create the Action Handler

Create a new file `EmailActionHandler.tsx`:

```typescript
import React from "react";
import { type UseFormReturn } from "react-hook-form";
import { type ActiveAutomation } from "@langfuse/shared/src/server";
import { type BaseActionHandler } from "./BaseActionHandler";
import { EmailActionForm } from "../EmailActionForm"; // You'll need to create this

export class EmailActionHandler implements BaseActionHandler {
  actionType = "EMAIL" as const;

  getDefaultValues(automation?: ActiveAutomation) {
    return {
      email: {
        to: automation?.action?.type === "EMAIL" &&
            automation?.action?.config &&
            "to" in automation.action.config &&
            automation.action.config.to || "",
        subject: automation?.action?.type === "EMAIL" &&
                automation?.action?.config &&
                "subject" in automation.action.config &&
                automation.action.config.subject || "",
      },
    };
  }

  validateFormData(formData: any): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!formData.email?.to) {
      errors.push("Email recipient is required");
    }
    if (!formData.email?.subject) {
      errors.push("Email subject is required");
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  buildActionConfig(formData: any) {
    return {
      version: "1.0",
      to: formData.email?.to,
      subject: formData.email?.subject,
      template: formData.email?.template || "default",
    };
  }

  renderForm(props: {
    form: UseFormReturn<any>;
    disabled: boolean;
    projectId: string;
  }) {
    return (
      <EmailActionForm
        form={props.form}
        disabled={props.disabled}
        projectId={props.projectId}
      />
    );
  }
}
```

### 2. Create the Action Form Component

Create `EmailActionForm.tsx` with the UI for configuring email actions:

```typescript
import React from "react";
import { Input } from "@/src/components/ui/input";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/src/components/ui/form";

export const EmailActionForm = ({ form, disabled }: { form: any; disabled: boolean }) => {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="email.to"
        render={({ field }) => (
          <FormItem>
            <FormLabel>To Email</FormLabel>
            <FormControl>
              <Input placeholder="user@example.com" {...field} disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email.subject"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Subject</FormLabel>
            <FormControl>
              <Input placeholder="Automation Alert" {...field} disabled={disabled} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

export const emailSchema = z.object({
  to: z.string().email("Invalid email address"),
  subject: z.string().min(1, "Subject is required"),
  template: z.string().optional(),
});
```

### 3. Register the Handler

Update `ActionHandlerRegistry.ts`:

```typescript
import { EmailActionHandler } from "./EmailActionHandler";

export class ActionHandlerRegistry {
  private static handlers: Map<ActionType, BaseActionHandler> = new Map();

  static {
    this.handlers.set("WEBHOOK", new WebhookActionHandler());
    this.handlers.set("ANNOTATION_QUEUE", new AnnotationQueueActionHandler());
    this.handlers.set("EMAIL", new EmailActionHandler()); // Add your new handler
  }

  // ... rest of the class
}
```

### 4. Update Form Schema

Update the form schema in `automationForm.tsx` to include your new action type:

```typescript
const formSchema = z.object({
  // ... existing fields
  actionType: z.enum(["WEBHOOK", "ANNOTATION_QUEUE", "EMAIL"]), // Add EMAIL
  webhook: webhookSchema.optional(),
  annotationQueue: annotationQueueSchema.optional(),
  email: emailSchema.optional(), // Add email schema
});
// ... rest of schema
```

### 5. Update Types (if needed)

If your action type is not already defined in the shared types, update the `ActionType` enum in the shared package.

### 6. Export from Index

Update `index.ts`:

```typescript
export { EmailActionHandler } from "./EmailActionHandler";
```

## Key Benefits

- **Separation of Concerns**: Each action type has its own handler with encapsulated logic
- **Easy Extension**: Adding new action types requires minimal changes to the main form
- **Type Safety**: Full TypeScript support with proper type checking
- **Reusable**: Action handlers can be used in other parts of the application
- **Testable**: Each handler can be unit tested independently

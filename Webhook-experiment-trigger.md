Why now?

To get cava over the line we should accelerate feature development. Timeline is to get this live by 25-07-25.

Problem statement

Teams have experiment runners (external services) that can test their actual entire application, but they need to trigger these runners manually from outside our system (eg via browser bookmark/streamlit internal app). This is particularly relevant for non-technical users.

Suggested solution

Add webhook experiment triggers that teams can configure for their datasets. Essentially we remove the need for browser bookmark in cases of a Webhook url. Instead, we provide a UI button that calls these webhooks server-side and shows the response.

Design

User clicks Run Experiment button

Underneath view docs button for custom experiment show string "Set up webhook" (wording tbd)

Url

Default Payload (defaults to {})

Once set up, show run next to view docs for custom experiment

Prompt user to confirm payload and run experiment

Show toast that experiment started/no response/errored

Product: User journey

I want to configure a webhook URL for my dataset so that I or less technical team members can trigger my external experiment runner directly from the Langfuse UI and see the results without leaving the application. To achieve this goal I will:

Set up my webhook experiment trigger once:

user inputs:

url (string)

defaultPayload (nullable json)

When clicking Run custom experiment I will trigger a webhook experiment

Upon clicking the button, I will see a modal (tbd) that allows me to include config to send to the run. Config should be pre-populated with default saved during set up.

I confirm my config. The external service is triggered.

I wait (likely non-blocking in UI) to receive the response from the webhook.

Tech

Frontend UI Components

Webhook Management: place to configure/edit webhook URLs

Trigger Button: "Run Experiment" button

Response Display: Toast notification showing webhook response

Data model

For the time being experiment webhooks <> datasets should have a one to one relationship.

Option 1: add to dataset table

Add related information to datasets table.

ALTER TABLE datasets ADD COLUMN "webhook_payload" JSONB,
ADD COLUMN "webhook_url" TEXT;

Option 2: create new designated table in postgres

-- very high-level example, please do not comment on naming etc
CREATE TABLE dataset_webhooks (
id TEXT NOT NULL, -- primary key
dataset_id TEXT NOT NULL REFERENCES datasets(id),
project_id TEXT NOT NULL REFERENCES projects(id),
url TEXT NOT NULL,
method VARCHAR(10) DEFAULT 'POST', -- can consider dropping, POST only for now
defaultPayload JSONB DEFAULT '{}',
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW()
);

I would prefer option 1, given the 1-1 current relationship. Once we deploy this feature and see how customers use it, we can revisit option 2 if necessary.

Experiment webhook CRUD

createWebhook: ...
updateWebhook: ...
getWebhooks: ...
deleteWebhook: ...

Webhook API Route

Webhook is called server-side. Why?

Private networks: There might be environments where this url is not exposed to the public internet when self hosting Langfuse

Preliminary flow:

User clicks "trigger webhook experiment" button in browser. Payload is pre-populated with defaultPayload , but may be edited

Browser sends request to our server via trpc procedure

Our server makes the actual webhook call to the user's experiment runner. We will expect a response within 10 seconds

Our server returns the response case (timeout/error/success) to the browser

Browser shows experiment started/experiment failed/no response recieved in a toast notification

Other considerations

Risk: uncontrolled response data (large payloads, sensitive data etc) >> sanitize response

RBAC: require CUD permission on datasets to trigger experiment AND set up webhook

Error handling: graceful timeout handling, otherwise propagate error back to user. No logging.

Other security considerations?

For v0 do not limit amounts of experiments someone can trigger?

API/SDK

UI only feature. No changes to existing dataset routes. We need to make sure we do not accidentally return webhook information on dataset api routes anywhere.

# Langfuse ↔ Slack Native Integration

## Project Description
Build a first-class “Slack” action type that lets Langfuse users connect **one Slack workspace** to a Langfuse project and create **multiple channel-level automations**.  
Each automation streams Langfuse events (trace failures, eval results, custom alerts, etc.) to a chosen Slack channel (or DM) using richly rendered Block Kit messages that include deep links back to the Langfuse UI.  
This complements the existing webhook mechanism and provides a native Slack experience.

## Target Audience
- LLM/AI engineers and product squads using Langfuse (SaaS or self-hosted)  
- DevOps / incident-response teams monitoring Langfuse metrics  
- Non-technical stakeholders who prefer Slack notifications over email/dashboards  

## Desired Features
### 1 — Slack App & Authentication
- [ ] Minimal Slack App manifest with granular bot scope  
    - [ ] `chat:write` (post/edit messages)  
- [ ] OAuth v2 “Add to Slack” flow  
    - [ ] CSRF-safe `state` param  
    - [ ] Redirect URI: `/api/slack/oauth/callback`  
- [ ] Secure per-project storage of **one** `team_id` and bot token  
    - [ ] Graceful handling of token rotation/revocation  

### 2 — Channel Automations
- [ ] Allow **multiple Slack automations per Langfuse project** (channel-level)  
    - [ ] Modal with `conversations_select` / `channel_select` that lists **only channels the installing user belongs to**  
    - [ ] Option to create a new `#langfuse-alerts` channel and auto-invite bot  
- [ ] Re-use existing Langfuse automation UI (currently used for webhooks) to configure event source, filters, and delivery rules  

### 3 — Event-to-Message Mapping
- [ ] Pre-defined Block Kit templates per event source (trace, prompt, eval, custom)  
- [ ] **Advanced editing**: “Edit JSON” button opens a plain JSON textbox (same component used elsewhere in codebase) with syntax highlighting  
    - [ ] Real-time validation against Slack Block Kit schema; surface lint errors inline  

### 4 — Message Rendering & Threading
- [ ] Create a **new parent message** for each event  
    - [ ] Include header, key fields, and “Open in Langfuse” link/button  
- [ ] Post follow-up edits (status changes, retries) as **threaded replies** using `chat.update` / `chat.postMessage` with `thread_ts`  
- [ ] Truncate overly long prompt or trace strings and provide “view full” link  

### 5 — Reliability & Operations
- [ ] Respect Slack rate limits (~1 msg/sec/channel; Tier 2 ≈ 20 msg/min/workspace)  
    - [ ] Exponential back-off on HTTP 429 with `Retry-After` header  
    - [ ] **No UI surfaced** for rate-limit failures; keep retrying transparently  
- [ ] Enforce Block Kit limits (≤ 4 KB per block, 50 blocks) and auto-elide excess data  
- [ ] Detect `invalid_auth`, pause delivery, and surface “Reconnect Slack” banner  
- [ ] Multi-tenant safety: map `project_id → team_id → token → channels` and clean up tokens on app uninstall  

## Design Requests
- [ ] Slack message style guide  
    - [ ] Two-column `fields` grid for key metrics and links  
- [ ] Langfuse settings UI enhancements  
    - [ ] “Connect Slack” banner with status indicator  
    - [ ] Channel automation list with enable/disable toggles  
    - [ ] Live preview of Block Kit template with sample data  

## Other Notes
- Slack is the **second** automation channel in addition to generic webhooks; users may enable either or both.  
- Only **one Slack workspace** can be connected per Langfuse project; multiple channels are allowed.  
- Include deep links (`https://app.langfuse.com/...`) back to the exact prompt, trace, or eval referenced in each Slack message.  

### Deferred / Phase-Next Items
- **Security & Compliance** (to be revisited)  
    - Verify `X-Slack-Signature` on inbound payloads when interactive features are added  
    - Provide data-deletion endpoint for GDPR / Slack workspace data requests  
- **Future-Proof Extensions**  
    - Socket Mode support for air-gapped/on-prem installs  
    - Slash command `/langfuse` and interactive buttons/modals  
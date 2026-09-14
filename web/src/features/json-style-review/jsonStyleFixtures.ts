// Realistic JSON fixtures for the dev-only JSON style review page. Values are
// copied from the local seed traces (demo-codex-turn-1, demo-support-s1-t7,
// help-assistant-s42); composed shapes reuse those values.

/** Typical observation metadata: 3 plain keys, one nested value. */
export const typicalMetadataFixture = {
  workspace: "ws_4Hn2Qp",
  surface: "editor",
  account: {
    plan: "team",
    seats: 3,
    cycle: "monthly",
  },
};

/** Six-message chat input with a tool call and tool result (codex system prompt + support session). */
export const chatInputFixture = [
  {
    role: "system",
    content:
      "You are a coding agent running in the Codex CLI, a terminal-based coding assistant. Codex CLI is an open source project led by OpenAI. You are expected to be precise, safe, and helpful.\n\nYour capabilities:\n- Receive user prompts, project context, and files.\n- Stream responses and emit function calls (e.g., shell commands, code edits).\n- Manage the working tree through the shell tool; prefer `rg` over `grep -R` and `apply_patch` for edits.\n- Track multi-step work with `update_plan` and keep exactly one step in progress.\n\nWithin this context, Codex refers to the open-source agentic coding interface (not the old Codex language model built by OpenAI).\n\n# Sandbox and approvals\nFilesystem sandboxing: workspace-write. Network: restricted. Approval policy: on-request. Ask before destructive actions.",
  },
  {
    role: "user",
    content:
      "I upgraded us to Team yesterday but my invoice still says Pro at $12.99, and the two people I just added (Priya and Tom) get 'upgrade to access' when they open our Brand Kit. Did the upgrade actually go through?",
  },
  {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_crm_4Hn2Qp",
        type: "function",
        function: {
          name: "crm.get-account",
          arguments: '{"email": "maya.chen@acme.example"}',
        },
      },
    ],
  },
  {
    role: "tool",
    tool_call_id: "call_crm_4Hn2Qp",
    name: "crm.get-account",
    content:
      '{"workspace_id": "ws_4Hn2Qp", "name": "Acme Robotics", "plan": "team", "previous_plan": "pro", "plan_changed_at": "2026-09-10T16:04:51Z", "seats": 3, "billing_cycle": "monthly", "owner": "maya.chen@acme.example"}',
  },
  {
    role: "user",
    content: "Ok, and will Priya and Tom be charged separately?",
  },
  {
    role: "assistant",
    content:
      "Yes, the upgrade went through. Your workspace has been on Team since yesterday at 16:04 UTC with 3 seats.\n\nTwo things explain what you are seeing:\n\n1. **The $12.99 invoice is your old Pro invoice.** It covers the period before the upgrade. A separate prorated invoice (in_1RxU2m, $21.34) for the remaining 20 days of this cycle on Team is open now and will be charged to the card on file. From next cycle you will see the full Team price for 3 seats.\n2. **Brand Kit access needs a fresh sign-in for the new seats.** Team permissions are applied when a member signs in again. Ask Priya and Tom to sign out and back in, or reload the editor; the 'upgrade to access' banner disappears once their session picks up the Team plan.\n\nIf they still see the banner after signing back in, reply here and I will check their seat assignments directly.",
  },
];

/** Typical generation output: 3 keys, one nested object (support answer). */
export const objectOutputFixture = {
  answer:
    "Yes, the upgrade went through. Your workspace has been on Team since yesterday at 16:04 UTC with 3 seats.\n\nTwo things explain what you are seeing:\n\n1. **The $12.99 invoice is your old Pro invoice.** It covers the period before the upgrade. A separate prorated invoice (in_1RxU2m, $21.34) for the remaining 20 days of this cycle on Team is open now and will be charged to the card on file. From next cycle you will see the full Team price for 3 seats.\n2. **Brand Kit access needs a fresh sign-in for the new seats.** Team permissions are applied when a member signs in again. Ask Priya and Tom to sign out and back in, or reload the editor; the 'upgrade to access' banner disappears once their session picks up the Team plan.\n\nIf they still see the banner after signing back in, reply here and I will check their seat assignments directly.",
  status: "COMPLETE",
  sources: {
    articles: ["KB-2214", "KB-1187", "KB-3302"],
    index_version: "2026-09-08",
  },
};

/** demo-codex-turn-1-o1 model parameters: nested reasoning / text, `include` array. */
export const modelParametersFixture = {
  include: ["reasoning.encrypted_content"],
  parallel_tool_calls: false,
  reasoning: {
    effort: "low",
    summary: "detailed",
    context: "all_turns",
  },
  store: false,
  stream: true,
  text: {
    verbosity: "low",
  },
  tool_choice: "auto",
  prompt_cache_key: "01a0800c-3119-7273-8dfb-387f230c1233",
};

/** Trace attributes table. */
export const attributesFixture = {
  model: "gpt-5.6-luna",
  environment: "default",
  release: "2026.09.10-3",
  version: "support-assistant-v4",
  session_id: "demo-support-s1",
  user_id: "maya.chen@acme.example",
};

/** Dataset item: support-assistant input and expected output objects. */
export const datasetItemFixture = {
  input: {
    question:
      "I upgraded us to Team yesterday but my invoice still says Pro at $12.99, and the two people I just added (Priya and Tom) get 'upgrade to access' when they open our Brand Kit. Did the upgrade actually go through?",
    user: "maya.chen@acme.example",
    workspace: "ws_4Hn2Qp",
  },
  expected_output: {
    answer:
      "Yes, the upgrade went through. Your workspace has been on Team since yesterday at 16:04 UTC with 3 seats.\n\nTwo things explain what you are seeing:\n\n1. **The $12.99 invoice is your old Pro invoice.** It covers the period before the upgrade. A separate prorated invoice (in_1RxU2m, $21.34) for the remaining 20 days of this cycle on Team is open now and will be charged to the card on file. From next cycle you will see the full Team price for 3 seats.\n2. **Brand Kit access needs a fresh sign-in for the new seats.** Team permissions are applied when a member signs in again. Ask Priya and Tom to sign out and back in, or reload the editor; the 'upgrade to access' banner disappears once their session picks up the Team plan.\n\nIf they still see the banner after signing back in, reply here and I will check their seat assignments directly.",
    status: "COMPLETE",
    articles: ["KB-2214", "KB-1187", "KB-3302"],
  },
};

/** demo-codex-turn-1-o1 tool definitions: two OpenAI function tools with nested JSON schema. */
export const toolDefinitionsFixture = [
  {
    type: "function",
    function: {
      name: "functions",
      description:
        "Codex CLI function namespace: shell, apply_patch, update_plan, view_image. Dispatch by name with the tool-specific arguments.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: ["shell", "apply_patch", "update_plan", "view_image"],
            description: "Function to call.",
          },
          arguments: {
            type: "object",
            description: "Arguments for the selected function.",
          },
        },
        required: ["name", "arguments"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mcp__cua_repl",
      description:
        "Run Python in the CUA REPL sandbox and return stdout, stderr, and the value of the last expression.",
      parameters: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "Python source to execute.",
          },
          timeout_s: {
            type: "integer",
            description: "Wall-clock limit in seconds (default 60).",
          },
        },
        required: ["code"],
        additionalProperties: false,
      },
    },
  },
];

/** Markdown answer (~1423 chars) from the support and help-assistant seeds. */
export const longStringFixture =
  "Yes, the upgrade went through. Your workspace has been on Team since yesterday at 16:04 UTC with 3 seats.\n\nTwo things explain what you are seeing:\n\n1. **The $12.99 invoice is your old Pro invoice.** It covers the period before the upgrade. A separate prorated invoice (in_1RxU2m, $21.34) for the remaining 20 days of this cycle on Team is open now and will be charged to the card on file. From next cycle you will see the full Team price for 3 seats.\n2. **Brand Kit access needs a fresh sign-in for the new seats.** Team permissions are applied when a member signs in again. Ask Priya and Tom to sign out and back in, or reload the editor; the 'upgrade to access' banner disappears once their session picks up the Team plan.\n\nIf they still see the banner after signing back in, reply here and I will check their seat assignments directly.\n\nYou can invite people directly or share an edit link.\n\n1. Open the design and click **Share** in the top-right corner.\n2. Add your teammate's email under **People with access**, set the permission to **Can edit**, and click **Send**.\n3. To share a link instead, open **Collaboration link**, choose **Anyone with the link can edit**, and copy the link.\n\nEditors see changes live and can leave comments. If your teammate only needs to look, choose **Can view** or **Can comment** instead. Team members in the same team can also find shared designs under **Projects > Shared with you**.";

/** Plain short string. */
export const shortStringFixture = "COMPLETE";

/** Raw non-JSON text input (~638 chars). */
export const rawTextFixture =
  "Customer wrote in via the editor help panel.\n\nI upgraded us to Team yesterday but my invoice still says Pro at $12.99, and the two people I just added (Priya and Tom) get 'upgrade to access' when they open our Brand Kit. Did the upgrade actually go through?\n\nAccount notes: Team plan since 2026-09-10 16:04 UTC (was Pro), 3 seats, monthly. Open invoice in_1RxU2m $21.34 prorated, paid invoice in_1RxT9k $12.99. Priya and Tom were invited 2026-09-10 16:20 UTC and have not signed in since the plan change. Ask the assistant to confirm the upgrade, explain the two invoices, and give the steps for the new seats to pick up Team permissions.";

/** p95 chat input: 54 messages from the help-assistant seed. */
export const chatInput54Fixture = [
  {
    role: "system",
    content:
      "You are the in-product help assistant for a design editor. Answer only from the provided help articles, in the user's language, with numbered steps where useful. Never invent features.",
  },
  {
    role: "user",
    content: "How do I share a design so my teammate can edit it?",
  },
  {
    role: "assistant",
    content:
      "You can invite people directly or share an edit link.\n\n1. Open the design and click **Share** in the top-right corner.\n2. Add your teammate's email under **People with access**, set the permission to **Can edit**, and click **Send**.\n3. To share a link instead, open **Collaboration link**, choose **Anyone with the link can edit**, and copy the link.\n\nEditors see changes live and can leave comments. If your teammate only needs to look, choose **Can view** or **Can comment** instead. Team members in the same team can also find shared designs under **Projects > Shared with you**.",
  },
  {
    role: "user",
    content: "Can I schedule a post to Instagram from here?",
  },
  {
    role: "assistant",
    content:
      "Yes, the **Content Planner** can publish to Instagram Business accounts on a schedule.\n\n1. Open the design and click **Share**, then choose **Schedule**.\n2. Pick a date and time, then select **Add channel** and connect your Instagram Business account through Facebook.\n3. Write the caption, add hashtags, and click **Schedule post**.\n\nScheduled posts appear in **Content Planner** on the home page, where you can move or delete them. Personal Instagram accounts cannot be connected because of Instagram's API rules; convert to a Business or Creator account first. Content Planner is available on Pro and Teams plans.",
  },
  {
    role: "user",
    content: "How do I remove the background from a photo?",
  },
  {
    role: "assistant",
    content:
      "The **Background Remover** does this in one click.\n\n1. Upload your photo and drag it into the design.\n2. Select the photo and click **Edit image** in the top bar.\n3. Choose **Background Remover** and wait a moment while the background is detected and removed.\n4. If a spot was missed, use **Erase** or **Restore** in the same panel and paint over it.\n\nThe result is a transparent PNG you can place on any colour or image. Background Remover is included in Pro and Teams; on the free plan you see a preview and can start a trial.",
  },
  {
    role: "user",
    content: "How do I cancel my Pro subscription?",
  },
  {
    role: "assistant",
    content:
      "You can cancel any time and keep Pro until the end of the current billing period.\n\n1. Click the **gear icon** in the top-right corner to open your settings.\n2. Select **Billing & plans** in the left sidebar.\n3. Next to your Pro plan, choose **Cancel subscription** and confirm.\n\nYour designs, folders and uploads stay in your account. Pro-only assets such as premium elements are no longer editable once the plan ends, and Brand Kit shrinks to the free limit. If you were charged after cancelling, reply here with the invoice date and we will look into it.",
  },
  {
    role: "user",
    content: "How does billing work when I add people to my team?",
  },
  {
    role: "assistant",
    content: "0",
  },
  {
    role: "user",
    content: "Translate this paragraph into French for me.",
  },
  {
    role: "assistant",
    content:
      "I'm here for help with the editor rather than general translation, but there is a built-in way to do this inside a design.\n\n1. Select the text box you want to translate.\n2. Click **Apps** in the left sidebar and open **Translate**.\n3. Choose **French** and apply it to the selected text or the whole page.\n\nThe translated text keeps your fonts and layout. If a line runs too long, use **Resize** on the text box or shorten it slightly.",
  },
  {
    role: "user",
    content: "How do I share a design so my teammate can edit it?",
  },
  {
    role: "assistant",
    content:
      "You can invite people directly or share an edit link.\n\n1. Open the design and click **Share** in the top-right corner.\n2. Add your teammate's email under **People with access**, set the permission to **Can edit**, and click **Send**.\n3. To share a link instead, open **Collaboration link**, choose **Anyone with the link can edit**, and copy the link.\n\nEditors see changes live and can leave comments. If your teammate only needs to look, choose **Can view** or **Can comment** instead. Team members in the same team can also find shared designs under **Projects > Shared with you**.",
  },
  {
    role: "user",
    content: "Can I schedule a post to Instagram from here?",
  },
  {
    role: "assistant",
    content:
      "Yes, the **Content Planner** can publish to Instagram Business accounts on a schedule.\n\n1. Open the design and click **Share**, then choose **Schedule**.\n2. Pick a date and time, then select **Add channel** and connect your Instagram Business account through Facebook.\n3. Write the caption, add hashtags, and click **Schedule post**.\n\nScheduled posts appear in **Content Planner** on the home page, where you can move or delete them. Personal Instagram accounts cannot be connected because of Instagram's API rules; convert to a Business or Creator account first. Content Planner is available on Pro and Teams plans.",
  },
  {
    role: "user",
    content: "How do I remove the background from a photo?",
  },
  {
    role: "assistant",
    content:
      "The **Background Remover** does this in one click.\n\n1. Upload your photo and drag it into the design.\n2. Select the photo and click **Edit image** in the top bar.\n3. Choose **Background Remover** and wait a moment while the background is detected and removed.\n4. If a spot was missed, use **Erase** or **Restore** in the same panel and paint over it.\n\nThe result is a transparent PNG you can place on any colour or image. Background Remover is included in Pro and Teams; on the free plan you see a preview and can start a trial.",
  },
  {
    role: "user",
    content: "How do I cancel my Pro subscription?",
  },
  {
    role: "assistant",
    content:
      "You can cancel any time and keep Pro until the end of the current billing period.\n\n1. Click the **gear icon** in the top-right corner to open your settings.\n2. Select **Billing & plans** in the left sidebar.\n3. Next to your Pro plan, choose **Cancel subscription** and confirm.\n\nYour designs, folders and uploads stay in your account. Pro-only assets such as premium elements are no longer editable once the plan ends, and Brand Kit shrinks to the free limit. If you were charged after cancelling, reply here with the invoice date and we will look into it.",
  },
  {
    role: "user",
    content: "How does billing work when I add people to my team?",
  },
  {
    role: "assistant",
    content: "0",
  },
  {
    role: "user",
    content: "Translate this paragraph into French for me.",
  },
  {
    role: "assistant",
    content:
      "I'm here for help with the editor rather than general translation, but there is a built-in way to do this inside a design.\n\n1. Select the text box you want to translate.\n2. Click **Apps** in the left sidebar and open **Translate**.\n3. Choose **French** and apply it to the selected text or the whole page.\n\nThe translated text keeps your fonts and layout. If a line runs too long, use **Resize** on the text box or shorten it slightly.",
  },
  {
    role: "user",
    content: "How do I share a design so my teammate can edit it?",
  },
  {
    role: "assistant",
    content:
      "You can invite people directly or share an edit link.\n\n1. Open the design and click **Share** in the top-right corner.\n2. Add your teammate's email under **People with access**, set the permission to **Can edit**, and click **Send**.\n3. To share a link instead, open **Collaboration link**, choose **Anyone with the link can edit**, and copy the link.\n\nEditors see changes live and can leave comments. If your teammate only needs to look, choose **Can view** or **Can comment** instead. Team members in the same team can also find shared designs under **Projects > Shared with you**.",
  },
  {
    role: "user",
    content: "Can I schedule a post to Instagram from here?",
  },
  {
    role: "assistant",
    content:
      "Yes, the **Content Planner** can publish to Instagram Business accounts on a schedule.\n\n1. Open the design and click **Share**, then choose **Schedule**.\n2. Pick a date and time, then select **Add channel** and connect your Instagram Business account through Facebook.\n3. Write the caption, add hashtags, and click **Schedule post**.\n\nScheduled posts appear in **Content Planner** on the home page, where you can move or delete them. Personal Instagram accounts cannot be connected because of Instagram's API rules; convert to a Business or Creator account first. Content Planner is available on Pro and Teams plans.",
  },
  {
    role: "user",
    content: "How do I remove the background from a photo?",
  },
  {
    role: "assistant",
    content:
      "The **Background Remover** does this in one click.\n\n1. Upload your photo and drag it into the design.\n2. Select the photo and click **Edit image** in the top bar.\n3. Choose **Background Remover** and wait a moment while the background is detected and removed.\n4. If a spot was missed, use **Erase** or **Restore** in the same panel and paint over it.\n\nThe result is a transparent PNG you can place on any colour or image. Background Remover is included in Pro and Teams; on the free plan you see a preview and can start a trial.",
  },
  {
    role: "user",
    content: "How do I cancel my Pro subscription?",
  },
  {
    role: "assistant",
    content:
      "You can cancel any time and keep Pro until the end of the current billing period.\n\n1. Click the **gear icon** in the top-right corner to open your settings.\n2. Select **Billing & plans** in the left sidebar.\n3. Next to your Pro plan, choose **Cancel subscription** and confirm.\n\nYour designs, folders and uploads stay in your account. Pro-only assets such as premium elements are no longer editable once the plan ends, and Brand Kit shrinks to the free limit. If you were charged after cancelling, reply here with the invoice date and we will look into it.",
  },
  {
    role: "user",
    content: "How does billing work when I add people to my team?",
  },
  {
    role: "assistant",
    content: "0",
  },
  {
    role: "user",
    content: "Translate this paragraph into French for me.",
  },
  {
    role: "assistant",
    content:
      "I'm here for help with the editor rather than general translation, but there is a built-in way to do this inside a design.\n\n1. Select the text box you want to translate.\n2. Click **Apps** in the left sidebar and open **Translate**.\n3. Choose **French** and apply it to the selected text or the whole page.\n\nThe translated text keeps your fonts and layout. If a line runs too long, use **Resize** on the text box or shorten it slightly.",
  },
  {
    role: "user",
    content: "How do I share a design so my teammate can edit it?",
  },
  {
    role: "assistant",
    content:
      "You can invite people directly or share an edit link.\n\n1. Open the design and click **Share** in the top-right corner.\n2. Add your teammate's email under **People with access**, set the permission to **Can edit**, and click **Send**.\n3. To share a link instead, open **Collaboration link**, choose **Anyone with the link can edit**, and copy the link.\n\nEditors see changes live and can leave comments. If your teammate only needs to look, choose **Can view** or **Can comment** instead. Team members in the same team can also find shared designs under **Projects > Shared with you**.",
  },
  {
    role: "user",
    content: "Can I schedule a post to Instagram from here?",
  },
  {
    role: "assistant",
    content:
      "Yes, the **Content Planner** can publish to Instagram Business accounts on a schedule.\n\n1. Open the design and click **Share**, then choose **Schedule**.\n2. Pick a date and time, then select **Add channel** and connect your Instagram Business account through Facebook.\n3. Write the caption, add hashtags, and click **Schedule post**.\n\nScheduled posts appear in **Content Planner** on the home page, where you can move or delete them. Personal Instagram accounts cannot be connected because of Instagram's API rules; convert to a Business or Creator account first. Content Planner is available on Pro and Teams plans.",
  },
  {
    role: "user",
    content: "How do I remove the background from a photo?",
  },
  {
    role: "assistant",
    content:
      "The **Background Remover** does this in one click.\n\n1. Upload your photo and drag it into the design.\n2. Select the photo and click **Edit image** in the top bar.\n3. Choose **Background Remover** and wait a moment while the background is detected and removed.\n4. If a spot was missed, use **Erase** or **Restore** in the same panel and paint over it.\n\nThe result is a transparent PNG you can place on any colour or image. Background Remover is included in Pro and Teams; on the free plan you see a preview and can start a trial.",
  },
  {
    role: "user",
    content: "How do I cancel my Pro subscription?",
  },
  {
    role: "assistant",
    content:
      "You can cancel any time and keep Pro until the end of the current billing period.\n\n1. Click the **gear icon** in the top-right corner to open your settings.\n2. Select **Billing & plans** in the left sidebar.\n3. Next to your Pro plan, choose **Cancel subscription** and confirm.\n\nYour designs, folders and uploads stay in your account. Pro-only assets such as premium elements are no longer editable once the plan ends, and Brand Kit shrinks to the free limit. If you were charged after cancelling, reply here with the invoice date and we will look into it.",
  },
  {
    role: "user",
    content: "How does billing work when I add people to my team?",
  },
  {
    role: "assistant",
    content: "0",
  },
  {
    role: "user",
    content: "Translate this paragraph into French for me.",
  },
  {
    role: "assistant",
    content:
      "I'm here for help with the editor rather than general translation, but there is a built-in way to do this inside a design.\n\n1. Select the text box you want to translate.\n2. Click **Apps** in the left sidebar and open **Translate**.\n3. Choose **French** and apply it to the selected text or the whole page.\n\nThe translated text keeps your fonts and layout. If a line runs too long, use **Resize** on the text box or shorten it slightly.",
  },
  {
    role: "user",
    content: "How do I share a design so my teammate can edit it?",
  },
  {
    role: "assistant",
    content:
      "You can invite people directly or share an edit link.\n\n1. Open the design and click **Share** in the top-right corner.\n2. Add your teammate's email under **People with access**, set the permission to **Can edit**, and click **Send**.\n3. To share a link instead, open **Collaboration link**, choose **Anyone with the link can edit**, and copy the link.\n\nEditors see changes live and can leave comments. If your teammate only needs to look, choose **Can view** or **Can comment** instead. Team members in the same team can also find shared designs under **Projects > Shared with you**.",
  },
  {
    role: "user",
    content: "Can I schedule a post to Instagram from here?",
  },
  {
    role: "assistant",
    content:
      "Yes, the **Content Planner** can publish to Instagram Business accounts on a schedule.\n\n1. Open the design and click **Share**, then choose **Schedule**.\n2. Pick a date and time, then select **Add channel** and connect your Instagram Business account through Facebook.\n3. Write the caption, add hashtags, and click **Schedule post**.\n\nScheduled posts appear in **Content Planner** on the home page, where you can move or delete them. Personal Instagram accounts cannot be connected because of Instagram's API rules; convert to a Business or Creator account first. Content Planner is available on Pro and Teams plans.",
  },
  {
    role: "user",
    content: "Thanks, that solved it.",
  },
];

/** kb.search output extended to 20 help-center hits. */
export const retrieverOutputFixture = {
  query: "team plan upgrade invoice prorated seats brand kit access",
  index_version: "2026-09-08",
  hits: [
    {
      id: "KB-2214",
      score: 0.91,
      title: "How proration works when you upgrade mid-cycle",
      snippet:
        "How proration works when you upgrade mid-cycle. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-1187",
      score: 0.86,
      title: "Sharing Brand Kits with your team",
      snippet:
        "Sharing Brand Kits with your team. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-3302",
      score: 0.83,
      title: "Why your invoice may still show the old plan price",
      snippet:
        "Why your invoice may still show the old plan price. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-1042",
      score: 0.81,
      title: "Adding and removing seats on a Team plan",
      snippet:
        "Adding and removing seats on a Team plan. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-2790",
      score: 0.79,
      title: "Updating the card on file",
      snippet:
        "Updating the card on file. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-1811",
      score: 0.78,
      title: "Team permissions and roles explained",
      snippet:
        "Team permissions and roles explained. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-2231",
      score: 0.76,
      title: "Downloading past invoices",
      snippet:
        "Downloading past invoices. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-1503",
      score: 0.74,
      title: "Switching billing from monthly to annual",
      snippet:
        "Switching billing from monthly to annual. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-1930",
      score: 0.73,
      title: "Brand Kit: fonts, colors and logos",
      snippet:
        "Brand Kit: fonts, colors and logos. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-2487",
      score: 0.72,
      title: "Why a member sees 'upgrade to access'",
      snippet:
        "Why a member sees 'upgrade to access'. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-1655",
      score: 0.7,
      title: "Transferring workspace ownership",
      snippet:
        "Transferring workspace ownership. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-2109",
      score: 0.69,
      title: "Trial ended: what happens to your designs",
      snippet:
        "Trial ended: what happens to your designs. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-2940",
      score: 0.68,
      title: "Refund policy for plan changes",
      snippet:
        "Refund policy for plan changes. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-1377",
      score: 0.67,
      title: "Inviting members by email or link",
      snippet:
        "Inviting members by email or link. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-2618",
      score: 0.66,
      title: "Managing multiple workspaces",
      snippet:
        "Managing multiple workspaces. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-1284",
      score: 0.64,
      title: "Where to find your workspace ID",
      snippet:
        "Where to find your workspace ID. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-2355",
      score: 0.63,
      title: "Payment failed: how to retry",
      snippet:
        "Payment failed: how to retry. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-1766",
      score: 0.62,
      title: "Team vs Pro: feature comparison",
      snippet:
        "Team vs Pro: feature comparison. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-2071",
      score: 0.6,
      title: "Sharing designs outside your team",
      snippet:
        "Sharing designs outside your team. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
    {
      id: "KB-2823",
      score: 0.59,
      title: "Exporting a Brand Kit",
      snippet:
        "Exporting a Brand Kit. Applies to Team and Pro workspaces; see the billing section of your workspace settings.",
    },
  ],
};

/** Agent state, five levels deep with mixed arrays (support session). */
export const agentStateFixture = {
  session: {
    id: "demo-support-s1",
    user: {
      email: "maya.chen@acme.example",
      workspace: {
        id: "ws_4Hn2Qp",
        name: "Acme Robotics",
        plan: {
          current: "team",
          previous: "pro",
          changed_at: "2026-09-10T16:04:51Z",
          seats: 3,
        },
      },
    },
  },
  turn: {
    index: 7,
    intent: {
      label: "billing.plan_upgrade_not_applied",
      urgency: "medium",
      sentiment: "concerned",
    },
    plan: {
      steps: [
        {
          id: 1,
          tool: "crm.get-account",
          status: "done",
          result: {
            plan: "team",
            seats: 3,
          },
        },
        {
          id: 2,
          tool: "kb.search",
          status: "done",
          result: {
            hits: ["KB-2214", "KB-1187", "KB-3302"],
            top_k: 4,
          },
        },
        {
          id: 3,
          tool: "billing.get-invoices",
          status: "done",
          result: {
            invoices: [
              {
                id: "in_1RxT9k",
                status: "paid",
              },
              {
                id: "in_1RxU2m",
                status: "open",
              },
            ],
          },
        },
        {
          id: 4,
          tool: "answer",
          status: "running",
          result: null,
        },
      ],
    },
  },
  guardrails: {
    policy: "support-v2",
    checks: ["policy", "pii", "pricing_claims"],
    verdict: null,
  },
};

/** demo-codex-turn-1-o1 observation metadata: 35 flat OTel keys, two nested objects (stress). */
export const otelMetadataFixture = {
  thread_id: "01a0800c-3119-7273-8dfb-387f230c1233",
  turn_trigger: "composer",
  root_turn_id: "01a0803d-7231-74d1-b0a4-87db5784b137",
  client: "codex",
  turn_grouping: "exact-codex",
  turn_id: "01a0803d-7231-74d1-b0a4-87db5784b137",
  "scope.name": "litellm",
  "resourceAttributes.model_id": "litellm",
  "resourceAttributes.deployment.environment": "development",
  "resourceAttributes.service.name": "litellm",
  "resourceAttributes.telemetry.sdk.version": "1.28.0",
  "resourceAttributes.telemetry.sdk.name": "opentelemetry",
  "resourceAttributes.telemetry.sdk.language": "python",
  "attributes.error.stack_trace":
    '  File "/Users/annabellschafer/Library/Application Support/Codex LiteLLM/.venv/lib/python3.11/site-packages/litellm/responses/streaming_iterator.py", line 788, in __anext__\n    self._maybe_raise_for_error_event(result)\n  File "/Users/annabellschafer/Library/Application Support/Codex LiteLLM/.venv/lib/python3.11/site-packages/litellm/responses/streaming_iterator.py", line 498, in _maybe_raise_for_error_event\n    raise MidStreamFallbackError(\n',
  "attributes.error.llm_provider": "openai",
  "attributes.error.message":
    "litellm.MidStreamFallbackError: litellm.APIError: Your organization has reached its configured enforced spend limit. Update your limit at https://platform.openai.com/settings/organization/limits.",
  "attributes.error.type": "MidStreamFallbackError",
  "attributes.http.response.status_code": "429",
  "attributes.error.code": "429",
  "attributes.langfuse.environment": "development",
  "attributes.session.id": "01a0800c-3119-7273-8dfb-387f230c1233",
  "attributes.langfuse.trace.name": "Codex Turn",
  "attributes.langfuse.trace.id": "5b3de875065d61dc9a3b43f995a2bbbd",
  "attributes.langfuse.observation.type": "generation",
  "attributes.llm.response.cost": "0",
  "attributes.llm.cost.total": "0",
  "attributes.user.id": "default_user_id",
  "attributes.litellm.trace_id": "01a0800c-3119-7273-8dfb-387f230c1233",
  "attributes.llm.invocation_parameters": {
    include: ["reasoning.encrypted_content"],
    parallel_tool_calls: false,
    reasoning: {
      effort: "low",
      summary: "detailed",
      context: "all_turns",
    },
    store: false,
    stream: true,
    text: {
      verbosity: "low",
    },
    tool_choice: "auto",
    prompt_cache_key: "01a0800c-3119-7273-8dfb-387f230c1233",
  },
  "attributes.llm.is_streaming": "True",
  "attributes.llm.provider": "",
  "attributes.llm.request.type": "aresponses",
  "attributes.llm.model_name": "gpt-5.6-luna",
  "attributes.metadata": {
    user_api_key_hash:
      "88e3a3e1d5f0b2a7c4d9e6f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1",
    user_api_key_alias: "codex-cli",
    user_api_key_team_id: null,
    user_api_key_user_id: "default_user_id",
    user_api_key_org_id: null,
    user_api_key_team_alias: null,
    user_api_key_end_user_id: null,
    user_api_key_user_email: null,
    user_api_key_request_route: "/v1/responses",
    user_api_key_spend: 0,
    user_api_key_max_budget: null,
    user_api_key_model_max_budget: {},
    user_api_key_metadata: {},
    global_max_parallel_requests: null,
    litellm_call_id: "01a0803d-1f1e-4c2a-9b7d-0e01a6c3d5f84",
    litellm_parent_otel_span: null,
    litellm_api_version: "1.82.0",
    model_group: "gpt-5.6-luna",
    model_group_size: 1,
    deployment: "openai/gpt-5.6",
    model_info: {
      id: "b7c1d9e3f2a4",
      db_model: false,
      base_model: "gpt-5.6",
      mode: "responses",
    },
    api_base: "https://api.openai.com/v1",
    caching_groups: null,
    hidden_params: {
      litellm_call_id: null,
      api_base: "https://api.openai.com/v1",
      model_id: "b7c1d9e3f2a4",
    },
    headers: {
      "content-type": "application/json",
      "user-agent": "codex_cli_rs/0.104.0",
      accept: "text/event-stream",
      conversation_id: "01a0800c-3119-7273-8dfb-387f230c1233",
      session_id: "01a0800c-3119-7273-8dfb-387f230c1233",
      originator: "codex_cli_rs",
    },
    endpoint: "http://localhost:4000/v1/responses",
    requester_ip_address: "127.0.0.1",
    requester_metadata: {
      turn_trigger: "composer",
      client: "codex",
    },
    spend_logs_metadata: {
      thread_id: "01a0800c-3119-7273-8dfb-387f230c1233",
      turn_id: "01a0803d-7231-74d1-b0a4-87db5784b137",
    },
    applied_guardrails: [],
    cache_hit: false,
    attempt: 1,
  },
  "attributes.openinference.span.kind": "LLM",
};

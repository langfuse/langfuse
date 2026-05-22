# Conditional Prompts in Langfuse

This guide explains how to use the Conditional Prompts feature in Langfuse, which enables dynamic prompt templating with Jinja2/Nunjucks syntax.

## Overview

**Conditional Prompts** allow you to write intelligent prompts that adapt based on variables using:
- **Conditionals**: `{% if condition %}...{% else %}...{% endif %}`
- **Loops**: `{% for item in list %}...{% endfor %}`
- **Variable interpolation**: `{{ variable }}` and `{{ object.property }}`
- **Filters**: `{{ list | length }}`, etc.

This is backward-compatible — existing prompts continue to work with the default regex-based format.

## Quick Start

### 1. Create a Prompt with Jinja2 Template Format

Navigate to **Prompts** in Langfuse and create a new prompt:

```
Chat Prompt
Name: customer-support
```

When editing, you'll see a **Template Format** dropdown. Select **Jinja2** to enable advanced templating.

### 2. Write a Conditional Prompt

**Text Prompt Example:**
```jinja2
You are a customer support assistant.
{% if user_type == 'premium' %}
As a premium customer, offer them priority solutions.
{% else %}
Provide standard support guidance.
{% endif %}

User Query: {{ user_query }}
```

**Chat Prompt Example:**
```
[System Role]
{% if language == 'spanish' %}
Eres un asistente de servicio al consumidor.
{% else %}
You are a customer support assistant.
{% endif %}

[User Message]
{{ user_message }}
```

### 3. Define Variables

In the **Variables** section, add your variables. You can now set a **Type** for each:

- **String**: Plain text (default)
- **JSON**: For arrays, objects, or complex data

Example variables:
| Name | Type | Value |
|------|------|-------|
| `user_type` | String | `premium` |
| `language` | String | `spanish` |
| `documents` | JSON | `[{"title": "API Docs", "url": "..."}, ...]` |

### 4. Use JSON Variables in Loops

For complex data, set the variable type to **JSON**:

**Variables:**
```json
{
  "documents": [
    {"title": "API Reference", "url": "https://..."},
    {"title": "SDK Guide", "url": "https://..."}
  ]
}
```

**Prompt:**
```jinja2
Here are relevant documents:
{% for doc in documents %}
- {{ doc.title }}: {{ doc.url }}
{% endfor %}

Please use these to answer the question.
```

## Features

### Conditionals

**If-Else:**
```jinja2
{% if score > 0.8 %}
High confidence response.
{% elif score > 0.5 %}
Medium confidence response.
{% else %}
Low confidence response.
{% endif %}
```

**Null Checks:**
```jinja2
{% if user_context %}
Context: {{ user_context }}
{% endif %}
```

### Loops

**Iterate over Arrays:**
```jinja2
{% for item in items %}
Item: {{ item.name }} ({{ item.price }})
{% endfor %}
```

**Access Loop Index:**
```jinja2
{% for user in users %}
{{ loop.index }}. {{ user.name }}
{% endfor %}
```

### Variable Access

**Simple Variables:**
```jinja2
Hello {{ user_name }}
```

**Object Properties (Dot Notation):**
```jinja2
{{ user.profile.name }}
{{ document.metadata.tags[0] }}
```

**Filters:**
```jinja2
{{ items | length }}  {# Count items #}
{{ text | upper }}    {# Uppercase #}
```

## Testing with Live Preview

The **Compiled Preview** panel shows how your prompt renders in real-time:

1. Edit variables in the **Variables** section
2. Watch the **Compiled Preview** panel update below
3. Errors (red "warnings" badge) indicate syntax issues

## API Usage

### Compile a Prompt at Runtime

Use the **Prompt Compile API** to compile a prompt with custom variables:

```bash
POST /api/public/v2/prompts/{promptName}/compile
Authorization: Bearer <your-api-key>

{
  "variables": {
    "user_type": "premium",
    "documents": [
      {"title": "API Docs", "url": "https://..."}
    ]
  }
}
```

**Response:**
```json
{
  "id": "prompt-123",
  "name": "customer-support",
  "type": "chat",
  "prompt": [
    {
      "role": "system",
      "content": "You are a customer support assistant.\nAs a premium customer, offer them priority solutions.\n..."
    }
  ],
  "compilationErrors": []
}
```

### Specify Prompt Version/Label

Compile a specific version:
```json
{
  "variables": { "user_type": "premium" },
  "version": 5
}
```

Or use a label:
```json
{
  "variables": { "user_type": "premium" },
  "label": "production"
}
```

## Example Use Cases

### 1. Multi-Language Support

```jinja2
{% if language == 'es' %}
Actúa como un asistente de soporte técnico.
{% elif language == 'fr' %}
Agissez en tant qu'assistant d'assistance technique.
{% else %}
Act as a technical support assistant.
{% endif %}

Question: {{ user_question }}
```

### 2. Dynamic Few-Shot Prompts

```jinja2
You are a sentiment analyzer.

Examples:
{% for example in examples %}
Input: {{ example.text }}
Sentiment: {{ example.sentiment }}
{% endfor %}

Analyze: {{ input_text }}
```

### 3. Conditional Context

```jinja2
You are a coding assistant.

{% if has_error %}
The user encountered an error:
{{ error_message }}

Debug this and provide a solution.
{% else %}
Help implement this feature:
{{ feature_request }}
{% endif %}
```

### 4. Dynamic System Behavior

```jinja2
You are an AI assistant with these capabilities:
{% for capability in capabilities %}
- {{ capability.name }}: {{ capability.description }}
{% endfor %}

{% if user_role == 'admin' %}
Admin tools are enabled.
{% endif %}

User request: {{ request }}
```

## Best Practices

### 1. Default Values

Always provide defaults for optional variables:
```jinja2
Hello {{ user_name | default("User") }}
```

### 2. Use JSON for Complex Data

For objects or arrays, set variable type to **JSON**:
```jinja2
{% for item in items %}
- {{ item.name }}: {{ item.description }}
{% endfor %}
```

Don't try to parse JSON strings manually.

### 3. Escape Special Characters

In URLs and code blocks:
```jinja2
URL: {{ base_url }}/path?key={{ value | urlencode }}
```

### 4. Keep Conditionals Simple

For complex logic, consider simpler prompting strategies:
```jinja2
# ✅ Good
{% if score > 0.5 %}High confidence{% else %}Low confidence{% endif %}

# ❌ Avoid
{% if (score > 0.5) and (type == 'classification') and (user.role == 'admin') %}...
```

## Backward Compatibility

### Default Format (Regex-Based)

Existing prompts use the **Default** format, which:
- Preserves `{{ variable }}` syntax
- Returns missing variables as-is: `{{ missing }}` stays `{{ missing }}`
- Works with existing integrations

### Migration

To upgrade an existing prompt to Jinja2:

1. Open the prompt editor
2. Change **Template Format** from **Default** to **Jinja2**
3. Test in **Compiled Preview**
4. Deploy

Note: Jinja2 handles missing variables differently (renders as empty string), so test thoroughly.

## Troubleshooting

### "Unclosed variable brackets"

Missing closing `}}`:
```jinja2
{{ user_name  {# Missing }} #}
```

### "Empty variable is not allowed"

Empty interpolation:
```jinja2
Hello {{  }}  {# Invalid #}
Hello {{ name }}  {# Valid #}
```

### "Unclosed block tag"

Missing `{% endif %}` or `{% endfor %}`:
```jinja2
{% if score > 0.5 %}
High confidence
{# Missing: {% endif %} #}
```

### JSON Parsing Errors

Set variable **Type** to **JSON** for complex data:
```jinja2
# ❌ Wrong: Set type to String, value is raw JSON
documents: "[{...}]"

# ✅ Correct: Set type to JSON
documents: [{...}]
```

## API Reference

### POST `/api/public/v2/prompts/{promptName}/compile`

**Authentication**: API Key (Bearer token)

**Request Body:**
```typescript
{
  variables?: Record<string, unknown>  // Variables to substitute
  version?: number                      // Specific version (optional)
  label?: string                        // Specific label (optional)
}
```

**Response:**
```typescript
{
  id: string
  name: string
  type: "text" | "chat"
  prompt: string | ChatMessage[]
  config: Record<string, unknown>
  templateFormat: "default" | "jinja2"
  createdAt: string
  updatedAt: string
  compilationErrors?: string[]         // Errors during compilation
}
```

**Error Codes:**
- `400` Bad Request: Invalid variables or both version and label specified
- `401` Unauthorized: Invalid or missing API key
- `404` Not Found: Prompt not found
- `429` Too Many Requests: Rate limited

## Limitations

- **Template size**: Max 100KB per template
- **Syntax**: Jinja2-compatible (Nunjucks subset)
- **Variable size**: No limit, but large objects may impact performance
- **Loops**: No recursion depth limit, but avoid infinite loops

## Support

For issues or feature requests, open an issue on [GitHub](https://github.com/langfuse/langfuse/issues).

---

**Next**: Learn about [Prompt Versioning & Labels](/docs/prompts/versioning) or [Prompt Management API](/docs/api/prompts).

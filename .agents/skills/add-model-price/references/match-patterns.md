# Match Patterns

## Anthropic Claude: API + Bedrock + Vertex

```regex
(?i)^(anthropic\/)?(claude-opus-4-6|(eu\\.|us\\.|apac\\.)?anthropic\\.claude-opus-4-6-v1(:0)?|claude-opus-4-6)$
```

Matches:

- `claude-opus-4-6`
- `anthropic/claude-opus-4-6`
- `anthropic.claude-opus-4-6-v1:0`
- `us.anthropic.claude-opus-4-6-v1:0`

## With Version Date

```regex
(?i)^(anthropic\/)?(claude-opus-4-5-20251101|(eu\\.|us\\.|apac\\.)?anthropic\\.claude-opus-4-5-20251101-v1:0|claude-opus-4-5@20251101)$
```

## OpenAI

```regex
(?i)^(openai\/)?(gpt-4o)$
```

## Google Gemini

```regex
(?i)^(google\/)?(gemini-2.5-pro)$
```

## Pattern Components

| Component | Purpose | Example |
| --- | --- | --- |
| `(?i)` | Case-insensitive match | `gpt-4o` and `GPT-4O` |
| `^...$` | Full-string match | Avoids partial matches |
| `(provider\/)?` | Optional provider prefix | `openai/gpt-4o` |
| `(eu\\.|us\\.|apac\\.)?` | Optional AWS region prefix | `us.anthropic.model` |
| `(:0)?` | Optional version suffix | Bedrock model versions |
| `@date` | Vertex AI version format | `claude-3-5-sonnet@20240620` |

## Testing Patterns

Use the bundled helper script:

```bash
node .agents/skills/add-model-price/scripts/test-match-pattern.mjs --model gpt-4o --accept gpt-4o openai/gpt-4o --reject gpt-4o-mini
```

# ChatML Normalization System

Normalizes LLM provider/framework data (traces, observations) to ChatML format for display and, partly, playground.
In general, provider adapters preprocess data → ChatMlSchema validates → UI renders

## Usage

### Display (IOPreview)
```typescript
import { normalizeInput, normalizeOutput, combineInputOutputMessages } from "@/src/utils/chatml";

const ctx = { metadata, observationName };
const inResult = normalizeInput(input, ctx);
const outResult = normalizeOutput(output, ctx);
const allMessages = combineInputOutputMessages(inResult, outResult, output);
```

### Playground
```typescript
import { normalizeInput } from "@/src/utils/chatml";
import { convertChatMlToPlayground } from "@/src/utils/chatml/playgroundConverter";

const inResult = normalizeInput(input, { metadata });
const playgroundMessages = inResult.success
  ? inResult.data.map(convertChatMlToPlayground)
  : [];
```

## Adding a Provider

1. Create `adapters/yourprovider.ts`:
```typescript
export const yourProviderAdapter: ProviderAdapter = {
  id: "yourprovider",
  detect(ctx) {
    return ctx.metadata?.provider === "yourprovider";
  },
  preprocess(data, kind, ctx) {
    // Normalize messages, stringify tool args, etc.
    return normalizedData;
  },
};
```

2. Add to `adapters/index.ts` registry before generic adapter

3. Write tests in `provider.clienttest.ts`

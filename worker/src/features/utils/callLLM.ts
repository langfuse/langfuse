  import { LLMAdapter } from '@langfuse/shared/src/adapters';
+ import { BedrockLLMAdapter, BedrockConfig } from '@langfuse/shared/src/adapters';

  export async function callLLM(
    params: LLMCallParams,
    modelConfig: any
  ): Promise<LLMResponse> {
    const adapter = createLLMAdapter(modelConfig);
    
+   // Authenticate if needed
+   if (adapter.authenticate) {
+     await adapter.authenticate();
+   }
    
    return await adapter.callModel(params);
  }

  function createLLMAdapter(config: any): LLMAdapter {
    switch (config.provider) {
+     case 'bedrock':
+       return new BedrockLLMAdapter(config as BedrockConfig);
      case 'openai':
        return new OpenAIAdapter(config);
      case 'anthropic':
        return new AnthropicAdapter(config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
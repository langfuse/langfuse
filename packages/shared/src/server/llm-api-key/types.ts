  export type LLMProvider = 
    | 'openai'
    | 'anthropic'
+   | 'bedrock';

+ export interface BedrockCredentials {
+   provider: 'bedrock';
+   region: string;
+   credentialsType: 'environment' | 'profile' | 'instance';
+   profile?: string;
+ }

  export type LLMCredentials = 
    | OpenAICredentials
    | AnthropicCredentials
+   | BedrockCredentials;
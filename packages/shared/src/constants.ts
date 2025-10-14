  export const SUPPORTED_LLM_PROVIDERS = [
    'openai',
    'anthropic',
+   'bedrock',
  ] as const;

+ export const BEDROCK_MODELS = {
+   'anthropic.claude-v2': 'Claude v2',
+   'anthropic.claude-v2:1': 'Claude v2.1',
+   'anthropic.claude-3-sonnet-20240229-v1:0': 'Claude 3 Sonnet',
+   'anthropic.claude-3-haiku-20240307-v1:0': 'Claude 3 Haiku',
+   'amazon.titan-text-express-v1': 'Titan Text Express',
+   'amazon.titan-text-lite-v1': 'Titan Text Lite',
+ } as const;
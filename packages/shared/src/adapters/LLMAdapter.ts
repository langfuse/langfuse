  export interface LLMAdapter {
    provider: string;
+   authenticate?(context?: any): Promise<void>;
    callModel(params: LLMCallParams): Promise<LLMResponse>;
  }

+ export interface LLMResponse {
+   content: string;
+   usage?: {
+     promptTokens: number;
+     completionTokens: number;
+     totalTokens: number;
+   };
+ }

  export interface LLMCallParams {
    prompt: string;
    temperature?: number;
    maxTokens?: number;
+   topP?: number;
  }
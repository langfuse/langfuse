import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromEnv, fromIni, fromInstanceMetadata } from "@aws-sdk/credential-providers";
import { LLMAdapter, LLMCallParams, LLMResponse } from "./LLMAdapter";

export interface BedrockConfig {
  provider: 'bedrock';
  region: string;
  modelId: string;
  credentialsType: 'environment' | 'profile' | 'instance';
  profile?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export class BedrockLLMAdapter implements LLMAdapter {
  provider = 'bedrock' as const;
  private client: BedrockRuntimeClient;
  private config: BedrockConfig;

  constructor(config: BedrockConfig) {
    this.config = config;
    this.client = new BedrockRuntimeClient({
      region: config.region,
      credentials: this.getCredentials(config.credentialsType, config.profile),
    });
  }

  private getCredentials(type: string, profile?: string) {
    switch (type) {
      case 'environment':
        return fromEnv();
      case 'profile':
        return fromIni({ profile });
      case 'instance':
        return fromInstanceMetadata();
      default:
        return fromEnv();
    }
  }

  async callModel(params: LLMCallParams): Promise<LLMResponse> {
    const body = this.formatRequestBody(params);
    
    const command = new InvokeModelCommand({
      modelId: this.config.modelId,
      body: JSON.stringify(body),
      contentType: 'application/json',
    });

    try {
      const response = await this.client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      return this.parseResponse(responseBody);
    } catch (error) {
      throw new Error(`Bedrock API call failed: ${error.message}`);
    }
  }

  private formatRequestBody(params: LLMCallParams) {
    // Handle different Bedrock model formats
    if (this.config.modelId.includes('claude')) {
      return {
        prompt: `\n\nHuman: ${params.prompt}\n\nAssistant:`,
        max_tokens_to_sample: this.config.maxTokens || 1000,
        temperature: this.config.temperature || 0.7,
        top_p: this.config.topP || 1,
      };
    } else if (this.config.modelId.includes('titan')) {
      return {
        inputText: params.prompt,
        textGenerationConfig: {
          maxTokenCount: this.config.maxTokens || 1000,
          temperature: this.config.temperature || 0.7,
          topP: this.config.topP || 1,
        },
      };
    }
    
    throw new Error(`Unsupported Bedrock model: ${this.config.modelId}`);
  }

  private parseResponse(responseBody: any): LLMResponse {
    let content = '';
    
    if (responseBody.completion) {
      // Claude response format
      content = responseBody.completion;
    } else if (responseBody.results?.[0]?.outputText) {
      // Titan response format
      content = responseBody.results[0].outputText;
    } else {
      throw new Error('Unexpected Bedrock response format');
    }

    return {
      content: content.trim(),
      usage: {
        promptTokens: responseBody.usage?.input_tokens || 0,
        completionTokens: responseBody.usage?.output_tokens || 0,
        totalTokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
      },
    };
  }
}
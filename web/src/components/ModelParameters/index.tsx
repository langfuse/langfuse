  import { OpenAIParameters } from './OpenAIParameters';
  import { AnthropicParameters } from './AnthropicParameters';
+ import { BedrockParameters } from './BedrockParameters';

  export function ModelParameters({ provider, config, onChange }: ModelParametersProps) {
    switch (provider) {
      case 'openai':
        return <OpenAIParameters config={config} onChange={onChange} />;
      case 'anthropic':
        return <AnthropicParameters config={config} onChange={onChange} />;
+     case 'bedrock':
+       return <BedrockParameters config={config} onChange={onChange} />;
      default:
        return <div>Unsupported provider: {provider}</div>;
    }
  }
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface BedrockParametersProps {
  config: any;
  onChange: (config: any) => void;
}

const BEDROCK_MODELS = [
  { id: 'anthropic.claude-v2', name: 'Claude v2' },
  { id: 'anthropic.claude-v2:1', name: 'Claude v2.1' },
  { id: 'anthropic.claude-3-sonnet-20240229-v1:0', name: 'Claude 3 Sonnet' },
  { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku' },
  { id: 'amazon.titan-text-express-v1', name: 'Titan Text Express' },
  { id: 'amazon.titan-text-lite-v1', name: 'Titan Text Lite' },
];

const AWS_REGIONS = [
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-west-2', name: 'US West (Oregon)' },
  { id: 'eu-west-1', name: 'Europe (Ireland)' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
];

export function BedrockParameters({ config, onChange }: BedrockParametersProps) {
  const updateConfig = (key: string, value: any) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="region">AWS Region</Label>
        <Select value={config.region || ''} onValueChange={(value) => updateConfig('region', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select AWS region" />
          </SelectTrigger>
          <SelectContent>
            {AWS_REGIONS.map((region) => (
              <SelectItem key={region.id} value={region.id}>
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="modelId">Model</Label>
        <Select value={config.modelId || ''} onValueChange={(value) => updateConfig('modelId', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select Bedrock model" />
          </SelectTrigger>
          <SelectContent>
            {BEDROCK_MODELS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="credentialsType">Credentials Type</Label>
        <Select 
          value={config.credentialsType || 'environment'} 
          onValueChange={(value) => updateConfig('credentialsType', value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="environment">Environment Variables</SelectItem>
            <SelectItem value="profile">AWS Profile</SelectItem>
            <SelectItem value="instance">Instance Metadata</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {config.credentialsType === 'profile' && (
        <div>
          <Label htmlFor="profile">AWS Profile</Label>
          <Input
            id="profile"
            value={config.profile || ''}
            onChange={(e) => updateConfig('profile', e.target.value)}
            placeholder="default"
          />
        </div>
      )}

      <div>
        <Label htmlFor="temperature">Temperature</Label>
        <Input
          id="temperature"
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={config.temperature || 0.7}
          onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}
        />
      </div>

      <div>
        <Label htmlFor="maxTokens">Max Tokens</Label>
        <Input
          id="maxTokens"
          type="number"
          min="1"
          max="4000"
          value={config.maxTokens || 1000}
          onChange={(e) => updateConfig('maxTokens', parseInt(e.target.value))}
        />
      </div>

      <div>
        <Label htmlFor="topP">Top P</Label>
        <Input
          id="topP"
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={config.topP || 1}
          onChange={(e) => updateConfig('topP', parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}
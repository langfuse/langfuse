  import { callLLM } from '../utils/callLLM';
+ import { BedrockConfig } from '@langfuse/shared/src/adapters';

  export class EvaluationService {
    async executeJudgeEvaluation(job: EvaluationJob): Promise<EvaluationResult> {
+     // Validate provider-specific configuration
+     this.validateProviderConfig(job.modelConfig);
      
      try {
        const response = await callLLM(job.params, job.modelConfig);
        return this.processEvaluationResponse(response, job);
      } catch (error) {
-       throw new Error(`Evaluation failed: ${error.message}`);
+       throw new Error(`Evaluation failed for ${job.modelConfig.provider}: ${error.message}`);
      }
    }

+   private validateProviderConfig(config: any): void {
+     switch (config.provider) {
+       case 'bedrock':
+         this.validateBedrockConfig(config as BedrockConfig);
+         break;
+       // Add other provider validations as needed
+     }
+   }

+   private validateBedrockConfig(config: BedrockConfig): void {
+     if (!config.region) {
+       throw new Error('AWS region is required for Bedrock');
+     }
+     if (!config.modelId) {
+       throw new Error('Model ID is required for Bedrock');
+     }
+     if (!config.credentialsType) {
+       throw new Error('Credentials type is required for Bedrock');
+     }
+   }
  }
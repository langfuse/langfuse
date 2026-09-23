# Bedrock embeddings for Langfuse Topics

Research + implementation: 2026-09-23. Cohere Embed v4 selected and wired into Topics; regional availability/pricing verified.

## Recommendation

**Start with Cohere Embed v4: `cohere.embed-v4:0`, 1,024 dimensions, float output, `input_type: "clustering"`, `truncate: "NONE"`.** Invoke through regional Bedrock Runtime.

Best combined fit: clustering mode, batching, JP/US/EU coverage. **Not a proven quality winner.** Compare English v3 and Titan v2 before broad rollout.

## Our workload

Short English summaries per facet: prompt requests ≤100 words; runtime accepts ≤2,000 characters. Cohere v4 replaces OpenAI `text-embedding-3-small`/768 dimensions. Summarization/naming still use OpenAI. [Summary/embedding code](../worker/src/features/topics/models.ts), [Bedrock adapter](../packages/shared/src/server/topics/embeddings.ts), [configuration](../packages/shared/src/topics/index.ts).

Discovery: normalized vectors → cosine UMAP → HDBSCAN. Later assignment: original-space centroids + learned radii. Same embedding task mode needed throughout. Long-context, image and multilingual retrieval scores matter less here. [Native clustering](../packages/native/src/topics.rs), [classifier](../worker/src/features/topics/classifier.ts).

## Models, evidence, cost

| Model                          | Role / limitation                                                                               | USD / 1M input tokens¹ |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------: |
| **Cohere Embed v4**            | Preferred candidate; clustering mode, 96 texts/request, adjustable dimensions                   |              **$0.12** |
| **Cohere Embed English v3**    | Strong challenger; clustering mode, 96 texts/request, 1,024 dimensions; tighter 512-token limit |              **$0.10** |
| **Titan Text Embeddings V2**   | Cost baseline; one text/request, no clustering-specific task selector                           |              **$0.02** |
| **Nova Multimodal Embeddings** | Supports clustering; absent from EU/JP catalogs checked                                         |                 $0.135 |

¹ US East standard on-demand pricing. V4/v3 rates also verified in Ireland, Tokyo and Frankfurt. Titan differs: Ireland **$0.026004**, Tokyo **$0.029**, Frankfurt **$0.20** per million tokens. Frankfurt's unusual rate confirmed in both AWS sources; do not generalize US pricing. [Third-party pricing data](https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/bedrockfoundationmodels/USD/current/bedrockfoundationmodels.json), [first-party pricing data](https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/bedrock/USD/current/bedrock.json). Publication checked: September 22, 2026.

At an assumed **100 billed tokens/summary**, one million summaries cost $12 on v4, $10 on v3, $2 on Titan in Virginia. Illustrative only; excludes summarization, storage and other pipeline costs.

Published evidence: across eleven shared legacy English clustering tasks, **English v3 averages 47.43 V-measure vs Titan v2 40.40**, winning all eleven. Matching dataset revisions; incomplete harness/invocation metadata. Published results, not a fresh Topics experiment.

The inspected v4 snapshot contains 33 retrieval results, no clustering results. Nova's report also does not establish an English-clustering win. **V3 has the strongest directly relevant comparative evidence found.** Full inventory, pinned sources and reproduction: [quality appendix](./bedrock-embedding-quality-research.md).

Multilingual v3 adds little while summaries deliberately use English. Older Titan/image/Marengo models have no identified advantage here. OpenAI text embeddings and Qwen3 Embedding were absent from the managed catalog checked. [Cohere v4 API](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v4.html), [v3 API](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-embed-v3.html), [Titan](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html), [Nova](https://docs.aws.amazon.com/nova/latest/nova2-userguide/embeddings.html).

## Bedrock regions

Live catalog verified:

| Embed v4 invocation region | Routing                |
| -------------------------- | ---------------------- |
| Virginia — `us-east-1`     | Direct on-demand       |
| Ireland — `eu-west-1`      | Direct on-demand       |
| Tokyo — `ap-northeast-1`   | Direct on-demand       |
| Frankfurt — `eu-central-1` | Inference profile only |

Direct regional endpoints give the simplest residency boundary. Frankfurt can use **`eu.cohere.embed-v4:0`**, verified active with EU destinations. US-only profile also documented: `us.cohere.embed-v4:0`. **Avoid `global.*` for geographic residency; use Tokyo direct for Japan-only processing.** [AWS regional matrix](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-cohere-embed-v4.html).

Titan v2 and both Cohere v3 variants support direct inference in all four regions. Catalog presence does not establish our production entitlement, permissions or quota.

## ZDR

For normal text-only Embed v4 inference, **Bedrock documents ZDR by default**; Cohere embeddings are absent from its listed model-specific retention exceptions. Providers cannot access Bedrock prompts/outputs; AWS says these are not used to train base models. [Retention exceptions](https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html), [provider isolation](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html), [training policy](https://aws.amazon.com/bedrock/security-privacy-responsible-ai/).

Customer-enabled invocation logging can still store bodies in CloudWatch/S3; our application also persists summaries/vectors. Production logging was not audited. Embed uses `InvokeModel`; do not assume `store:false` or OpenAI-compatible retention controls establish its ZDR behavior. [Logging](https://docs.aws.amazon.com/bedrock/latest/userguide/model-invocation-logging.html), [retention controls](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html).

## Embed v4 outside AWS

| Provider                      | Availability                                                                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Azure / Microsoft Foundry** | Managed, token-billed deployment. [Docs](https://docs.cohere.com/docs/cohere-on-microsoft-azure)                                                                                                                                                               |
| **Oracle OCI Generative AI**  | On-demand and dedicated deployments. [Docs](https://docs.oracle.com/en-us/iaas/Content/generative-ai/cohere-embed-4.htm)                                                                                                                                       |
| **Cohere directly**           | Hosted API: `embed-v4.0`. [API](https://docs.cohere.com/reference/embed)                                                                                                                                                                                       |
| **GCP / Vertex AI**           | No native managed v4 offering verified in current official catalog. Calling Cohere externally from GCP does not keep inference inside that deployment. [Catalog](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-partner-models) |
| **Private infrastructure**    | Commercial licensed container deployment; infrastructure to operate. Not open weights. [Docs](https://docs.cohere.com/docs/single-container-on-private-clouds)                                                                                                 |

Cohere offers AWS/Azure/OCI alternatives. **Region availability and ZDR require separate provider checks.** Pin model/settings and verify vector compatibility before mixing outputs across providers.

## Switch and evaluate

Implemented: Bedrock adapter, explicit region/auth, model/dimension validation, UI disclosure, finite/nonzero Float32 checks, provider-reported usage and cost. Local profile: `LANGFUSE_TOPICS_AWS_PROFILE`; region: `LANGFUSE_AI_AWS_BEDROCK_REGION`.

1. Drain old jobs; **Process traces → Reuse stored summaries**, then **Update topics**. Rebuild vectors, maps, centroids and assignment radii; no summary inference when configuration matches.
2. Throughput follow-up: [queue worker](../worker/src/features/topics/processTopicEmbeddingBatch.ts) still sends single-summary requests for per-result checkpointing. Batch up to 96 only while preserving order and retry semantics.
3. Freeze summaries; compare v4 at 512/1,024 dimensions, English v3 and Titan at 1,024. Measure merges/splits, pairwise accuracy, coverage, stability, held-out assignment/new-topic rejection, latency and cost. Claude summarizer switch separate.

Starting fixture: [100 synthetic traces](../packages/shared/scripts/seeder/scenarios/topics-evaluation.ts); [assignment examples](../packages/shared/scripts/seeder/scenarios/topics.ts) include a novel sourdough topic. Smoke comparison only; broader holdout needed. Keep comparison vectors outside normal latest-result rows or use separate evaluation projects/facets.

Raw Float32 vectors: 1,024 dimensions = 4,096 bytes, **33% more than 768** before compression/metadata. Dimensions are an evaluation choice, not a proven optimum.

Operational caveat: provider batching differs from discounted asynchronous Batch. Quota docs conflict on TPM vs RPM; confirm account-effective limits and measure throughput. [Quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock.html), [Titan throttling guidance](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html).

## Verification

Checked: source, four regional catalogs, EU inference profile, AWS pricing, published benchmarks, provider docs. Live synthetic call through worker adapter in `eu-west-1`: 1,024 finite Float32 values, 10 input tokens, $0.0000012. Unchecked: comparative quality/latency, production entitlement/quotas/logging. No customer data sent for verification.

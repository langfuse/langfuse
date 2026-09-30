# Topics feature: capacity and pricing

One call per trace writes the four default facets (Intent, Outcome, Issues, Sentiment). We embed those summaries afterwards. Clustering runs on a schedule and is not in these rates.

The rates below are the 100% case: every ingested trace, weekdays 22 to 24 Sep 2026. A partial rollout scales them linearly.

## The call

The prompt is 2,655 tokens, identical on every call, and cached. The transcript is the clipped topics text, not the raw messages. Raw messages average 11,000 tokens. The clipped text is 700 at p50, 2,300 on average, 4,500 at p95, 16,000 at p99. Output is about 240 tokens. An average call is about 5,000 tokens, under the 272k tier where input price doubles.

Those transcript sizes are prod-eu only: Fri 25 Sep, 15:50 to 19:50 Berlin, about 273k admitted traces, a 10% sample, o200k tokenizer. US tokens were not measured, so US TPM uses this mean and is a high-side estimate. There is a long tail. We would cap the transcript length we support.

On the same Friday window, both regions, the median trace has 2 observations and the mean has about 5. 86% of traces have 1 to 5. p99 is about 50 observations.

## Inference

**Model.** GPT-6 Luna. On Issues it named the most severe expert issue on 44 of 65 traces. Gemma 4 26B-A4B named 27. Intent was similar. Sentiment was comparable. GPT-5.6 Luna is today's default, at about twice the GPT-6 Luna standard price.

**Where it runs.** Prices per million tokens, checked 29 Sep. Flex and batch are the same OpenAI price ([batch pricing](https://developers.openai.com/api/docs/pricing?latest-pricing=batch)). Only OpenAI offers that tier for GPT-6 Luna. Bedrock and Azure do not.

| Setup | Input | Cached input | Output | Data stays in the EU |
| --- | ---: | ---: | ---: | --- |
| GPT-6 Luna, Flex or batch | $0.05 | $0.005 | $0.25 | no |
| GPT-6 Luna, standard | $0.10 | $0.01 | $0.50 | no |
| GPT-6 Luna, EU residency | $0.11 | $0.011 | $0.55 | yes |
| Gemma 4 26B-A4B, Flex, Frankfurt | $0.078 | no discount | $0.24 | yes |
| GPT-5.6 Luna, standard | $0.20 | $0.02 | $1.20 | no |

EU residency for GPT-6 Luna is standard only. Azure's own EU list is $0.12 / $0.60. The $0.11 above is what OpenAI shows. Check before committing. Gemma is the Bedrock-only EU fallback. It counts about 10% more tokens and was weaker on Issues.

**Capacity, if every trace is summarized.** One request per trace. Base is the quietest hour, peak is the busiest. Input TPM is requests/min times (2,655 + 2,300). Cached prompt tokens still count. Output TPM is requests/min times 240.

| | Traces / day | Requests / min, base | Requests / min, peak | Input TPM, base | Input TPM, peak |
| --- | ---: | ---: | ---: | ---: | ---: |
| prod-eu | 33M | 13k | 38k | 65M | 190M |
| prod-us | 65M | 23k | 70k | 115M | 340M |
| Both | 98M | 40k | 100k | 200M | 500M |

Output TPM is about 3M/min at the EU floor, 9M at the EU peak, 17M at the US peak. Per day at the mean: EU about 160B input and 8B output tokens, US about 320B input and 16B output.

EU peak is 11:00 to 15:00 Berlin. US peak is 11:00 to 14:00 Eastern. The peaks do not overlap, so the combined row is about 2.5x the combined floor, not the sum of the two peaks. EU peak hours have fatter traces (about 6.5 observations, against about 4 overnight), so EU peak TPM may run a bit above the table. Trace counts are ClickHouse `events_core`, full population.

**Caching.** OpenAI and Azure cache the prompt prefix automatically. Gemma has no cache price. On Bedrock, Luna caches only through the Responses API. We call Converse today, so that has to change before Bedrock Luna is usable.

**Embeddings.** About 25 tokens per facet, about 100 per trace. Negligible next to the summary TPM. The code uses Cohere Embed v4 on Bedrock today.

## Pricing

Prompt cached, 4 facets. Dollars per 1,000 traces. The mean column is the measured 2,300-token transcript. The other columns scale the transcript at about 390 tokens per observation, with the same prompt and the same 240 output tokens. The Braintrust row uses their Topics rates on those tokens and does not discount the prompt.

| Setup | 3 obs | 5 obs | 10 obs | 20 obs | Mean trace | Extra facet |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Braintrust Topics, no cache | $0.33 | $0.37 | $0.49 | $0.72 | $0.39 | n/a |
| GPT-6 Luna, Flex or batch | $0.13 | $0.17 | $0.27 | $0.46 | $0.19 | $0.02 |
| GPT-6 Luna, standard | $0.26 | $0.34 | $0.54 | $0.93 | $0.38 | $0.04 |
| GPT-6 Luna, EU residency | $0.29 | $0.38 | $0.59 | $1.02 | $0.41 | $0.04 |
| Gemma 4, Frankfurt Flex | $0.39 | $0.45 | $0.62 | $0.95 | $0.48 | $0.05 |
| GPT-5.6 Luna, standard | $0.58 | $0.73 | $1.12 | $1.90 | $0.80 | $0.08 |

With 3 facets, subtract about 10%. Output is about a third of the GPT-6 Luna bill. Embeddings add $0.002 per 1,000 traces if we use text-embedding-3-small at $0.02 per million. That is not the Cohere price.

**Full cloud day**, using 33M EU traces and 65M US traces.

| Setup | EU / day | US / day | Both / day |
| --- | ---: | ---: | ---: |
| Braintrust Topics rates on our call | $13k | $26k | $39k |
| GPT-6 Luna, EU residency for EU, Flex for US | $13k | $12k | $26k |
| GPT-5.6 Luna, standard | $26k | $52k | $78k |

A 1% slice of the $26k row is about $260 a day. Standard everywhere, with no Flex, is about $37k. Gemma for both regions is about $42k.

Braintrust Topics is $0.06 per million input tokens and $0.40 per million output tokens, with no cached-input price ([model credits](https://www.braintrust.dev/docs/plans-and-limits#model-credits)). On our mean call, prompt plus transcript plus 240 output, that is $0.39 per 1,000 traces. Flex is $0.19. Their output rate is $0.40 against our $0.25, and the prompt is not discounted. The GPT-6 Luna row on the same page is a different price, standard passthrough at $0.10 / $0.01 / $0.50.

**Unit.**

* Per event fits current Langfuse pricing and matches ClickHouse load. EU observations run from 3.5M an hour at the floor to 12.6M at the peak. US runs from 8M to 22M. It misses the summary: 86% of traces have 1 to 5 observations, while tokens run from 700 to 16,000.
* Per trace matches the call a customer can count. We keep the spread, about 23x from p50 to p99. The median trace has 2 observations and the mean has 5, so per trace and per event rank customers differently.
* Per input token matches our cost. Braintrust prices Topics the same way, input and output, at $0.06 and $0.40 per million. Customers cannot see the rendered transcript. Quote 700 (p50) / 2,300 (average) / 4,500 (p95). The `250 * observations^1.6` sketch only fits the median.
* BYOK only works if a batch does not mix projects. One key cannot hold a region. EU peak is about 190M input tokens/min, US peak about 340M.

Events cover ClickHouse. Tokens cover the summary. We do not yet know how concentrated opt-in is, which decides whether one project dominates cost and TPM.

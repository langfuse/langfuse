![Langfuse GitHub Banner](https://github.com/langfuse/langfuse/assets/121163007/6035f0f3-d691-4963-b5d0-10cf506e9d42)

<div align="center"><h1>Langfuse: Open Source LLM Engineering Platform</h1></div>
<div align="center"><h4>LLM Observability, Prompt Management, LLM Evaluations,<br/>Datasets, LLM Metrics, and Prompt Playground</h4></div>

<div align="center">
   <div>
      <h3>
         <a href="https://cloud.langfuse.com">
            <strong>Sign up</strong>
         </a> · 
         <a href="https://langfuse.com/docs/deployment/self-host">
            <strong>Self Host</strong>
         </a> · 
         <a href="https://langfuse.com/demo">
            <strong>Demo (live data)</strong>
         </a>
      </h3>
   </div>
   <div>
      <a href="https://langfuse.com/docs"><strong>Docs</strong></a> ·
      <a href="https://langfuse.com/issues"><strong>Report Bug</strong></a> ·
      <a href="https://langfuse.com/ideas"><strong>Feature Request</strong></a> ·
      <a href="https://langfuse.com/changelog"><strong>Changelog</strong></a> ·
      <a href="https://langfuse.com/roadmap"><strong>Roadmap</strong></a> ·
      <a href="https://langfuse.com/discord"><strong>Discord</strong></a> 
   </div>
   <span>Langfuse uses <a href="https://github.com/orgs/langfuse/discussions"><strong>Github Discussions</strong></a>  for Support and Feature Requests.</span>
   <br/>
   <span>We're hiring. <a href="https://langfuse.com/careers"><strong>Join us</strong></a> in Product Engineering and Developer Relations.</span>
   <br/>
   <br/>
   <div>
      <a href="https://github.com/langfuse/langfuse/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-red.svg?style=flat-square" alt="MIT License"></a>
      <a href="https://www.ycombinator.com/companies/langfuse"><img src="https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square" alt="Y Combinator W23"></a>
      <a href="https://github.com/langfuse/langfuse/pkgs/container/langfuse"><img alt="Docker Image" src="https://img.shields.io/badge/docker-langfuse-blue?logo=Docker&logoColor=white&style=flat-square"></a>
      <a href="https://pypi.python.org/pypi/langfuse"><img src="https://img.shields.io/pypi/dm/langfuse?style=flat-square&logo=python&logoColor=white&label=pypi%20langfuse&color=blue" alt="langfuse Python package on PyPi"></a>
      <a href="https://www.npmjs.com/package/langfuse"><img src="https://img.shields.io/npm/dm/langfuse?style=flat-square&logo=npm&logoColor=white&label=npm%20langfuse&color=blue" alt="langfuse npm package"></a>
   </div>
</div>
</br>

## Langfuse Overview

[![Langfuse Overview Video](https://github.com/user-attachments/assets/3926b288-ff61-4b95-8aa1-45d041c70866)](https://langfuse.com/watch-demo)

### Develop

- **LLM Observability:** Instrument your app and start ingesting traces to Langfuse ([Quickstart](https://langfuse.com/docs/get-started), [Integrations](https://langfuse.com/docs/integrations) [Tracing](https://langfuse.com/docs/tracing))
- **Langfuse UI:** Inspect and debug complex logs ([Demo](https://langfuse.com/docs/demo), [Tracing](https://langfuse.com/docs/tracing))
- **Prompt Management:** Manage, version and deploy prompts from within Langfuse ([Prompt Management](https://langfuse.com/docs/prompts/get-started))
- **Prompt Engineering:** Test and iterate on your prompts with the [LLM Playground](https://langfuse.com/docs/playground)

### Monitor

- **LLM Analytics:** Track metrics (cost, latency, quality) and gain insights from dashboards & data exports ([Analytics](https://langfuse.com/docs/analytics))
- **LLM Evaluations:** Collect and calculate scores for your LLM completions ([Scores & Evaluations](https://langfuse.com/docs/scores))
  - Run ([Model-based evaluations](https://langfuse.com/docs/scores/model-based-evals)) and LLM-as-a-Judge within Langfuse
  - Collect user feedback ([User Feedback](https://langfuse.com/docs/scores/user-feedback))
  - Manually score LLM outputs in Langfuse ([Manual Scores](https://langfuse.com/docs/scores/manually))

### Test

- **Experiments:** Track and test app behaviour before deploying a new version
  - Datasets let you test expected in and output pairs and benchmark performance before deploying ([Datasets](https://langfuse.com/docs/datasets))
  - Track versions and releases in your application ([Experimentation](https://langfuse.com/docs/experimentation), [Prompt Management](https://langfuse.com/docs/prompts))

## Get started

### Langfuse Cloud

Managed deployment by the Langfuse team, generous free-tier (hobby plan), no credit card required.

**[» Langfuse Cloud](https://cloud.langfuse.com)**

## Self-Hosting Open Source LLM Observability with Langfuse

### Localhost (docker)

```bash
# Clone repository
git clone https://github.com/langfuse/langfuse.git
cd langfuse

# Run server and database
docker compose up -d
```

[→ Learn more about deploying locally](https://langfuse.com/docs/deployment/local)

### Self-host (docker)

Langfuse is simple to self-host and keep updated. It currently requires only a single docker container and a postgres database.
[→ Self Hosting Instructions](https://langfuse.com/docs/deployment/self-host)

Templated deployments: [Railway, GCP, AWS, Azure, Kubernetes and others](https://langfuse.com/docs/deployment/self-host#platform-specific-information)

## Get Started

### API Keys

You need a Langfuse public and secret key to get started. Sign up [here](https://cloud.langfuse.com) and find them in your project settings.

### Ingesting Data · Instrumenting Your Application · LLM Observability with Langfuse

Note: We recommend using our fully async, typed [SDKs](https://langfuse.com/docs/sdk) that allow you to instrument any LLM application with any underlying model. They are available in [Python (Decorators)](https://langfuse.com/docs/sdk/python) & [JS/TS](https://langfuse.com/docs/sdk/typescript). The SDKs will always be the most fully featured and stable way to ingest data into Langfuse.

See the [→ Quickstart](https://langfuse.com/docs/get-started) to integrate Langfuse.

### LLM Observability Integrations

| Integration                                                                  | Supports                   | Description                                                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [SDK](https://langfuse.com/docs/sdk)                                         | Python, JS/TS              | Manual instrumentation using the SDKs for full flexibility.                                                                                      |
| [OpenAI](https://langfuse.com/docs/integrations/openai)                      | Python, JS/TS              | Automated instrumentation using drop-in replacement of OpenAI SDK.                                                                               |
| [Langchain](https://langfuse.com/docs/integrations/langchain)                | Python, JS/TS              | Automated instrumentation by passing callback handler to Langchain application.                                                                  |
| [LlamaIndex](https://langfuse.com/docs/integrations/llama-index/get-started) | Python                     | Automated instrumentation via LlamaIndex callback system.                                                                                        |
| [Haystack](https://langfuse.com/docs/integrations/haystack)                  | Python                     | Automated instrumentation via Haystack content tracing system.                                                                                   |
| [LiteLLM](https://langfuse.com/docs/integrations/litellm)                    | Python, JS/TS (proxy only) | Use any LLM as a drop in replacement for GPT. Use Azure, OpenAI, Cohere, Anthropic, Ollama, VLLM, Sagemaker, HuggingFace, Replicate (100+ LLMs). |
| [Vercel AI SDK](https://langfuse.com/docs/integrations/vercel-ai-sdk)        | JS/TS                      | TypeScript toolkit designed to help developers build AI-powered applications with React, Next.js, Vue, Svelte, Node.js.                          |
| [API](https://langfuse.com/docs/api)                                         |                            | Directly call the public API. OpenAPI spec available.                                                                                            |

Packages integrated with Langfuse:

| Name                                                            | Description                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [Instructor](https://langfuse.com/docs/integrations/instructor) | Library to get structured LLM outputs (JSON, Pydantic)                                                                  |
| [Dify](https://langfuse.com/docs/integrations/dify)             | Open source LLM app development platform with no-code builder.                                                          |
| [Ollama](https://langfuse.com/docs/integrations/ollama)         | Easily run open source LLMs on your own machine.                                                                        |
| [Mirascope](https://langfuse.com/docs/integrations/mirascope)   | Python toolkit for building LLM applications.                                                                           |
| [Flowise](https://langfuse.com/docs/integrations/flowise)       | JS/TS no-code builder for customized LLM flows.                                                                         |
| [Langflow](https://langfuse.com/docs/integrations/langflow)     | Python-based UI for LangChain, designed with react-flow to provide an effortless way to experiment and prototype flows. |

## Questions and feedback

### Ideas and roadmap

- [Roadmap](https://langfuse.com/roadmap)
- [GitHub Discussions](https://github.com/orgs/langfuse/discussions)
- [Feature Requests](https://langfuse.com/ideas)

### Support and feedback

In order of preference the best way to communicate with us:

- [GitHub Discussions](https://github.com/orgs/langfuse/discussions) (preferred): Contribute [ideas](https://langfuse.com/ideas), [support requests](https://langfuse.com/gh-support) and [report bugs](https://langfuse.com/issues)
- [Discord](https://langfuse.com/discord): community support
- Privately: contact at langfuse dot com

## Contributing to Langfuse

- Vote on [Ideas](https://github.com/orgs/langfuse/discussions/categories/ideas)
- Raise and comment on [Issues](https://github.com/langfuse/langfuse/issues)
- Open a PR - see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to setup a development environment.

## License

This repository is MIT licensed, except for the `ee` folders. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.

## Misc

### GET API to export your data

[**GET routes**](https://langfuse.com/docs/integrations/api) to use data in downstream applications (e.g. embedded analytics). You can also access them conveniently via the SDKs ([docs](https://langfuse.com/docs/query-traces)).

### Security & Privacy

We take data security and privacy seriously. Please refer to our [Security and Privacy](https://langfuse.com/security) page for more information.

### Telemetry

By default, Langfuse automatically reports basic usage statistics of self-hosted instances to a centralized server (PostHog).

This helps us to:

1. Understand how Langfuse is used and improve the most relevant features.
2. Track overall usage for internal and external (e.g. fundraising) reporting.

None of the data is shared with third parties and does not include any sensitive information. We want to be super transparent about this and you can find the exact data we collect [here](/web/src/features/telemetry/index.ts).

You can opt-out by setting `TELEMETRY_ENABLED=false`.

### Star History

<a href="https://star-history.com/#langfuse/langfuse&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=langfuse/langfuse&type=Date" />
 </picture>
</a>

### Open Source Projects Using Langfuse

Top open-source Python projects that use Langfuse, ranked by stars ([Source](https://github.com/langfuse/langfuse-docs/blob/main/components-mdx/dependents)):

| Repository                                                                                                                                                                                                                                                          | Stars |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----: |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/127165244?s=40&v=4" width="20" height="20" alt=""> &nbsp; [langgenius](https://github.com/langgenius) / [dify](https://github.com/langgenius/dify)                                            | 54865 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/158137808?s=40&v=4" width="20" height="20" alt=""> &nbsp; [open-webui](https://github.com/open-webui) / [open-webui](https://github.com/open-webui/open-webui)                                | 51531 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/131470832?s=40&v=4" width="20" height="20" alt=""> &nbsp; [lobehub](https://github.com/lobehub) / [lobe-chat](https://github.com/lobehub/lobe-chat)                                           | 49003 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/85702467?s=40&v=4" width="20" height="20" alt=""> &nbsp; [langflow-ai](https://github.com/langflow-ai) / [langflow](https://github.com/langflow-ai/langflow)                                  | 39093 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/130722866?s=40&v=4" width="20" height="20" alt=""> &nbsp; [run-llama](https://github.com/run-llama) / [llama_index](https://github.com/run-llama/llama_index)                                 | 37368 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/139558948?s=40&v=4" width="20" height="20" alt=""> &nbsp; [chatchat-space](https://github.com/chatchat-space) / [Langchain-Chatchat](https://github.com/chatchat-space/Langchain-Chatchat)    | 32486 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/128289781?s=40&v=4" width="20" height="20" alt=""> &nbsp; [FlowiseAI](https://github.com/FlowiseAI) / [Flowise](https://github.com/FlowiseAI/Flowise)                                         | 32448 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/31035808?s=40&v=4" width="20" height="20" alt=""> &nbsp; [mindsdb](https://github.com/mindsdb) / [mindsdb](https://github.com/mindsdb/mindsdb)                                                | 26931 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/119600397?s=40&v=4" width="20" height="20" alt=""> &nbsp; [twentyhq](https://github.com/twentyhq) / [twenty](https://github.com/twentyhq/twenty)                                              | 24195 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/60330232?s=40&v=4" width="20" height="20" alt=""> &nbsp; [PostHog](https://github.com/PostHog) / [posthog](https://github.com/PostHog/posthog)                                                | 22618 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/121462774?s=40&v=4" width="20" height="20" alt=""> &nbsp; [BerriAI](https://github.com/BerriAI) / [litellm](https://github.com/BerriAI/litellm)                                               | 15151 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/179202840?s=40&v=4" width="20" height="20" alt=""> &nbsp; [mediar-ai](https://github.com/mediar-ai) / [screenpipe](https://github.com/mediar-ai/screenpipe)                                   | 11037 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/105877416?s=40&v=4" width="20" height="20" alt=""> &nbsp; [formbricks](https://github.com/formbricks) / [formbricks](https://github.com/formbricks/formbricks)                                |  9386 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/76263028?s=40&v=4" width="20" height="20" alt=""> &nbsp; [anthropics](https://github.com/anthropics) / [courses](https://github.com/anthropics/courses)                                       |  8385 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/78410652?s=40&v=4" width="20" height="20" alt=""> &nbsp; [GreyDGL](https://github.com/GreyDGL) / [PentestGPT](https://github.com/GreyDGL/PentestGPT)                                          |  7374 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/152537519?s=40&v=4" width="20" height="20" alt=""> &nbsp; [superagent-ai](https://github.com/superagent-ai) / [superagent](https://github.com/superagent-ai/superagent)                       |  5391 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/137907881?s=40&v=4" width="20" height="20" alt=""> &nbsp; [promptfoo](https://github.com/promptfoo) / [promptfoo](https://github.com/promptfoo/promptfoo)                                     |  4976 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/157326433?s=40&v=4" width="20" height="20" alt=""> &nbsp; [onlook-dev](https://github.com/onlook-dev) / [onlook](https://github.com/onlook-dev/onlook)                                        |  4141 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/7250217?s=40&v=4" width="20" height="20" alt=""> &nbsp; [Canner](https://github.com/Canner) / [WrenAI](https://github.com/Canner/WrenAI)                                                      |  2526 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/11855343?s=40&v=4" width="20" height="20" alt=""> &nbsp; [pingcap](https://github.com/pingcap) / [autoflow](https://github.com/pingcap/autoflow)                                              |  2061 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/85268109?s=40&v=4" width="20" height="20" alt=""> &nbsp; [MLSysOps](https://github.com/MLSysOps) / [MLE-agent](https://github.com/MLSysOps/MLE-agent)                                         |  1161 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/158137808?s=40&v=4" width="20" height="20" alt=""> &nbsp; [open-webui](https://github.com/open-webui) / [pipelines](https://github.com/open-webui/pipelines)                                  |  1100 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/18422723?s=40&v=4" width="20" height="20" alt=""> &nbsp; [alishobeiri](https://github.com/alishobeiri) / [thread](https://github.com/alishobeiri/thread)                                      |  1074 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/125468716?s=40&v=4" width="20" height="20" alt=""> &nbsp; [topoteretes](https://github.com/topoteretes) / [cognee](https://github.com/topoteretes/cognee)                                     |   971 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/188657705?s=40&v=4" width="20" height="20" alt=""> &nbsp; [bRAGAI](https://github.com/bRAGAI) / [bRAG-langchain](https://github.com/bRAGAI/bRAG-langchain)                                    |   823 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/169500408?s=40&v=4" width="20" height="20" alt=""> &nbsp; [opslane](https://github.com/opslane) / [opslane](https://github.com/opslane/opslane)                                               |   677 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/151867818?s=40&v=4" width="20" height="20" alt=""> &nbsp; [dynamiq-ai](https://github.com/dynamiq-ai) / [dynamiq](https://github.com/dynamiq-ai/dynamiq)                                      |   639 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/48585267?s=40&v=4" width="20" height="20" alt=""> &nbsp; [theopenconversationkit](https://github.com/theopenconversationkit) / [tock](https://github.com/theopenconversationkit/tock)         |   514 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/20493493?s=40&v=4" width="20" height="20" alt=""> &nbsp; [andysingal](https://github.com/andysingal) / [llm-course](https://github.com/andysingal/llm-course)                                 |   394 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/132396805?s=40&v=4" width="20" height="20" alt=""> &nbsp; [phospho-app](https://github.com/phospho-app) / [phospho](https://github.com/phospho-app/phospho)                                   |   384 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/178644984?s=40&v=4" width="20" height="20" alt=""> &nbsp; [sentient-engineering](https://github.com/sentient-engineering) / [agent-q](https://github.com/sentient-engineering/agent-q)        |   370 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/168552753?s=40&v=4" width="20" height="20" alt=""> &nbsp; [sql-agi](https://github.com/sql-agi) / [DB-GPT](https://github.com/sql-agi/DB-GPT)                                                 |   324 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/60330232?s=40&v=4" width="20" height="20" alt=""> &nbsp; [PostHog](https://github.com/PostHog) / [posthog-foss](https://github.com/PostHog/posthog-foss)                                      |   305 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/154247157?s=40&v=4" width="20" height="20" alt=""> &nbsp; [vespperhq](https://github.com/vespperhq) / [vespper](https://github.com/vespperhq/vespper)                                         |   304 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/185116535?s=40&v=4" width="20" height="20" alt=""> &nbsp; [block](https://github.com/block) / [goose](https://github.com/block/goose)                                                         |   295 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/609489?s=40&v=4" width="20" height="20" alt=""> &nbsp; [aorwall](https://github.com/aorwall) / [moatless-tools](https://github.com/aorwall/moatless-tools)                                    |   291 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/2357342?s=40&v=4" width="20" height="20" alt=""> &nbsp; [dmayboroda](https://github.com/dmayboroda) / [minima](https://github.com/dmayboroda/minima)                                          |   221 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/66303003?s=40&v=4" width="20" height="20" alt=""> &nbsp; [RobotecAI](https://github.com/RobotecAI) / [rai](https://github.com/RobotecAI/rai)                                                  |   172 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/148684274?s=40&v=4" width="20" height="20" alt=""> &nbsp; [i-am-alice](https://github.com/i-am-alice) / [3rd-devs](https://github.com/i-am-alice/3rd-devs)                                    |   148 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/171735272?s=40&v=4" width="20" height="20" alt=""> &nbsp; [8090-inc](https://github.com/8090-inc) / [xrx-sample-apps](https://github.com/8090-inc/xrx-sample-apps)                            |   138 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/104478511?s=40&v=4" width="20" height="20" alt=""> &nbsp; [babelcloud](https://github.com/babelcloud) / [LLM-RGB](https://github.com/babelcloud/LLM-RGB)                                      |   135 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/15125613?s=40&v=4" width="20" height="20" alt=""> &nbsp; [souzatharsis](https://github.com/souzatharsis) / [tamingLLMs](https://github.com/souzatharsis/tamingLLMs)                           |   129 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/169401942?s=40&v=4" width="20" height="20" alt=""> &nbsp; [LibreChat-AI](https://github.com/LibreChat-AI) / [librechat.ai](https://github.com/LibreChat-AI/librechat.ai)                      |   128 |
| <img class="avatar mr-2" src="https://avatars.githubusercontent.com/u/51827949?s=40&v=4" width="20" height="20" alt=""> &nbsp; [deepset-ai](https://github.com/deepset-ai) / [haystack-core-integrations](https://github.com/deepset-ai/haystack-core-integrations) |   126 |

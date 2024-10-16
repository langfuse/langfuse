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


<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">


## 🚀 Langfuse: Open Source LLM Engineering Platform
LLM Observability, Prompt Management, Evaluations, Datasets, Metrics, and Prompt Playground

## 📹 Langfuse Overview
Watch our 3-minute Langfuse Overview Video for a complete introduction.
🔊 Unmute for voice-over!



https://github.com/langfuse/langfuse/assets/2834609/a94062e9-c782-4ee9-af59-dee6370149a8


<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">


###🛠️ Develop with Langfuse

- **LLM Observability:** Instrument your app and start ingesting traces to Langfuse ([Quickstart](https://langfuse.com/docs/get-started), [Integrations](https://langfuse.com/docs/integrations) [Tracing](https://langfuse.com/docs/tracing))
- **Langfuse UI:** Inspect and debug complex logs ([Demo](https://langfuse.com/docs/demo), [Tracing](https://langfuse.com/docs/tracing))
- **Prompt Management:** Manage, version and deploy prompts from within Langfuse ([Prompt Management](https://langfuse.com/docs/prompts/get-started))
- **Prompt Engineering:** Test and iterate on your prompts with the [LLM Playground](https://langfuse.com/docs/playground)


<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">

### 📊 Monitor with Langfuse

- **LLM Analytics:** Track metrics (cost, latency, quality) and gain insights from dashboards & data exports ([Analytics](https://langfuse.com/docs/analytics))
- **LLM Evaluations:** Collect and calculate scores for your LLM completions ([Scores & Evaluations](https://langfuse.com/docs/scores))
  - Run ([Model-based evaluations](https://langfuse.com/docs/scores/model-based-evals)) and LLM-as-a-Judge within Langfuse
  - Collect user feedback ([User Feedback](https://langfuse.com/docs/scores/user-feedback))
  - Manually score LLM outputs in Langfuse ([Manual Scores](https://langfuse.com/docs/scores/manually))


<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">

### 🧪 Test and Experiment

- **Experiments:** Track and test app behaviour before deploying a new version
  - Datasets let you test expected in and output pairs and benchmark performance before deploying ([Datasets](https://langfuse.com/docs/datasets))
  - Track versions and releases in your application ([Experimentation](https://langfuse.com/docs/experimentation), [Prompt Management](https://langfuse.com/docs/prompts))
  - 
<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">


##🎯 Get Started with Langfuse

###☁️ Langfuse Cloud

Managed deployment by the Langfuse team, generous free-tier (hobby plan), no credit card required.

**[» Langfuse Cloud](https://cloud.langfuse.com)**

<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">


## Self-Hosting Open Source LLM Observability with Langfuse

### 🐳Localhost (docker)

```bash
# Clone repository
git clone https://github.com/langfuse/langfuse.git
cd langfuse

# Run server and database
docker compose up -d
```

[→ Learn more about deploying locally](https://langfuse.com/docs/deployment/local)

<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">


###🐳 Self-host (docker)

Langfuse is simple to self-host and keep updated. It currently requires only a single docker container and a postgres database.
[→ Self Hosting Instructions](https://langfuse.com/docs/deployment/self-host)

Templated deployments: [Railway, GCP, AWS, Azure, Kubernetes and others](https://langfuse.com/docs/deployment/self-host#platform-specific-information)


<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">

## 🌐Get Started

### 🔑 API Keys 

You need a Langfuse public and secret key to get started. Sign up [here](https://cloud.langfuse.com) and find them in your project settings.

### Ingesting Data · Instrumenting Your Application · LLM Observability with Langfuse

Note: We recommend using our fully async, typed [SDKs](https://langfuse.com/docs/sdk) that allow you to instrument any LLM application with any underlying model. They are available in [Python (Decorators)](https://langfuse.com/docs/sdk/python) & [JS/TS](https://langfuse.com/docs/sdk/typescript). The SDKs will always be the most fully featured and stable way to ingest data into Langfuse.

See the [→ Quickstart](https://langfuse.com/docs/get-started) to integrate Langfuse.

<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">


### LLM Observability Integrations

| 🔌Integration                                                                  | Supports                   | Description                                                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [SDK](https://langfuse.com/docs/sdk)                                         | Python, JS/TS              | Manual instrumentation using the SDKs for full flexibility.                                                                                      |
| [OpenAI](https://langfuse.com/docs/integrations/openai)                      | Python, JS/TS              | Automated instrumentation using drop-in replacement of OpenAI SDK.                                                                               |
| [Langchain](https://langfuse.com/docs/integrations/langchain)                | Python, JS/TS              | Automated instrumentation by passing callback handler to Langchain application.                                                                  |
| [LlamaIndex](https://langfuse.com/docs/integrations/llama-index/get-started) | Python                     | Automated instrumentation via LlamaIndex callback system.                                                                                        |
| [Haystack](https://langfuse.com/docs/integrations/haystack)                  | Python                     | Automated instrumentation via Haystack content tracing system.                                                                                   |
| [LiteLLM](https://langfuse.com/docs/integrations/litellm)                    | Python, JS/TS (proxy only) | Use any LLM as a drop in replacement for GPT. Use Azure, OpenAI, Cohere, Anthropic, Ollama, VLLM, Sagemaker, HuggingFace, Replicate (100+ LLMs). |
| [Vercel AI SDK](https://langfuse.com/docs/integrations/vercel-ai-sdk)        | JS/TS                      | TypeScript toolkit designed to help developers build AI-powered applications with React, Next.js, Vue, Svelte, Node.js.                          |
| [API](https://langfuse.com/docs/api)                                         |                            | Directly call the public API. OpenAPI spec available.                                                                                            |

<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">

📦Packages integrated with Langfuse:

| Name                                                            | Description                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [Instructor](https://langfuse.com/docs/integrations/instructor) | Library to get structured LLM outputs (JSON, Pydantic)                                                                  |
| [Dify](https://langfuse.com/docs/integrations/dify)             | Open source LLM app development platform with no-code builder.                                                          |
| [Ollama](https://langfuse.com/docs/integrations/ollama)         | Easily run open source LLMs on your own machine.                                                                        |
| [Mirascope](https://langfuse.com/docs/integrations/mirascope)   | Python toolkit for building LLM applications.                                                                           |
| [Flowise](https://langfuse.com/docs/integrations/flowise)       | JS/TS no-code builder for customized LLM flows.                                                                         |
| [Langflow](https://langfuse.com/docs/integrations/langflow)     | Python-based UI for LangChain, designed with react-flow to provide an effortless way to experiment and prototype flows. |


<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">


##❓ Questions & Feedback 💬

###💡 Ideas & Roadmap 🛤️

- [Roadmap](https://langfuse.com/roadmap)
- [GitHub Discussions](https://github.com/orgs/langfuse/discussions)
- [Feature Requests](https://langfuse.com/ideas)

  
<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">


### 💬Support and feedback

In order of preference the best way to communicate with us:

- [GitHub Discussions](https://github.com/orgs/langfuse/discussions) (preferred): Contribute [ideas](https://langfuse.com/ideas), [support requests](https://langfuse.com/gh-support) and [report bugs](https://langfuse.com/issues)
- [Discord](https://langfuse.com/discord): community support
- Privately: contact at langfuse dot com

<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">

## Contributing to Langfuse

- Vote on [Ideas](https://github.com/orgs/langfuse/discussions/categories/ideas)
- Raise and comment on [Issues](https://github.com/langfuse/langfuse/issues)
- Open a PR - see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to setup a development environment.

<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">

##📜 License

This repository is MIT licensed, except for the `ee` folders. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.

<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">

## Misc

### GET API to export your data

[**GET routes**](https://langfuse.com/docs/integrations/api) to use data in downstream applications (e.g. embedded analytics). You can also access them conveniently via the SDKs ([docs](https://langfuse.com/docs/query-traces)).

<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">

### 🔒Security & Privacy

We take data security and privacy seriously. Please refer to our [Security and Privacy](https://langfuse.com/security) page for more information.

<!--Line-->
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="900">

### Telemetry

By default, Langfuse automatically reports basic usage statistics of self-hosted instances to a centralized server (PostHog).

This helps us to:

1. Understand how Langfuse is used and improve the most relevant features.
2. Track overall usage for internal and external (e.g. fundraising) reporting.

None of the data is shared with third parties and does not include any sensitive information. We want to be super transparent about this and you can find the exact data we collect [here](/web/src/features/telemetry/index.ts).

You can opt-out by setting `TELEMETRY_ENABLED=false`.

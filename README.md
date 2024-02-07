<div align="center">
   <a href="https://langfuse.com">
      <h1>🪢 Langfuse</h1>
   </a>
 <div>
      <h3> <a href="https://cloud.langfuse.com">
         <strong>Try Langfuse Cloud »</strong>
       </a>  · 
      <a href="https://langfuse.com/docs/deployment/self-host">
         <strong>Self Host Langfuse</strong>
      </a> · 
               <a href="https://langfuse.com/demo">
         <strong>Demo Project (live data)</strong>
      </a>
      </h3>
   <h3>
      Langfuse is the open source LLM engineering platform.   
   </h3>
    <div>
     Debug, analyze and iterate - together
   </div>
   </br>
   <div>
      <a href="https://langfuse.com/docs">
         <strong>Docs</strong>
      </a> ·
      <a href="https://github.com/langfuse/langfuse/issues/new?labels=%F0%9F%90%9E%E2%9D%94+unconfirmed+bug&projects=&template=bug_report.yml&title=bug%3A+">
         <strong>Report Bug</strong>
      </a> ·
      <a href="https://langfuse.com/idea">
         <strong>Feature Request</strong>
      </a> ·
           <a href="https://langfuse.com/changelog">
         <strong>Changelog</strong>
      </a> ·
            <a href="https://langfuse.com/discord">
         <strong>Discord</strong>
      </a> 
   </div>
   </br>
      <img src="https://img.shields.io/badge/License-MIT-red.svg?style=flat-square" alt="MIT License">
      <a href="https://www.ycombinator.com/companies/langfuse"><img src="https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square" alt="Y Combinator W23"></a>
      <a href="https://github.com/langfuse/langfuse/pkgs/container/langfuse"><img alt="Docker Image" src="https://img.shields.io/badge/docker-langfuse-blue?logo=Docker&logoColor=white&style=flat-square"></a>
      <a href="https://www.npmjs.com/package/langfuse"><img src="https://img.shields.io/npm/v/langfuse?style=flat-square&label=npm+langfuse" alt="langfuse npm package"></a>
      <a href="https://pypi.python.org/pypi/langfuse"><img src="https://img.shields.io/pypi/v/langfuse.svg?style=flat-square&label=pypi+langfuse" alt="langfuse Python package on PyPi"></a>
   </div>
</div>
</br>


## Langfuse is an open source platform to develop, monitor and test LLM apps

### Develop
- Instrument your app and start ingesting traces to Langfuse
- Inspect and debug complex logs in the Langfuse UI
- Manage, version and deploy prompts from within Langfuse

### Monitor & test
- Track metrics (cost, latency, quality) and gain insights from dashboards & data exports
- Collect and calculate scores for your LLM completions
   - Run model-based evaluations
   - Collect user feedback
   - Manually score observations in Langfuse
- Test
   - Datasets let you test expected in and output pairs and benchmark performance before deployiong
   - Track versions and releases in your application


https://github.com/langfuse/langfuse/assets/2834609/6041347a-b517-4a11-8737-93ef8f8af49f

_Muted by default, enable sound for voice-over_

## Get started

### Langfuse Cloud (recommended)

Managed deployment by the Langfuse team, generous free-tier (hobby plan), no credit card required.

**[» Langfuse Cloud](https://cloud.langfuse.com)**

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

[→ Self Hosting Instructions](https://langfuse.com/docs/deployment/self-host)

[Deploy on Railway, GCP Cloud Run, AWS Fargate, Kubernetes and others](https://langfuse.com/docs/deployment/self-host#platform-specific-information)


## Data Ingestion · instrumenting your application

We recommend using our fully async, typed SDKs that allow you to instrument any LLM application using any model. 

They are available in Python & JS/TS. The SDKs will always be the most fully featured and stable way to ingest data into Langfuse.

You may want to use another integration to get started quickly or implement a use case that we do not yet support. However, we recommend to migrate to the Langfuse SDKs over time to ensure the best possible experience.

[→ Quickstart](https://langfuse.com/docs/get-started)

### Integrations

There are currently four main ways to integrate with Langfuse:

| Integration                  | Supports      | Description                                                                     |
| ---------------------------- | ------------- | ------------------------------------------------------------------------------- |
| [**SDK** - _recommended_](https://langfuse.com/docs/sdk)             | Python, JS/TS | Manual instrumentation using the SDKs for full flexibility.                     |
| [OpenAI](https://langfuse.com/docs/openai)       | Python        | Automated instrumentation using drop-in replacement of OpenAI SDK.              |
| [Langchain](https://langfuse.com/docs/langchain) | Python, JS/TS | Automated instrumentation by passing callback handler to Langchain application. |
| [API](https://langfuse.com/docs/api)             |               | Directly call the public API. OpenAPI spec available.                           |

In addition, Langfuse is natively integrated with the following projects/packages:

| Name                       | Description                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [LiteLLM](/https://langfuse.comdocs/litellm)   | Use any LLM as a drop in replacement for GPT. Use Azure, OpenAI, Cohere, Anthropic, Ollama, VLLM, Sagemaker, HuggingFace, Replicate (100+ LLMs). |
| [Flowise](https://langfuse.com/docs/flowise)   | JS/TS no-code builder for customized LLM flows.                                                                                                  |
| [Langflow](https://langfuse.com/docs/langflow) | Python-based UI for LangChain, designed with react-flow to provide an effortless way to experiment and prototype flows.                          |

## Questions and feedback

### Ideas and roadmap
- [GitHub Discussions](https://github.com/orgs/langfuse/discussions)
- [Feature Requests](https://langfuse.com/idea)
- [Roadmap - To Come](https://langfuse.com/idea)

### Support and feedback
In order of preference the best way to communicate with us:

- [GitHub Discussions](https://github.com/orgs/langfuse/discussions): Contribute [ideas](https://langfuse.com/idea) [support requests](https://github.com/orgs/langfuse/discussions/categories/support) and [report bugs](https://github.com/langfuse/langfuse/issues/new?labels=%F0%9F%90%9E%E2%9D%94+unconfirmed+bug&projects=&template=bug_report.yml&title=bug%3A+) (preferred as we create a permanent, indexed artifact for other community members)
- - [Discord](https://langfuse.com/discord): For community support and to chat directly with maintainers
- Privately: Email contact at langfuse dot com 

## Contributing to Langfuse

- Vote on [Ideas](https://github.com/orgs/langfuse/discussions/categories/ideas)
- Raise and comment on [Issues](https://github.com/langfuse/langfuse/issues)
- Open a PR -- see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to setup a development environment.

## License

This repository is MIT licensed, except for the `ee/` folder. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.

## Misc

### GET API to export your data

[**API reference**](https://langfuse.com/docs/integrations/api)
GET routes to use data in downstream applications (e.g. embedded analytics)

### Run Langfuse in CI for integration tests

Checkout GitHub Actions workflows of [Python SDK](https://github.com/langfuse/langfuse-python/blob/main/.github/workflows/ci.yml) and [JS/TS SDK](https://github.com/langfuse/langfuse-js/blob/main/.github/workflows/ci.yml).

### Security & Privacy

We take data security and privacy seriously. Please refer to our [Security and Privacy Center](https://langfuse.com/security) for more information

### Telemetry

By default, Langfuse automatically reports basic usage statistics of self-hosted instances to a centralized server (PostHog).

This helps us to:

1. Understand how Langfuse is used and improve the most relevant features.
2. Track overall usage for internal and external (e.g. fundraising) reporting.

None of the data is shared with third parties and does not include any sensitive information. We want to be super transparent about this and you can find the exact data we collect [here](/src/features/telemetry/index.ts).

You can opt-out by setting `TELEMETRY_ENABLED=false`.

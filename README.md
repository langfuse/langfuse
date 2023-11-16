<div align="center">
   <a href="https://langfuse.com">
      <h1>🪢 Langfuse</h1>
   </a>
   <h3>
      Open source observability & analytics for LLM-based applications
   </h3>
   <div>
      <strong>Observability:</strong> Explore and debug complex logs & traces in a visual UI
   </div>
   <div>
      <strong>Analytics:</strong> Measure & improve costs, latency and response quality
   </div>
   </br>
   <div>
      <a href="https://discord.gg/7NXusRtqYU">
         <strong>Join the Langfuse Discord »</strong>
      </a>
      </br>
      <a href="https://langfuse.com">
         <strong>langfuse.com</strong>
      </a> ·
      <a href="https://langfuse.com/docs">
         <strong>Docs</strong>
      </a> ·
      <a href="https://github.com/langfuse/langfuse/issues/new?labels=%F0%9F%90%9E%E2%9D%94+unconfirmed+bug&projects=&template=bug_report.yml&title=bug%3A+">
         <strong>Report Bug</strong>
      </a> ·
      <a href="https://github.com/langfuse/langfuse/issues/new?assignees=&labels=%E2%9C%A8+enhancement&projects=&template=feature_request.yml&title=feat%3A+">
         <strong>Feature Request</strong>
      </a>
   </div>
   </br>
   <div>
      <img src="https://img.shields.io/badge/License-MIT-red.svg?style=flat-square" alt="MIT License">
      <a href="https://discord.gg/7NXusRtqYU"><img src="https://img.shields.io/discord/1111061815649124414?style=flat-square&logo=Discord&logoColor=white&label=Discord&color=%23434EE4" alt="Discord"></a>
      <a href="https://github.com/langfuse/langfuse"><img src="https://img.shields.io/github/stars/langfuse/langfuse?style=flat-square&logo=GitHub&label=langfuse%2Flangfuse" alt="Github Repo Stars"></a>
      <a href="https://github.com/langfuse/langfuse/releases"><img src="https://img.shields.io/github/v/release/langfuse/langfuse?include_prereleases&style=flat-square" alt="langfuse releases"></a>
      <a href="https://github.com/langfuse/langfuse/actions/workflows/pipeline.yml?query=branch:main"><img src="https://img.shields.io/github/actions/workflow/status/langfuse/langfuse/pipeline.yml?style=flat-square&label=All%20tests" alt="CI test status"></a>
      <a href="https://status.langfuse.com"><img src="https://uptime.betterstack.com/status-badges/v1/monitor/udlc.svg" alt="Uptime Status"/></a>
      <a href="https://www.ycombinator.com/companies/langfuse"><img src="https://img.shields.io/badge/Y%20Combinator-W23-orange?style=flat-square" alt="Y Combinator W23"></a>
      <a href="https://github.com/langfuse/langfuse/pkgs/container/langfuse"><img alt="Docker Image" src="https://img.shields.io/badge/docker-langfuse-blue?logo=Docker&logoColor=white&style=flat-square"></a>
      <a href="https://www.npmjs.com/package/langfuse"><img src="https://img.shields.io/npm/v/langfuse?style=flat-square&label=npm+langfuse" alt="langfuse npm package"></a>
      <a href="https://pypi.python.org/pypi/langfuse"><img src="https://img.shields.io/pypi/v/langfuse.svg?style=flat-square&label=pypi+langfuse" alt="langfuse Python package on PyPi"></a>
   </div>
</div>
</br>
</div>
</br>

## What is Langfuse?

Langfuse is an open source observability & analytics solution for LLM-based applications. It is mostly geared towards production usage but some users also use it for local development of their LLM applications.

Langfuse is focused on applications built on top of LLMs. Many new abstractions and common best practices evolved recently, e.g. agents, chained prompts, embedding-based retrieval, LLM access to REPLs & APIs. These make applications more powerful but also unpredictable for developers as they cannot fully anticipate how changes impact the quality, cost and overall latency of their application. Thus Langfuse helps to monitor and debug these applications.

**Demo (2 min)**

https://github.com/langfuse/langfuse/assets/2834609/6041347a-b517-4a11-8737-93ef8f8af49f

_Muted by default, enable sound for voice-over_

Explore demo project in Langfuse here (free account required): https://langfuse.com/demo

### Observability

Langfuse offers an admin UI to explore the ingested data.

- Nested view of LLM app executions; detailed information along the traces on: latency, cost, scores
- Segment execution traces by user feedback, to e.g. identify production issues

### Analytics

Reporting on

- Token usage by model
- Volume of traces
- Scores/evals

Broken down by

- Users
- Releases
- Prompt/chain versions
- Prompt/chain types
- Time

→ Expect releases with more ways to analyze the data over the next weeks.

## Get started

### Step 1: Run Server

#### Langfuse Cloud

Managed deployment by the Langfuse team, generous free-tier (hobby plan) available, no credit card required.

Links: [Create account](https://cloud.langfuse.com), [learn more](https://cloud.langfuse.com)

#### Localhost

Requirements: docker, docker compose (e.g. using Docker Desktop)

```bash
# Clone repository
git clone https://github.com/langfuse/langfuse.git
cd langfuse

# Run server and database
docker compose up -d
```

#### Self-host (Docker)

[→ Instructions](https://langfuse.com/docs/deployment/self-host)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/gmbqa_)

### Step 2: Data ingestion

#### SDKs to instrument application

Fully async, typed SDKs to instrument any LLM application. Currently available for Python & JS/TS.

→ [Guide](https://langfuse.com/docs/guides/sdk-integration) with an example of how the SDK can be used

| Package                                                                                                                                             | Description                      | Links                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [![PyPI Version](https://img.shields.io/pypi/v/langfuse.svg?style=flat-square&label=pypi+langfuse)](https://pypi.python.org/pypi/langfuse)          | Python                           | [docs](https://langfuse.com/docs/integrations/sdk/python), [repo](https://github.com/langfuse/langfuse-python) |
| [![npm Version](https://img.shields.io/npm/v/langfuse?style=flat-square&label=npm+langfuse)](https://www.npmjs.com/package/langfuse)                | JS/TS: Node >= 18, Edge runtimes | [docs](https://langfuse.com/docs/integrations/sdk/typescript), [repo](https://github.com/langfuse/langfuse-js) |
| [![npm package](https://img.shields.io/npm/v/langfuse-node?style=flat-square&label=npm+langfuse-node)](https://www.npmjs.com/package/langfuse-node) | JS/TS: Node <18                  | [docs](https://langfuse.com/docs/integrations/sdk/typescript), [repo](https://github.com/langfuse/langfuse-js) |

#### Langchain applications

The Langfuse callback handler automatically instruments Langchain applications. Currently available for Python and JS/TS.

**Python**

```shell
pip install langfuse
```

```python
# Initialize Langfuse handler
from langfuse.callback import CallbackHandler
handler = CallbackHandler(PUBLIC_KEY, SECRET_KEY)

# Setup Langchain
from langchain.chains import LLMChain
...
chain = LLMChain(llm=llm, prompt=prompt)

# Add Langfuse handler as callback
chain.run(input="<user_input", callbacks=[handler])
```

→ [Langchain integration docs for Python](https://langfuse.com/docs/integrations/langchain/python)

**JS/TS**

→ [Langchain integration docs for JS/TS](https://langfuse.com/docs/integrations/langchain/typescript)

#### Add scores/evaluations to traces (optional)

Quality/evaluation of traces is tracked via scores ([docs](https://langfuse.com/docs/scores)). Scores are related to traces and optionally to observations. Scores can be added via:

- **Backend SDKs** (see docs above): `{trace, event, span, generation}.score()`
- **API** (see docs below): `POST /api/public/scores`
- **Client-side using Web SDK**, e.g. to capture user feedback or other user-based quality metrics:

  ```sh
  npm install langfuse
  ```

  ```ts
  // Client-side (browser)

  import { LangfuseWeb } from "langfuse";

  const langfuseWeb = new LangfuseWeb({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  });

  // frontend handler (example: React)
  export function UserFeedbackComponent(props: { traceId: string }) {
    const handleUserFeedback = async (value: number) => {
      await langfuseWeb.score({
        traceId: props.traceId,
        name: "user_feedback",
        value,
      });
    };
    return (
      <div>
        <button onClick={() => handleUserFeedback(1)}>👍</button>
        <button onClick={() => handleUserFeedback(-1)}>👎</button>
      </div>
    );
  }
  ```

#### API

[**Api reference**](https://langfuse.com/docs/integrations/api)

- POST/PATCH routes to ingest data
- GET routes to use data in downstream applications (e.g. embedded analytics)

## Questions / Feedback

The maintainers are very active in the Langfuse [Discord](https://langfuse.com/discord) and are happy to answer questions or discuss feedback/ideas regarding the future of the project.

## Contributing to Langfuse

Join the community [on Discord](https://discord.gg/7NXusRtqYU).

To contribute, send us a PR, raise a GitHub issue, or email at contributing@langfuse.com

### Development setup

Requirements: Node.js >=18, npm, Docker

```bash
# Install dependencies
npm install

# Run the db
docker-compose -f docker-compose.dev.yml up -d

# create an env file
cp .env.dev.example .env

# Migration
npm run db:migrate

# Optional: seed the database
# npm run db:seed
# npm run db:seed:examples

# Start the server
npm run dev
```

Run tests

```bash
npm run test
```

## License

Langfuse is MIT licensed, except for `ee/` folder. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.

## Misc

### Upgrade Langfuse (localhost)

```bash
# Stop server and db
docker compose down

# Pull latest changes
git pull
docker-compose pull

# Run server and db
docker compose up -d
```

### Run Langfuse in CI for integration tests

Checkout GitHub Actions workflows of [Python SDK](https://github.com/langfuse/langfuse-python/blob/main/.github/workflows/ci.yml) and [JS/TS SDK](https://github.com/langfuse/langfuse-js/blob/main/.github/workflows/ci.yml).

### Telemetry

By default, Langfuse automatically reports basic usage statistics to a centralized server (PostHog).

This helps us to:

1. Understand how Langfuse is used and improve the most relevant features.
2. Track overall usage for internal and external (e.g. fundraising) reporting.

None of the data is shared with third parties and does not include any sensitive information. We want to be super transparent about this and you can find the exact data we collect [here](/src/pages/api/cron/telemetry.ts).

You can opt-out by setting `TELEMETRY_ENABLED=false`.

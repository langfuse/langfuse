<div align="center">
  <a href="https://langfuse.com">
    <img alt="langfuse Logo" src="https://github.com/langfuse/langfuse/blob/main/readme.png" alt="Logo" width="400">
  </a>

<h3 align="center">open source tracing and feedback collection for LLM applications</h3>
</div>

<p align="center">   
   <a href="https://langfuse.com/docs"><strong>Explore the docs »</strong></a> </br>
  <a href="https://langfuse.com"><strong>Website »</strong></a> |  <a href="https://discord.gg/7NXusRtqYU"><strong>Join our Discord »</strong></a>  | <a href="mailto:help@langfuse.com">help@langfuse.com</a>
</p>

# 🧐 Introduction

langfuse helps you debug and improve your LLM-based application by logging/analyzing all user interactions, backend traces, and explicit/implicit user feedback.

# 🤖 Features

1. Data collection
   - Tracing LLM application, chain, agent via backend SDK
   - Feedback collection from users via frontend SDKs
2. Data exploration
   - Identify issues
   - Debug LLM application
3. Store user-generated prompt/completion/feedback sets
   - For few-shot prompts
   - For fine-tuning

# 🚴‍ Get started

[Quickstart](https://langfuse.com/docs/get-started)
[Demo](https://langfuse.com/#walkthrough-3-min)

# 🏡 Run locally

Follow the steps below to set up the environment via docker-compose. Both the server and the database will be running in docker containers.

```bash
# execute docker-compose
docker-compose up
```

Use the API or SDKs to integrate langfuse with your application

# 👨‍💻 Development

Follow the steps below to setup the development environment.

## Set up the application locally

Follow the steps below to set up a dev environment. You will have a postgres database running in a docker container. The server will be started using NPM.

```bash
# create env file
cp .env.dev.example .env
# Install dependencies
npm install
# Run the db
docker-compose -f docker-compose.dev.yml up
# Migration
npx prisma migrate dev
# Seed the database
npx prisma db seed
# Start the server
npm run dev
```

# 🚜 Production Deployment

## Build a Docker container

The following instructions explain how to create a single container for deployment. The container will contain the server but no database. Please adjust the db url in the .env file to point to your database.

```bash
# build the container
docker build \
--build-arg DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/postgres \
--build-arg NEXTAUTH_SECRET=mysecret \
--build-arg NEXTAUTH_URL=http:localhost:3030 \
-t langfuse .
# run the container
docker run \
--env DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/postgres \
--env NEXTAUTH_SECRET=mysecret \
--env NEXTAUTH_URL=http:localhost:3030 \
-p 3030:3000 \
-a STDOUT langfuse
```

## Generate SDKs

```bash
# in the langfuse repo
# install fern CLI: https://docs.buildwithfern.com/compiler/cli-reference
fern generate --api server
fern generate --api client

# in the client repo
npm install --save @finto-fern/api-client

# update the client in the client repo
# install ncu via: https://www.npmjs.com/package/npm-check-updates
ncu -u && npm update --save
```

# 👫 Contributing

Join the community [on Discord](https://discord.com/invite/DNDAarxE).

To contribute code, send us a PR, raise a github issue, or email at contributing@langfuse.com

# 🥷 Authors

- Max Deichmann ([@maxdeichmann](https://github.com/maxdeichmann))
- Marc Klingen ([@marcklingen](https://github.com/marcklingen))
- Clemens Rawert ([@clemra](https://github.com/clemra))

# 📜 License

langfuse is MIT licensed, except for `ee/` folder. See [LICENSE](LICENSE) and [docs](https://langfuse.com/docs/open-source) for more details.

# Langfuse

Langfuse is an observability platform for LLM native applications.

For more information, see the [Langfuse documentation](https://docs.langfuse.com).

## Use locally

Follow the steps below to set up the environment via docker-compose. Both the server and the database will be running in docker containers.

```bash
# create env file
cp .env.local.example .env
# execute docker-compose
docker-compose up
```

## Development

Follow the steps below to setup the development environment.

### Set up the application locally

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

## Production Deployment

### Build a Docker container

The following instructions explain how to create a single container for deployment. The container will contain the server but no database.

```bash
# create env file
cp .env.dev.example .env
# build the container
docker build -t langfuse .
# run the container
docker run -dp 3030:3000 langfuse
```

### Generate SDKs

```bash
# in the langfuse repo
# install fern CLI: https://docs.buildwithfern.com/compiler/cli-reference
fern generate

# in the client repo
npm install --save @finto-fern/api-client

# update the client in the client repo
# install ncu via: https://www.npmjs.com/package/npm-check-updates
ncu -u && npm update --save
```

### UI Libraries

- https://ui.shadcn.com/
- https://tailwindui.com/

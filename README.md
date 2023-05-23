# Langfuse

Langfuse is an observability platform for LLM native applications.

## Use locally

Follow the steps below to set up the environment via docker-compose. Both the server and the database will be running in docker containers.

```bash
# create env file
cp .env.local.example .env
# execute docker-compose
docker-compose -f docker-compose.local.yml up
```

## Development

Follow the steps below to setup the development environment.

### Setup env variables

Copy the `.env.dev.example` file to `.env` and fill in the values.

### Set up the application locally

Follow the steps below to set up a dev environment. You will have a postgres database running in a docker container. The server will be started using NPM.

```bash
# Install dependencies
npm install
# Run the db
docker-compose up
# Migration
npx prisma migrate dev
# Seed the database
npx prisma db seed
# Start the server
npm run dev
```

## Production Deployment

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

### Build a Docker container

The following instructions explain how to create a single container for deployment. The container will contain the server but no database.

```bash
# create env file
cp .env.dev.example .env
# build the container
docker build -t langfuse .
# run the container
docker run -dp 3000:3000 langfuse
```

```

### UI Libraries

- https://ui.shadcn.com/
- https://tailwindui.com/
```

# Langfuse

Langfuse is an observability platform for LLM native applications.

## Development

To get it running, follow the steps below

### Setup env variables

Copy the `.env.example` file to `.env` and fill in the values.

### Install dependencies

```bash
npm install
```

### Migration

```bash
npx prisma migrate dev
```

### Seed the database

```bash
npx prisma db seed
```

### Start the server

```bash
npm run dev
```

### Generate SDKs

```bash
for lang in python typescript; do
  openapi-generator generate -i http://localhost:3000/api/doc -g $lang -o ./sdk/$lang;
done
```

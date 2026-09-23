## REST

- `GET /api/public/v1/skills`
- `POST /api/public/v1/skills`
- `POST /api/public/v1/skills/blobs`
- `GET /api/public/v1/skills/{skillName}`
- `GET /api/public/v1/skills/files/{fileId}/content`
- `PATCH /api/public/v1/skills/{skillName}/versions/{skillVersion}`
- `DELETE /api/public/v1/skills/{skillName}/versions/{skillVersion}`

## tRPC

- Query: `skills.all`
- Query: `skills.filterOptions`
- Query: `skills.byName`
- Query: `skills.fileDownload`
- Query: `skills.allVersions`
- Mutation: `skills.prepareUploads`
- Mutation: `skills.createVersion`
- Mutation: `skills.setLabels`
- Mutation: `skills.setTags`
- Mutation: `skills.deleteVersion`
- Mutation: `skills.deleteSkill`

## MCP

Tools at `/api/public/mcp`:

- `listSkills`
- `getSkill`

### Upload new skill version

```mermaid
sequenceDiagram
    participant client as Client
    participant service as SkillService
    participant s3 as AWS S3
    participant db as Postgres

    client->>client: Compute base64 SHA-256 for each file
    client->>service: Prepare uploads with hash, content type and byte length
    service->>db: Create or reuse SkillBlob by project + hash
    service-->>client: blobIds + presigned PUT URLs bound to SHA-256 and metadata
    client->>s3: PUT bytes directly with x-amz-checksum-sha256 (skip verified blobs)
    s3->>s3: Validate SHA-256 and store bytes
    s3-->>client: Upload successful
    client->>service: Create version with file paths + blobIds
    service->>s3: HEAD every referenced blob
    s3-->>service: Content-Length only, no file bytes
    service->>service: Verify declared byte lengths
    service->>db: Set missing uploadedAt timestamps outside version transaction
    service->>s3: GET SKILL.md only
    s3-->>service: SKILL.md bytes
    service->>service: Parse frontmatter
    service->>db: Commit version, file references, labels and audit entries atomically
    service-->>client: New version (no S3 copy or move)
```

### Open a skill in the UI

```mermaid
sequenceDiagram
    title
    participant ui as Browser UI
    participant api as tRPC / SkillService
    participant s3 as S3 / Blob Storage

    ui->>api: skills.byName(projectId, name, version or latest label)
    api-->>ui: Version metadata + file manifest (no bytes or URLs)
    ui->>ui: Show file tree and select SKILL.md initially
    ui->>ui: Open selected file only
    alt Content cached by projectId + blobId
        ui->>ui: Render cached content
    else Content not cached
        ui->>api: skills.fileDownload(projectId, fileId)
        api->>api: Check project access and persisted file ownership
        api-->>ui: JSON with presigned GET URL + expiry
        ui->>s3: GET selected file directly
        s3-->>ui: File bytes (never through backend)
        ui->>ui: Cache content and render editor
    end
```

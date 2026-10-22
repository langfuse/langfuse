## REST

- `GET /api/public/skills`
- `POST /api/public/skills`
- `GET /api/public/skills/{skillName}`
- `PATCH /api/public/skills/{skillName}`
- `GET /api/public/skills/files/content?sha256Hashes=hash1,hash2`
- `PATCH /api/public/skills/{skillName}/versions/{skillVersion}`
- `DELETE /api/public/skills/{skillName}/versions/{skillVersion}`

## tRPC

- Query: `skills.all`
- Query: `skills.filterOptions`
- Query: `skills.byName`
- Query: `skills.fileContents`
- Query: `skills.skillVersions`
- Mutation: `skills.createVersion`
- Mutation: `skills.setLabels`
- Mutation: `skills.setTags`
- Mutation: `skills.deleteVersion`
- Mutation: `skills.deleteSkill`

## MCP

Tools at `/api/public/mcp`:

- `listSkills`
- `getSkill`
- `loadSkill`
- `loadSkillResource`

These read-only tools are available to the in-app assistant with `skills:read`
access. Use the version returned by `getSkill` when loading multiple files to
keep resources pinned to the same immutable skill version.

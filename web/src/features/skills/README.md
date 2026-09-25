## REST

- `GET /api/public/unstable/skills`
- `POST /api/public/unstable/skills`
- `GET /api/public/unstable/skills/{skillName}`
- `PATCH /api/public/unstable/skills/{skillName}`
- `GET /api/public/unstable/skills/files/{fileId}/content`
- `PATCH /api/public/unstable/skills/{skillName}/versions/{skillVersion}`
- `DELETE /api/public/unstable/skills/{skillName}/versions/{skillVersion}`

## tRPC

- Query: `skills.all`
- Query: `skills.filterOptions`
- Query: `skills.byName`
- Query: `skills.fileContent`
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

# Span Iframe Configuration Implementation

This document outlines the implementation of custom iframe renderers for span data in the Langfuse trace viewer.

## Overview

The implementation allows users to configure custom iframe renderers that appear as additional view options in the span details. Users can:

- Create multiple iframe configurations per project
- Filter configurations by span name (optional)
- Use template variables in URLs ({{input}}, {{output}}, {{metadata}})
- Switch between "Formatted", "JSON", and custom iframe views
- Configure iframe settings through project settings

## Implementation Details

### 1. Database Schema

Added `SpanIframeConfig` table in `packages/shared/prisma/schema.prisma`:

```prisma
model SpanIframeConfig {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  projectId String  @map("project_id")
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  name        String  @map("name")
  description String? @map("description")
  url         String  @map("url")
  spanName    String? @map("span_name") // Optional filter by span name

  @@unique([projectId, name])
  @@index([projectId])
  @@map("span_iframe_configs")
}
```

### 2. Backend API

Created TRPC router at `web/src/features/span-iframe-configs/server/router.ts`:

- `create` - Create new iframe configuration
- `update` - Update existing configuration  
- `delete` - Delete configuration
- `all` - Get all configurations for a project
- `byId` - Get specific configuration
- `forSpan` - Get applicable configurations for a span (filtered by span name)

**Security Features:**
- HTTPS-only URLs enforced
- Project-level access control using "integrations:CRUD" scope
- Audit logging for all operations

### 3. Frontend Components

#### Project Settings
- `SpanIframeConfigSettings.tsx` - Main settings page component
- `SpanIframeConfigDialog.tsx` - Create/edit dialog with form validation

#### Span Rendering
- `SpanIframeRenderer.tsx` - Iframe component with messaging support
- `templateUtils.ts` - URL template replacement and messaging utilities

### 4. Integration with Trace Viewer

Updated `ObservationPreview.tsx` to:
- Query applicable iframe configurations
- Extend view selector with custom iframe options
- Render iframe components alongside "Formatted" and "JSON" views
- Handle iframe-specific view state

## Features

### Template System
URLs support simple template replacement:
- `{{input}}` - Replaced with JSON-encoded span input
- `{{output}}` - Replaced with JSON-encoded span output  
- `{{metadata}}` - Replaced with JSON-encoded span metadata

### Iframe Communication
Implements messaging protocol for iframe communication:
- Settings messages (theme, read-only status)
- Data messages (span data)
- Request data messages (iframe can request data)

### Security
- HTTPS-only URLs enforced at validation
- Iframe sandbox restrictions (`allow-scripts allow-same-origin`)
- Message origin verification

### Filtering
- Optional span name filtering per configuration
- Configurations apply to matching spans or globally if no filter

## Project Settings Integration

Added new settings page accessible at:
`/project/{projectId}/settings?page=span-iframe-configs`

## Usage Example

1. **Create Configuration:**
   - Name: "Image Viewer"
   - URL: `https://example.com/viewer?data={{output}}`
   - Span Filter: "image_generation" (optional)

2. **View in Trace:**
   - Navigate to a span with matching name (if filtered)
   - View selector shows: "Formatted", "JSON", "Image Viewer"
   - Select "Image Viewer" to see custom rendering

## Next Steps

### Required to Complete:
1. **Database Migration**: Run Prisma migration to create tables
2. **Access Controls**: Add span iframe specific scopes to RBAC
3. **Testing**: Test with actual iframe URLs
4. **Documentation**: Add user-facing documentation

### Future Enhancements:
1. **Advanced Templating**: Support nested field access (e.g., {{input.question}})
2. **Bi-directional Communication**: Support iframe updating span data
3. **Configuration Templates**: Pre-built configurations for common use cases
4. **URL Validation**: Allowlist specific domains for security
5. **Iframe Sizing**: Configurable iframe dimensions

## Files Modified/Created

### New Files:
- `web/src/features/span-iframe-configs/server/router.ts`
- `web/src/features/span-iframe-configs/components/SpanIframeConfigSettings.tsx`
- `web/src/features/span-iframe-configs/components/SpanIframeConfigDialog.tsx`
- `web/src/features/span-iframe-configs/components/SpanIframeRenderer.tsx`
- `web/src/features/span-iframe-configs/utils/templateUtils.ts`

### Modified Files:
- `packages/shared/prisma/schema.prisma` - Added SpanIframeConfig model
- `web/src/server/api/root.ts` - Added router to API
- `web/src/features/audit-logs/auditLog.ts` - Added audit resource type
- `web/src/pages/project/[projectId]/settings/index.tsx` - Added settings page
- `web/src/components/trace/ObservationPreview.tsx` - Integrated iframe rendering

## Testing

To test the implementation:

1. Start development server: `pnpm dx-f`
2. Run database migration to create tables
3. Navigate to project settings → Span Iframe Configs
4. Create a test configuration with a simple iframe URL
5. View a span to see the new view option

## Security Considerations

- All iframe URLs must use HTTPS
- Iframes are sandboxed with limited permissions
- Message handling includes origin verification
- Access control through existing RBAC system
- Audit logging for configuration changes
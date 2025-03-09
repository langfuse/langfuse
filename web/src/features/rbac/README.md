# Role-Based Access Control (RBAC) in Langfuse

This folder contains the implementation of Langfuse's role-based access control system, which manages permissions at both organization and project levels.

## Role Hierarchy

Langfuse uses a hierarchical role system (from highest to lowest privileges):

- `OWNER`: Full access to all resources
- `ADMIN`: Administrative access with some limitations
- `MEMBER`: Standard user access
- `VIEWER`: Read-only access
- `NONE`: No access (falls back to organization-level permissions)

## Permission Structure

Permissions are defined as scopes in the format `resource:action`, such as:

- `project:read`
- `projectMembers:CUD` (Create, Update, Delete)
- `objects:publish`

## Key Components

- **Constants**:

  - `organizationAccessRights.ts`: Defines organization-level permissions
  - `projectAccessRights.ts`: Defines project-level permissions
  - `orderedRoles.ts`: Defines the role hierarchy

- **Utils**:

  - `checkOrganizationAccess.ts`: Functions to verify organization-level access
  - `checkProjectAccess.ts`: Functions to verify project-level access

- **Server**:

  - API routes for managing members and invitations
  - Implements access control checks in TRPC procedures

- **Components**:
  - UI components for managing members and roles

## Usage

### Server-side Access Control

```typescript
// Check if user has access to a specific organization scope
throwIfNoOrganizationAccess({
  session,
  organizationId,
  scope: "organizationMembers:read",
});

// Check if user has access to a specific project scope
throwIfNoProjectAccess({
  session,
  projectId,
  scope: "project:update",
});
```

### Client-side Access Control

```typescript
// React hooks for UI-based access control
const hasAccess = useHasOrganizationAccess({
  organizationId,
  scope: "organizationMembers:read",
});

const hasProjectAccess = useHasProjectAccess({
  projectId,
  scope: "project:update",
});
```

## Role Inheritance

Project-level permissions can override organization-level permissions. If a user has the `NONE` role for a project, they fall back to their organization-level permissions.

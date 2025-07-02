# JWT Token Revocation Strategy for Langfuse

## Executive Summary

Your current JWT-based authentication with NextAuth is **well-suited** for handling user access revocation. You don't need to switch to session-based auth. The session callback already provides the foundation for real-time access control.

## Current Architecture Advantages

1. **Real-time Database Lookups**: Your session callback fetches fresh user data on every request
2. **Organization/Project RBAC**: Already handles role-based access control
3. **Null User Handling**: Session callback returns `user: null` when database user doesn't exist
4. **Existing User Management**: You already have endpoints to remove users from organizations/projects

## Recommended Implementation Strategy

### 1. Enhanced Session Callback (✅ Already Implemented)

Your enhanced session callback now:
- Returns `user: null` when user doesn't exist in database
- Returns `user: null` when user has no organization memberships (unless admin)
- Provides immediate revocation when users are removed from organizations

### 2. Database Schema Extensions (Optional)

For more granular control, consider adding these optional fields to your User model:

```prisma
model User {
  // ... existing fields
  
  // Optional: Soft delete support
  deletedAt     DateTime?  @map("deleted_at")
  
  // Optional: User blocking
  isBlocked     Boolean    @default(false) @map("is_blocked")
  blockedAt     DateTime?  @map("blocked_at")
  blockedReason String?    @map("blocked_reason")
  
  // Optional: Token revocation timestamp
  tokensRevokedAt DateTime? @map("tokens_revoked_at")
}

// Optional: Token revocation table for audit trail
model TokenRevocation {
  id         String   @id @default(cuid())
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  jwtId      String?  @map("jwt_id") // Optional: for specific JWT revocation
  revokedAt  DateTime @default(now()) @map("revoked_at")
  reason     String?
  revokedBy  String?  @map("revoked_by")
  
  @@index([userId])
  @@index([revokedAt])
  @@map("token_revocations")
}
```

### 3. User Revocation Mechanisms

#### A. Immediate Revocation (Current Implementation)
```typescript
// Remove user from organization - immediate effect
await prisma.organizationMembership.delete({
  where: { id: membershipId }
});
// Next request will return user: null due to session callback logic
```

#### B. Enhanced Revocation with Audit Trail
```typescript
// Enhanced user revocation service
export class UserRevocationService {
  static async revokeUserAccess(
    userId: string,
    reason: string,
    revokedBy: string
  ) {
    await prisma.$transaction([
      // Remove all organization memberships
      prisma.organizationMembership.deleteMany({
        where: { userId }
      }),
      
      // Optional: Add to revocation audit log
      prisma.tokenRevocation.create({
        data: {
          userId,
          reason,
          revokedBy,
          revokedAt: new Date()
        }
      })
    ]);
  }
  
  static async blockUser(userId: string, reason: string) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        isBlocked: true,
        blockedAt: new Date(),
        blockedReason: reason,
        tokensRevokedAt: new Date() // Force re-authentication
      }
    });
  }
}
```

### 4. Integration Points

#### A. Organization Member Removal
Update your existing member deletion endpoints:

```typescript
// In membersRouter.ts deleteMembership mutation
export const deleteMembership = protectedOrganizationProcedure
  .mutation(async ({ input, ctx }) => {
    // ... existing logic ...
    
    const result = await ctx.prisma.organizationMembership.delete({
      where: { id: orgMembershipId }
    });
    
    // Optional: Add revocation audit log
    await auditLog({
      session: ctx.session,
      resourceType: "userRevocation",
      resourceId: result.userId,
      action: "revoke_org_access",
      after: { orgId: input.orgId, reason: "Removed from organization" }
    });
    
    return result;
  });
```

#### B. Enhanced Session Callback
Your session callback can be further enhanced:

```typescript
async session({ session, token }): Promise<Session> {
  const dbUser = await prisma.user.findUnique({
    where: { email: token.email!.toLowerCase() },
    select: {
      id: true,
      // ... existing fields ...
      isBlocked: true,
      deletedAt: true,
      tokensRevokedAt: true,
      organizationMemberships: { /* ... */ }
    }
  });

  // Enhanced revocation checks
  if (!dbUser || 
      dbUser.deletedAt || 
      dbUser.isBlocked ||
      (dbUser.tokensRevokedAt && dbUser.tokensRevokedAt > new Date(token.iat * 1000))) {
    return { ...session, user: null };
  }

  // Check organization memberships
  if (dbUser.organizationMemberships.length === 0 && !dbUser.admin) {
    return { ...session, user: null };
  }

  // ... rest of session logic
}
```

## Implementation Phases

### Phase 1: Current Setup (✅ Complete)
- Enhanced session callback with organization membership checks
- Immediate revocation when users removed from organizations
- Existing user management endpoints

### Phase 2: Enhanced Logging (Optional)
- Add audit logging to user removal actions
- Track revocation reasons and timestamps
- Monitor revocation events

### Phase 3: Advanced Features (Optional)
- Add user blocking capability
- Implement token timestamp-based revocation
- Add bulk user revocation for organization deletion
- Automated cleanup of old revocation records

## FAQ

### Q: Do we need to switch to session-based auth?
**A: No.** Your current JWT setup with database lookups in the session callback provides the same revocation capabilities as session-based auth, with better scalability.

### Q: How fast is revocation with this approach?
**A: Immediate.** Since every request triggers the session callback, revocation takes effect on the next request (typically < 1 second).

### Q: Can we maintain a JWT blacklist?
**A: Yes, but it's not necessary.** Your current approach of removing database records is more efficient and achieves the same result.

### Q: What about users with long-lived JWTs?
**A: Not a problem.** Since you validate against the database on every request, even long-lived JWTs are effectively revoked when users are removed from organizations.

### Q: How do we handle bulk revocations?
**A: Use transactions.** When deleting organizations or projects, remove all associated memberships in a single transaction.

## Security Considerations

1. **Database Dependencies**: Your revocation system depends on database availability
2. **Performance**: Session callback runs on every request - ensure database queries are optimized
3. **Audit Trail**: Consider logging all revocation events for compliance
4. **Grace Periods**: Consider implementing grace periods for accidental removals
5. **Admin Override**: Ensure admin users can always access the system for emergency situations

## Conclusion

Your current architecture provides robust, immediate user revocation capabilities without requiring a switch to session-based authentication. The enhancements suggested here build upon your existing foundation and can be implemented incrementally as needed.
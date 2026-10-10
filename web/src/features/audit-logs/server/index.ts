// The audit-logs feature's server surface (RFC rule 9, amended). auditLog
// writes through Prisma, so it has no client-safe surface: every caller is
// server code and reaches it through here.
export {
  auditLog,
  type AuditLogActor,
} from "@/src/features/audit-logs/auditLog";

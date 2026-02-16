import prisma from "../prisma.js";

export async function logAudit({
  userId,
  action,
  entityType,
  entityId = null,
  payload = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        payload: payload ? JSON.stringify(payload) : null,
      },
    });
  } catch (error) {
    // Audit logging should never block business actions.
    console.error("Audit log failed:", error.message);
  }
}

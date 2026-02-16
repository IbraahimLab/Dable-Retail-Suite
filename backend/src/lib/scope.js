import { RoleCode } from "@prisma/client";

export function queryBranchId(req) {
  if (req.user.role.code === RoleCode.ADMIN) {
    return Number(req.query.branchId || req.user.branchId);
  }
  return Number(req.user.branchId);
}

export function bodyBranchId(req, bodyBranchId) {
  if (req.user.role.code === RoleCode.ADMIN) {
    return Number(bodyBranchId || req.user.branchId);
  }
  return Number(req.user.branchId);
}

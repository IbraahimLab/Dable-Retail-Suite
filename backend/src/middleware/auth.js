import jwt from "jsonwebtoken";
import prisma from "../prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role.code,
      branchId: user.branchId,
    },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
}

export async function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = authHeader.slice("Bearer ".length).trim();
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { role: true, branch: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!roles.includes(req.user.role.code)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

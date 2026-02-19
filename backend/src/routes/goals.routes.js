import dayjs from "dayjs";
import express from "express";
import {
  AuditAction,
  GoalPeriod,
  GoalStatus,
  RoleCode,
  TaskPriority,
} from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { safeNumber } from "../lib/common.js";
import { bodyBranchId, queryBranchId } from "../lib/scope.js";

const router = express.Router();

const PERIOD_SET = new Set(Object.values(GoalPeriod));
const STATUS_SET = new Set(Object.values(GoalStatus));
const PRIORITY_SET = new Set(Object.values(TaskPriority));

function parseDate(value) {
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed;
}

function validBranchId(branchId) {
  return Number.isFinite(branchId) && branchId > 0;
}

function progressPercent(goal) {
  const target = Number(goal.targetValue || 0);
  if (target <= 0) {
    return null;
  }
  const current = Number(goal.currentValue || 0);
  return Math.max(0, Math.min(100, Number(((current / target) * 100).toFixed(2))));
}

router.use(authRequired);
router.use(authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER));

router.get("/goals", async (req, res) => {
  const branchId = queryBranchId(req);
  if (!validBranchId(branchId)) {
    return res.status(400).json({ message: "Valid branchId is required." });
  }

  const periodType = req.query.periodType
    ? String(req.query.periodType).toUpperCase()
    : null;
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;

  if (periodType && !PERIOD_SET.has(periodType)) {
    return res.status(400).json({ message: "Invalid periodType." });
  }
  if (status && !STATUS_SET.has(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  const goals = await prisma.goal.findMany({
    where: {
      branchId,
      ...(periodType ? { periodType } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      createdBy: {
        select: { id: true, fullName: true, username: true },
      },
      tasks: {
        select: { id: true, isDone: true },
      },
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });

  return res.json(
    goals.map((goal) => {
      const totalTasks = goal.tasks.length;
      const completedTasks = goal.tasks.filter((task) => task.isDone).length;
      const { tasks, ...rest } = goal;
      return {
        ...rest,
        totalTasks,
        completedTasks,
        progressPercent: progressPercent(goal),
      };
    }),
  );
});

router.post("/goals", async (req, res) => {
  const branchId = bodyBranchId(req, req.body.branchId);
  if (!validBranchId(branchId)) {
    return res.status(400).json({ message: "Valid branchId is required." });
  }

  const title = String(req.body.title || "").trim();
  const periodType = String(req.body.periodType || "").toUpperCase();
  const periodLabel = String(req.body.periodLabel || "").trim();
  const startDate = parseDate(req.body.startDate);
  const endDate = parseDate(req.body.endDate);
  const status = req.body.status
    ? String(req.body.status).toUpperCase()
    : GoalStatus.ACTIVE;

  if (!title) {
    return res.status(400).json({ message: "title is required." });
  }
  if (!PERIOD_SET.has(periodType)) {
    return res.status(400).json({ message: "periodType must be YEAR, MONTH, or WEEK." });
  }
  if (!periodLabel) {
    return res.status(400).json({ message: "periodLabel is required." });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate and endDate must be valid dates." });
  }
  if (endDate.isBefore(startDate)) {
    return res.status(400).json({ message: "endDate must be after startDate." });
  }
  if (!STATUS_SET.has(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  const rawTargetValue = req.body.targetValue;
  let targetValue = null;
  if (!(rawTargetValue === null || rawTargetValue === undefined || rawTargetValue === "")) {
    targetValue = Number(rawTargetValue);
  }
  const currentValue =
    req.body.currentValue === undefined || req.body.currentValue === ""
      ? 0
      : Number(req.body.currentValue);
  if (targetValue !== null && (targetValue < 0 || Number.isNaN(targetValue))) {
    return res.status(400).json({ message: "targetValue must be a positive number." });
  }
  if (Number.isNaN(currentValue) || currentValue < 0) {
    return res.status(400).json({ message: "currentValue cannot be negative." });
  }

  const goal = await prisma.goal.create({
    data: {
      branchId,
      title,
      description: String(req.body.description || "").trim() || null,
      periodType,
      periodLabel,
      startDate: startDate.toDate(),
      endDate: endDate.toDate(),
      targetValue,
      currentValue,
      status,
      createdById: req.user.id,
    },
  });
  await logAudit({
    userId: req.user.id,
    action: AuditAction.CREATE,
    entityType: "goal",
    entityId: goal.id,
    payload: goal,
  });

  return res.status(201).json({
    ...goal,
    progressPercent: progressPercent(goal),
  });
});

router.patch("/goals/:id", async (req, res) => {
  const goalId = Number(req.params.id);
  if (!Number.isFinite(goalId) || goalId <= 0) {
    return res.status(400).json({ message: "Invalid goal id." });
  }
  const branchId = bodyBranchId(req, req.body.branchId);
  if (!validBranchId(branchId)) {
    return res.status(400).json({ message: "Valid branchId is required." });
  }

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, branchId },
  });
  if (!existing) {
    return res.status(404).json({ message: "Goal not found." });
  }

  const data = {};
  if ("title" in req.body) {
    const title = String(req.body.title || "").trim();
    if (!title) {
      return res.status(400).json({ message: "title cannot be empty." });
    }
    data.title = title;
  }
  if ("description" in req.body) {
    data.description = String(req.body.description || "").trim() || null;
  }
  if ("periodType" in req.body) {
    const periodType = String(req.body.periodType || "").toUpperCase();
    if (!PERIOD_SET.has(periodType)) {
      return res.status(400).json({ message: "Invalid periodType." });
    }
    data.periodType = periodType;
  }
  if ("periodLabel" in req.body) {
    const label = String(req.body.periodLabel || "").trim();
    if (!label) {
      return res.status(400).json({ message: "periodLabel cannot be empty." });
    }
    data.periodLabel = label;
  }
  if ("startDate" in req.body) {
    const startDate = parseDate(req.body.startDate);
    if (!startDate) {
      return res.status(400).json({ message: "Invalid startDate." });
    }
    data.startDate = startDate.toDate();
  }
  if ("endDate" in req.body) {
    const endDate = parseDate(req.body.endDate);
    if (!endDate) {
      return res.status(400).json({ message: "Invalid endDate." });
    }
    data.endDate = endDate.toDate();
  }
  if ("targetValue" in req.body) {
    const rawTargetValue = req.body.targetValue;
    if (rawTargetValue === "" || rawTargetValue === null) {
      data.targetValue = null;
    } else {
      const targetValue = safeNumber(rawTargetValue, null);
      if (targetValue === null || targetValue < 0 || Number.isNaN(targetValue)) {
        return res.status(400).json({ message: "targetValue must be a positive number." });
      }
      data.targetValue = targetValue;
    }
  }
  if ("currentValue" in req.body) {
    const currentValue = safeNumber(req.body.currentValue, -1);
    if (currentValue < 0) {
      return res.status(400).json({ message: "currentValue must be zero or positive." });
    }
    data.currentValue = currentValue;
  }
  if ("status" in req.body) {
    const status = String(req.body.status || "").toUpperCase();
    if (!STATUS_SET.has(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }
    data.status = status;
  }

  const nextStart = dayjs(data.startDate || existing.startDate);
  const nextEnd = dayjs(data.endDate || existing.endDate);
  if (nextEnd.isBefore(nextStart)) {
    return res.status(400).json({ message: "endDate must be after startDate." });
  }
  if (Object.keys(data).length === 0) {
    return res.json({
      ...existing,
      progressPercent: progressPercent(existing),
    });
  }

  const goal = await prisma.goal.update({
    where: { id: goalId },
    data,
  });
  await logAudit({
    userId: req.user.id,
    action: AuditAction.UPDATE,
    entityType: "goal",
    entityId: goal.id,
    payload: data,
  });

  return res.json({
    ...goal,
    progressPercent: progressPercent(goal),
  });
});

router.get("/daily-tasks", async (req, res) => {
  const branchId = queryBranchId(req);
  if (!validBranchId(branchId)) {
    return res.status(400).json({ message: "Valid branchId is required." });
  }

  const selected = req.query.date ? parseDate(req.query.date) : dayjs();
  if (!selected) {
    return res.status(400).json({ message: "Invalid date." });
  }

  const start = selected.startOf("day").toDate();
  const end = selected.endOf("day").toDate();

  const tasks = await prisma.dailyTask.findMany({
    where: {
      branchId,
      taskDate: { gte: start, lte: end },
    },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
          periodType: true,
          periodLabel: true,
          status: true,
        },
      },
      createdBy: {
        select: { id: true, fullName: true, username: true },
      },
    },
    orderBy: [{ isDone: "asc" }, { createdAt: "asc" }],
  });

  return res.json(tasks);
});

router.post("/daily-tasks", async (req, res) => {
  const branchId = bodyBranchId(req, req.body.branchId);
  if (!validBranchId(branchId)) {
    return res.status(400).json({ message: "Valid branchId is required." });
  }

  const title = String(req.body.title || "").trim();
  const taskDate = req.body.taskDate ? parseDate(req.body.taskDate) : dayjs();
  const priority = req.body.priority
    ? String(req.body.priority).toUpperCase()
    : TaskPriority.MEDIUM;
  const goalId = req.body.goalId ? Number(req.body.goalId) : null;

  if (!title) {
    return res.status(400).json({ message: "title is required." });
  }
  if (!taskDate) {
    return res.status(400).json({ message: "taskDate must be a valid date." });
  }
  if (!PRIORITY_SET.has(priority)) {
    return res.status(400).json({ message: "priority must be LOW, MEDIUM, or HIGH." });
  }
  if (goalId) {
    const goal = await prisma.goal.findFirst({
      where: { id: goalId, branchId },
      select: { id: true },
    });
    if (!goal) {
      return res.status(404).json({ message: "Selected goal not found." });
    }
  }

  const task = await prisma.dailyTask.create({
    data: {
      branchId,
      goalId,
      title,
      description: String(req.body.description || "").trim() || null,
      taskDate: taskDate.toDate(),
      priority,
      createdById: req.user.id,
    },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
          periodType: true,
          periodLabel: true,
          status: true,
        },
      },
      createdBy: {
        select: { id: true, fullName: true, username: true },
      },
    },
  });
  await logAudit({
    userId: req.user.id,
    action: AuditAction.CREATE,
    entityType: "daily_task",
    entityId: task.id,
    payload: task,
  });

  return res.status(201).json(task);
});

router.patch("/daily-tasks/:id", async (req, res) => {
  const taskId = Number(req.params.id);
  if (!Number.isFinite(taskId) || taskId <= 0) {
    return res.status(400).json({ message: "Invalid task id." });
  }
  const branchId = bodyBranchId(req, req.body.branchId);
  if (!validBranchId(branchId)) {
    return res.status(400).json({ message: "Valid branchId is required." });
  }

  const existing = await prisma.dailyTask.findFirst({
    where: { id: taskId, branchId },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
          periodType: true,
          periodLabel: true,
          status: true,
        },
      },
      createdBy: {
        select: { id: true, fullName: true, username: true },
      },
    },
  });
  if (!existing) {
    return res.status(404).json({ message: "Task not found." });
  }

  const data = {};
  if ("title" in req.body) {
    const title = String(req.body.title || "").trim();
    if (!title) {
      return res.status(400).json({ message: "title cannot be empty." });
    }
    data.title = title;
  }
  if ("description" in req.body) {
    data.description = String(req.body.description || "").trim() || null;
  }
  if ("taskDate" in req.body) {
    const taskDate = parseDate(req.body.taskDate);
    if (!taskDate) {
      return res.status(400).json({ message: "Invalid taskDate." });
    }
    data.taskDate = taskDate.toDate();
  }
  if ("priority" in req.body) {
    const priority = String(req.body.priority || "").toUpperCase();
    if (!PRIORITY_SET.has(priority)) {
      return res.status(400).json({ message: "Invalid priority." });
    }
    data.priority = priority;
  }
  if ("goalId" in req.body) {
    const goalId = req.body.goalId ? Number(req.body.goalId) : null;
    if (goalId) {
      const goal = await prisma.goal.findFirst({
        where: { id: goalId, branchId },
        select: { id: true },
      });
      if (!goal) {
        return res.status(404).json({ message: "Selected goal not found." });
      }
    }
    data.goalId = goalId;
  }
  if ("isDone" in req.body) {
    const isDone = Boolean(req.body.isDone);
    data.isDone = isDone;
    data.doneAt = isDone ? new Date() : null;
  }
  if (Object.keys(data).length === 0) {
    return res.json(existing);
  }

  const task = await prisma.dailyTask.update({
    where: { id: taskId },
    data,
    include: {
      goal: {
        select: {
          id: true,
          title: true,
          periodType: true,
          periodLabel: true,
          status: true,
        },
      },
      createdBy: {
        select: { id: true, fullName: true, username: true },
      },
    },
  });
  await logAudit({
    userId: req.user.id,
    action: AuditAction.UPDATE,
    entityType: "daily_task",
    entityId: task.id,
    payload: data,
  });

  return res.json(task);
});

export default router;

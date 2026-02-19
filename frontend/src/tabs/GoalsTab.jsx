import { useCallback, useEffect, useMemo, useState } from "react";
import { InlineError, Panel } from "../components/Panel";

const PERIOD_OPTIONS = [
  { value: "YEAR", label: "Yearly" },
  { value: "MONTH", label: "Monthly" },
  { value: "WEEK", label: "Weekly" },
];

const PRIORITY_OPTIONS = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function isoWeekValue(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const isoWeekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoWeekday);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function toDateDisplay(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleDateString();
}

function isoWeekStart(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoWeekday = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4IsoWeekday + 1 + (week - 1) * 7);
  return new Date(jan4.getUTCFullYear(), jan4.getUTCMonth(), jan4.getUTCDate());
}

function buildPeriodRange(periodType, periodLabel) {
  if (periodType === "YEAR") {
    if (!/^\d{4}$/.test(periodLabel)) {
      return null;
    }
    const year = Number(periodLabel);
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };
  }

  if (periodType === "MONTH") {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodLabel);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return {
      startDate: localDateValue(start),
      endDate: localDateValue(end),
    };
  }

  if (periodType === "WEEK") {
    const match = /^(\d{4})-W(0[1-9]|[1-4][0-9]|5[0-3])$/.exec(periodLabel);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const week = Number(match[2]);
    const start = isoWeekStart(year, week);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      startDate: localDateValue(start),
      endDate: localDateValue(end),
    };
  }

  return null;
}

function goalProgress(goal) {
  const target = Number(goal.targetValue || 0);
  const current = Number(goal.currentValue || 0);
  if (target <= 0) {
    return "-";
  }
  const percent = Math.max(0, Math.min(100, (current / target) * 100));
  return `${percent.toFixed(1)}%`;
}

export default function GoalsTab({
  data,
  branches,
  goals,
  dailyTasks,
  onLoadGoals,
  onCreateGoal,
  onUpdateGoal,
  onLoadDailyTasks,
  onCreateDailyTask,
  onUpdateDailyTask,
}) {
  const activeBranchId = useMemo(
    () => Number(data.user?.role === "ADMIN" ? data.selectedBranchId : data.user?.branchId),
    [data.selectedBranchId, data.user],
  );
  const hasActiveBranch = Number.isFinite(activeBranchId) && activeBranchId > 0;
  const branchName = branches.find((branch) => Number(branch.id) === activeBranchId)?.name || "";

  const [periodFilter, setPeriodFilter] = useState("ALL");
  const [selectedDate, setSelectedDate] = useState(localDateValue(new Date()));
  const [goalForm, setGoalForm] = useState({
    title: "",
    description: "",
    periodType: "YEAR",
    periodLabel: String(new Date().getFullYear()),
    targetValue: "",
    currentValue: "0",
  });
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    goalId: "",
    priority: "MEDIUM",
  });
  const [goalDraftValues, setGoalDraftValues] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setGoalDraftValues(
      Object.fromEntries(goals.map((goal) => [goal.id, String(goal.currentValue ?? 0)])),
    );
  }, [goals]);

  useEffect(() => {
    setGoalForm((prev) => {
      if (prev.periodType === "YEAR" && /^\d{4}$/.test(prev.periodLabel)) {
        return prev;
      }
      if (prev.periodType === "MONTH" && /^\d{4}-(0[1-9]|1[0-2])$/.test(prev.periodLabel)) {
        return prev;
      }
      if (prev.periodType === "WEEK" && /^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$/.test(prev.periodLabel)) {
        return prev;
      }
      if (prev.periodType === "YEAR") {
        return { ...prev, periodLabel: String(new Date().getFullYear()) };
      }
      if (prev.periodType === "MONTH") {
        return { ...prev, periodLabel: currentMonthValue() };
      }
      return { ...prev, periodLabel: isoWeekValue(new Date()) };
    });
  }, [goalForm.periodType]);

  const loadGoals = useCallback(async () => {
    if (!hasActiveBranch) {
      return;
    }
    setError("");
    try {
      setBusy("goals");
      await onLoadGoals(periodFilter === "ALL" ? {} : { periodType: periodFilter });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }, [hasActiveBranch, onLoadGoals, periodFilter]);

  const loadTasks = useCallback(async () => {
    if (!hasActiveBranch) {
      return;
    }
    setError("");
    try {
      setBusy("tasks");
      await onLoadDailyTasks({ date: selectedDate });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }, [hasActiveBranch, onLoadDailyTasks, selectedDate]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const summary = useMemo(() => {
    const result = {
      total: goals.length,
      active: goals.filter((goal) => goal.status === "ACTIVE").length,
      completed: goals.filter((goal) => goal.status === "COMPLETED").length,
      yearly: goals.filter((goal) => goal.periodType === "YEAR").length,
      monthly: goals.filter((goal) => goal.periodType === "MONTH").length,
      weekly: goals.filter((goal) => goal.periodType === "WEEK").length,
    };
    return result;
  }, [goals]);

  const submitGoal = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!hasActiveBranch) {
      setError("Select a branch first.");
      return;
    }

    const title = goalForm.title.trim();
    if (!title) {
      setError("Goal title is required.");
      return;
    }

    const range = buildPeriodRange(goalForm.periodType, goalForm.periodLabel.trim());
    if (!range) {
      setError("Period value is invalid.");
      return;
    }

    const currentValue = Number(goalForm.currentValue || 0);
    const targetValue =
      goalForm.targetValue === "" ? null : Number(goalForm.targetValue);
    if (Number.isNaN(currentValue) || currentValue < 0) {
      setError("Current value must be zero or positive.");
      return;
    }
    if (targetValue !== null && (Number.isNaN(targetValue) || targetValue < 0)) {
      setError("Target value must be zero or positive.");
      return;
    }

    try {
      setBusy("create-goal");
      await onCreateGoal({
        branchId: activeBranchId,
        title,
        description: goalForm.description.trim(),
        periodType: goalForm.periodType,
        periodLabel: goalForm.periodLabel.trim(),
        startDate: range.startDate,
        endDate: range.endDate,
        targetValue,
        currentValue,
      });
      setGoalForm((prev) => ({
        ...prev,
        title: "",
        description: "",
        targetValue: "",
        currentValue: "0",
      }));
      setSuccess("Goal saved.");
      await loadGoals();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const saveGoalProgress = async (goal) => {
    setError("");
    setSuccess("");
    const value = Number(goalDraftValues[goal.id] ?? goal.currentValue ?? 0);
    if (Number.isNaN(value) || value < 0) {
      setError("Progress value must be zero or positive.");
      return;
    }
    try {
      setBusy(`goal-${goal.id}`);
      await onUpdateGoal({
        id: goal.id,
        branchId: activeBranchId,
        currentValue: value,
      });
      setSuccess("Goal progress updated.");
      await loadGoals();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const toggleGoalStatus = async (goal) => {
    setError("");
    setSuccess("");
    try {
      setBusy(`goal-status-${goal.id}`);
      await onUpdateGoal({
        id: goal.id,
        branchId: activeBranchId,
        status: goal.status === "COMPLETED" ? "ACTIVE" : "COMPLETED",
      });
      setSuccess("Goal status updated.");
      await loadGoals();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const submitTask = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!hasActiveBranch) {
      setError("Select a branch first.");
      return;
    }
    const title = taskForm.title.trim();
    if (!title) {
      setError("Task title is required.");
      return;
    }
    try {
      setBusy("create-task");
      await onCreateDailyTask({
        branchId: activeBranchId,
        title,
        description: taskForm.description.trim(),
        taskDate: selectedDate,
        priority: taskForm.priority,
        goalId: taskForm.goalId ? Number(taskForm.goalId) : null,
      });
      setTaskForm((prev) => ({
        ...prev,
        title: "",
        description: "",
        goalId: "",
      }));
      setSuccess("Daily task added.");
      await Promise.all([loadTasks(), loadGoals()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const toggleTaskDone = async (task) => {
    setError("");
    setSuccess("");
    try {
      setBusy(`task-${task.id}`);
      await onUpdateDailyTask({
        id: task.id,
        branchId: activeBranchId,
        isDone: !task.isDone,
        taskDate: selectedDate,
      });
      setSuccess("Task status updated.");
      await Promise.all([loadTasks(), loadGoals()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const goalOptions = goals.filter((goal) => goal.status !== "COMPLETED");

  return (
    <div className="tab-grid">
      <Panel
        title="Goal Snapshot"
        subtitle={`Branch: ${branchName}`}
        actions={
          <button onClick={loadGoals} disabled={busy === "goals" || !hasActiveBranch}>
            {busy === "goals" ? "Loading..." : "Refresh Goals"}
          </button>
        }
      >
        <div className="kpi-row">
          <div>
            <span>Total Goals</span>
            <strong>{summary.total}</strong>
          </div>
          <div>
            <span>Active</span>
            <strong>{summary.active}</strong>
          </div>
          <div>
            <span>Completed</span>
            <strong>{summary.completed}</strong>
          </div>
          <div>
            <span>Year/Month/Week</span>
            <strong>
              {summary.yearly}/{summary.monthly}/{summary.weekly}
            </strong>
          </div>
        </div>
      </Panel>

      <Panel title="Set Goal" subtitle="Create yearly, monthly, and weekly goals">
        <form className="grid-form multi" onSubmit={submitGoal}>
          <label>
            Goal Title
            <input
              value={goalForm.title}
              onChange={(event) =>
                setGoalForm((prev) => ({ ...prev, title: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Period
            <select
              value={goalForm.periodType}
              onChange={(event) =>
                setGoalForm((prev) => ({ ...prev, periodType: event.target.value }))
              }
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Period Value
            {goalForm.periodType === "YEAR" ? (
              <input
                value={goalForm.periodLabel}
                placeholder="2026"
                onChange={(event) =>
                  setGoalForm((prev) => ({ ...prev, periodLabel: event.target.value }))
                }
                required
              />
            ) : null}
            {goalForm.periodType === "MONTH" ? (
              <input
                type="month"
                value={goalForm.periodLabel}
                onChange={(event) =>
                  setGoalForm((prev) => ({ ...prev, periodLabel: event.target.value }))
                }
                required
              />
            ) : null}
            {goalForm.periodType === "WEEK" ? (
              <input
                type="week"
                value={goalForm.periodLabel}
                onChange={(event) =>
                  setGoalForm((prev) => ({ ...prev, periodLabel: event.target.value }))
                }
                required
              />
            ) : null}
          </label>
          <label>
            Target Value
            <input
              type="number"
              min="0"
              step="0.01"
              value={goalForm.targetValue}
              onChange={(event) =>
                setGoalForm((prev) => ({ ...prev, targetValue: event.target.value }))
              }
              placeholder="Optional"
            />
          </label>
          <label>
            Current Value
            <input
              type="number"
              min="0"
              step="0.01"
              value={goalForm.currentValue}
              onChange={(event) =>
                setGoalForm((prev) => ({ ...prev, currentValue: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Notes
            <input
              value={goalForm.description}
              onChange={(event) =>
                setGoalForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Optional details"
            />
          </label>
          <button type="submit" disabled={busy === "create-goal" || !hasActiveBranch}>
            {busy === "create-goal" ? "Saving..." : "Save Goal"}
          </button>
        </form>
      </Panel>

      <Panel
        title="Goal Tracker"
        subtitle="Update progress and completion status"
        actions={
          <select
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value)}
            disabled={!hasActiveBranch}
          >
            <option value="ALL">All Periods</option>
            <option value="YEAR">Yearly</option>
            <option value="MONTH">Monthly</option>
            <option value="WEEK">Weekly</option>
          </select>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Goal</th>
                <th>Period</th>
                <th>Range</th>
                <th>Current</th>
                <th>Target</th>
                <th>Progress</th>
                <th>Tasks</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {goals.length === 0 ? (
                <tr>
                  <td colSpan={9}>No goals found for the selected filter.</td>
                </tr>
              ) : (
                goals.map((goal) => (
                  <tr key={goal.id}>
                    <td>
                      <strong>{goal.title}</strong>
                      {goal.description ? <small>{goal.description}</small> : null}
                    </td>
                    <td>
                      {goal.periodType} ({goal.periodLabel})
                    </td>
                    <td>
                      {toDateDisplay(goal.startDate)} - {toDateDisplay(goal.endDate)}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={goalDraftValues[goal.id] ?? ""}
                        onChange={(event) =>
                          setGoalDraftValues((prev) => ({
                            ...prev,
                            [goal.id]: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>{goal.targetValue ?? "-"}</td>
                    <td>{goalProgress(goal)}</td>
                    <td>
                      {goal.completedTasks || 0}/{goal.totalTasks || 0}
                    </td>
                    <td>{goal.status}</td>
                    <td className="inline-actions">
                      <button
                        type="button"
                        onClick={() => saveGoalProgress(goal)}
                        disabled={busy === `goal-${goal.id}` || !hasActiveBranch}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGoalStatus(goal)}
                        disabled={busy === `goal-status-${goal.id}` || !hasActiveBranch}
                      >
                        {goal.status === "COMPLETED" ? "Reopen" : "Complete"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Daily To-do Planner"
        subtitle="Assign daily tasks and mark completion"
        actions={
          <div className="inline-actions">
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              disabled={!hasActiveBranch}
            />
            <button onClick={loadTasks} disabled={busy === "tasks" || !hasActiveBranch}>
              {busy === "tasks" ? "Loading..." : "Refresh Tasks"}
            </button>
          </div>
        }
      >
        <form className="grid-form multi" onSubmit={submitTask}>
          <label>
            Task
            <input
              value={taskForm.title}
              onChange={(event) =>
                setTaskForm((prev) => ({ ...prev, title: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Linked Goal
            <select
              value={taskForm.goalId}
              onChange={(event) =>
                setTaskForm((prev) => ({ ...prev, goalId: event.target.value }))
              }
            >
              <option value="">General Task</option>
              {goalOptions.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title} ({goal.periodLabel})
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={taskForm.priority}
              onChange={(event) =>
                setTaskForm((prev) => ({ ...prev, priority: event.target.value }))
              }
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notes
            <input
              value={taskForm.description}
              onChange={(event) =>
                setTaskForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Optional notes"
            />
          </label>
          <button type="submit" disabled={busy === "create-task" || !hasActiveBranch}>
            {busy === "create-task" ? "Saving..." : "Add Task"}
          </button>
        </form>

        <div className="table-wrap compact">
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Goal</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Done At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {dailyTasks.length === 0 ? (
                <tr>
                  <td colSpan={6}>No tasks for {selectedDate}.</td>
                </tr>
              ) : (
                dailyTasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                      {task.description ? <small>{task.description}</small> : null}
                    </td>
                    <td>{task.goal?.title || "General"}</td>
                    <td>{task.priority}</td>
                    <td>{task.isDone ? "Done" : "Pending"}</td>
                    <td>{toDateDisplay(task.doneAt)}</td>
                    <td className="inline-actions">
                      <button
                        type="button"
                        onClick={() => toggleTaskDone(task)}
                        disabled={busy === `task-${task.id}` || !hasActiveBranch}
                      >
                        {task.isDone ? "Mark Pending" : "Mark Done"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {success ? <p className="success-note">{success}</p> : null}
      <InlineError message={error} />
    </div>
  );
}

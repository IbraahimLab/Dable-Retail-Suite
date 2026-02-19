import { useEffect, useMemo, useState } from "react";
import { InlineError, Panel } from "../components/Panel";

function money(value) {
  return Number(value || 0).toFixed(2);
}

export default function AccountsTab({
  data,
  branches,
  accounts,
  onLoadAccounts,
  onSaveAccounts,
  onAdjustAccount,
}) {
  const activeBranchId = useMemo(
    () => Number(data.user?.role === "ADMIN" ? data.selectedBranchId : data.user?.branchId),
    [data.selectedBranchId, data.user],
  );
  const hasActiveBranch = Number.isFinite(activeBranchId) && Number(activeBranchId) > 0;
  const [setForm, setSetForm] = useState({
    CASH: "0",
    BANK: "0",
    CARD: "0",
  });
  const [adjustForm, setAdjustForm] = useState({
    accountType: "CASH",
    direction: "IN",
    amount: "",
    reason: "",
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setSetForm({
      CASH: String(accounts?.balances?.CASH ?? 0),
      BANK: String(accounts?.balances?.BANK ?? 0),
      CARD: String(accounts?.balances?.CARD ?? 0),
    });
  }, [accounts]);

  const branchName = branches.find((branch) => Number(branch.id) === activeBranchId)?.name || "";

  const reload = async () => {
    setError("");
    setSuccess("");
    try {
      setBusy("reload");
      await onLoadAccounts();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const submitSetBalances = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!hasActiveBranch) {
      setError("Select a branch first.");
      return;
    }
    const payload = {
      CASH: Number(setForm.CASH || 0),
      BANK: Number(setForm.BANK || 0),
      CARD: Number(setForm.CARD || 0),
    };
    if (payload.CASH < 0 || payload.BANK < 0 || payload.CARD < 0) {
      setError("Balances cannot be negative.");
      return;
    }
    try {
      setBusy("set");
      await onSaveAccounts({
        branchId: activeBranchId,
        balances: payload,
      });
      setSuccess("Account balances saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const submitAdjustment = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!hasActiveBranch) {
      setError("Select a branch first.");
      return;
    }
    const amount = Number(adjustForm.amount || 0);
    if (amount <= 0) {
      setError("Adjustment amount must be greater than zero.");
      return;
    }
    try {
      setBusy("adjust");
      await onAdjustAccount({
        branchId: activeBranchId,
        accountType: adjustForm.accountType,
        direction: adjustForm.direction,
        amount,
        reason: adjustForm.reason,
      });
      setAdjustForm((prev) => ({ ...prev, amount: "", reason: "" }));
      setSuccess("Account adjustment saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="tab-grid">
      <Panel
        title="Current Balances"
        subtitle={`Branch: ${branchName}`}
        actions={<button onClick={reload}>{busy === "reload" ? "Loading..." : "Refresh"}</button>}
      >
        <div className="kpi-row">
          <div>
            <span>Cash</span>
            <strong>${money(accounts?.balances?.CASH)}</strong>
          </div>
          <div>
            <span>Bank</span>
            <strong>${money(accounts?.balances?.BANK)}</strong>
          </div>
          <div>
            <span>Card</span>
            <strong>${money(accounts?.balances?.CARD)}</strong>
          </div>
          <div>
            <span>Total Funds</span>
            <strong>${money(accounts?.total)}</strong>
          </div>
        </div>
      </Panel>

      <Panel
        title="Manual Setup"
        subtitle="Set exact balances. Purchases/expenses are blocked if selected account is not enough."
      >
        <form className="grid-form multi" onSubmit={submitSetBalances}>
          <label>
            Cash
            <input
              type="number"
              min="0"
              step="0.01"
              value={setForm.CASH}
              onChange={(event) => setSetForm((prev) => ({ ...prev, CASH: event.target.value }))}
              required
            />
          </label>
          <label>
            Bank
            <input
              type="number"
              min="0"
              step="0.01"
              value={setForm.BANK}
              onChange={(event) => setSetForm((prev) => ({ ...prev, BANK: event.target.value }))}
              required
            />
          </label>
          <label>
            Card
            <input
              type="number"
              min="0"
              step="0.01"
              value={setForm.CARD}
              onChange={(event) => setSetForm((prev) => ({ ...prev, CARD: event.target.value }))}
              required
            />
          </label>
          <button type="submit" disabled={busy === "set" || !hasActiveBranch}>
            {busy === "set" ? "Saving..." : "Save Balances"}
          </button>
        </form>
      </Panel>

      <Panel title="Adjust Balance" subtitle="Use IN for deposit, OUT for withdrawal">
        <form className="grid-form multi" onSubmit={submitAdjustment}>
          <label>
            Account
            <select
              value={adjustForm.accountType}
              onChange={(event) =>
                setAdjustForm((prev) => ({ ...prev, accountType: event.target.value }))
              }
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="CARD">Card</option>
            </select>
          </label>
          <label>
            Direction
            <select
              value={adjustForm.direction}
              onChange={(event) =>
                setAdjustForm((prev) => ({ ...prev, direction: event.target.value }))
              }
            >
              <option value="IN">IN (Deposit)</option>
              <option value="OUT">OUT (Withdraw)</option>
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={adjustForm.amount}
              onChange={(event) => setAdjustForm((prev) => ({ ...prev, amount: event.target.value }))}
              required
            />
          </label>
          <label>
            Reason
            <input
              value={adjustForm.reason}
              onChange={(event) => setAdjustForm((prev) => ({ ...prev, reason: event.target.value }))}
            />
          </label>
          <button type="submit" disabled={busy === "adjust" || !hasActiveBranch}>
            {busy === "adjust" ? "Saving..." : "Apply Adjustment"}
          </button>
        </form>
      </Panel>

      {success ? <p className="success-note">{success}</p> : null}
      <InlineError message={error} />
    </div>
  );
}

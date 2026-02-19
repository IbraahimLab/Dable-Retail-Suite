import { useMemo, useState } from "react";
import { Panel, InlineError } from "../components/Panel";

export default function ExpensesTab({
  data,
  branches,
  expenseCategories,
  expenses,
  accounts,
  onCreateExpense,
  onReloadExpenses,
}) {
  const activeBranchId = useMemo(
    () => Number(data.user?.role === "ADMIN" ? data.selectedBranchId : data.user?.branchId),
    [data.selectedBranchId, data.user],
  );
  const [form, setForm] = useState({
    categoryId: "",
    amount: 0,
    expenseDate: "",
    paymentMethod: "CASH",
    description: "",
    receipt: null,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const accountBalances = accounts?.balances || {};
  const availableForMethod = Number(accountBalances[form.paymentMethod] || 0);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!activeBranchId) {
      setError("Select a branch before creating expense.");
      return;
    }
    const amount = Number(form.amount || 0);
    if (amount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (["CASH", "BANK", "CARD"].includes(form.paymentMethod) && amount > availableForMethod) {
      setError(`${form.paymentMethod} balance is not enough. Available $${availableForMethod.toFixed(2)}.`);
      return;
    }
    try {
      await onCreateExpense({
        ...form,
        branchId: activeBranchId,
      });
      setForm({
        categoryId: "",
        amount: 0,
        expenseDate: "",
        paymentMethod: "CASH",
        description: "",
        receipt: null,
      });
      setSuccess("Expense saved.");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="tab-grid">
      <Panel title="Expense Entry" subtitle={`Branch: ${branches.find((b) => b.id === activeBranchId)?.name || ""}`}>
        <form className="grid-form multi" onSubmit={submit}>
          <label>
            Category
            <select
              value={form.categoryId}
              onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </label>
          <label>
            Date
            <input
              type="date"
              value={form.expenseDate}
              onChange={(e) => setForm((p) => ({ ...p, expenseDate: e.target.value }))}
            />
          </label>
          <label>
            Method
            <select
              value={form.paymentMethod}
              onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value }))}
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>
            Available
            <input
              value={
                ["CASH", "BANK", "CARD"].includes(form.paymentMethod)
                  ? `$${availableForMethod.toFixed(2)}`
                  : "N/A"
              }
              readOnly
            />
          </label>
          <label>
            Description
            <input
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </label>
          <label>
            Receipt
            <input
              type="file"
              onChange={(e) => setForm((p) => ({ ...p, receipt: e.target.files?.[0] || null }))}
            />
          </label>
          <button type="submit">Save Expense</button>
        </form>
        {success ? <p className="success-note">{success}</p> : null}
        <InlineError message={error} />
      </Panel>

      <Panel title={`Expenses (${expenses.length})`} actions={<button onClick={onReloadExpenses}>Refresh</button>}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Description</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.expenseDate).toLocaleDateString()}</td>
                  <td>{e.category?.name || "-"}</td>
                  <td>${Number(e.amount || 0).toFixed(2)}</td>
                  <td>{e.paymentMethod}</td>
                  <td>{e.description || "-"}</td>
                  <td>
                    {e.receiptPath ? (
                      <a href={`http://localhost:4000${e.receiptPath}`} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

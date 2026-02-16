import { useState } from "react";
import { Panel, InlineError } from "../components/Panel";

export default function TransfersTab({ branches, products, transfers, onCreateTransfer, onReloadTransfers }) {
  const [form, setForm] = useState({
    sourceBranchId: "",
    targetBranchId: "",
    productId: "",
    quantity: 1,
    note: "",
  });
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onCreateTransfer({
        sourceBranchId: Number(form.sourceBranchId),
        targetBranchId: Number(form.targetBranchId),
        note: form.note,
        items: [{ productId: Number(form.productId), quantity: Number(form.quantity) }],
      });
      setForm({
        sourceBranchId: "",
        targetBranchId: "",
        productId: "",
        quantity: 1,
        note: "",
      });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="tab-grid">
      <Panel title="Branch Transfer" subtitle="Move stock between branches">
        <form className="grid-form multi" onSubmit={submit}>
          <label>
            Source Branch
            <select
              value={form.sourceBranchId}
              onChange={(e) => setForm((p) => ({ ...p, sourceBranchId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target Branch
            <select
              value={form.targetBranchId}
              onChange={(e) => setForm((p) => ({ ...p, targetBranchId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Product
            <select
              value={form.productId}
              onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input
              type="number"
              step="0.01"
              value={form.quantity}
              onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              required
            />
          </label>
          <label>
            Note
            <input
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <button type="submit">Create Transfer</button>
        </form>
        <InlineError message={error} />
      </Panel>

      <Panel title={`Transfers (${transfers.length})`} actions={<button onClick={onReloadTransfers}>Refresh</button>}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th>Source</th>
                <th>Target</th>
                <th>Status</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td>{t.number}</td>
                  <td>{new Date(t.transferDate).toLocaleDateString()}</td>
                  <td>{t.sourceBranch?.name || "-"}</td>
                  <td>{t.targetBranch?.name || "-"}</td>
                  <td>{t.status}</td>
                  <td>
                    {(t.items || [])
                      .map((item) => `${item.product?.name || "Product"} x ${Number(item.quantity).toFixed(2)}`)
                      .join(", ")}
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

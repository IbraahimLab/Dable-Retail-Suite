import { useMemo, useState } from "react";
import { Panel, InlineError } from "../components/Panel";

function blankItem() {
  return { productId: "", quantity: 1, unitCost: 0, discount: 0, batchNumber: "" };
}

export default function PurchasesTab({
  data,
  branches,
  suppliers,
  products,
  purchases,
  onCreateSupplier,
  onCreatePurchase,
  onAddPurchasePayment,
  onReloadPurchases,
}) {
  const activeBranchId = useMemo(
    () => Number(data.user?.role === "ADMIN" ? data.selectedBranchId : data.user?.branchId),
    [data.selectedBranchId, data.user],
  );
  const [supplierForm, setSupplierForm] = useState({ name: "", phone: "", contactPerson: "" });
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: "",
    discount: 0,
    tax: 0,
    paidAmount: 0,
    paymentMethod: "CASH",
    note: "",
    items: [blankItem()],
  });
  const [paymentForm, setPaymentForm] = useState({
    invoiceId: "",
    amount: 0,
    paymentMethod: "CASH",
  });
  const [error, setError] = useState("");

  const addItem = () => {
    setPurchaseForm((prev) => ({ ...prev, items: [...prev.items, blankItem()] }));
  };

  const changeItem = (index, key, value) => {
    setPurchaseForm((prev) => {
      const next = [...prev.items];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, items: next };
    });
  };

  const removeItem = (index) => {
    setPurchaseForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const submitSupplier = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onCreateSupplier({ ...supplierForm, branchId: activeBranchId });
      setSupplierForm({ name: "", phone: "", contactPerson: "" });
    } catch (err) {
      setError(err.message);
    }
  };

  const submitPurchase = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onCreatePurchase({
        ...purchaseForm,
        branchId: activeBranchId,
        supplierId: Number(purchaseForm.supplierId),
        discount: Number(purchaseForm.discount),
        tax: Number(purchaseForm.tax),
        paidAmount: Number(purchaseForm.paidAmount),
        items: purchaseForm.items.map((item) => ({
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
          discount: Number(item.discount),
          batchNumber: item.batchNumber,
        })),
      });
      setPurchaseForm({
        supplierId: "",
        discount: 0,
        tax: 0,
        paidAmount: 0,
        paymentMethod: "CASH",
        note: "",
        items: [blankItem()],
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onAddPurchasePayment(paymentForm);
      setPaymentForm({ invoiceId: "", amount: 0, paymentMethod: "CASH" });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="tab-grid">
      <Panel title="Supplier" subtitle={`Branch: ${branches.find((b) => b.id === activeBranchId)?.name || ""}`}>
        <form className="grid-form multi" onSubmit={submitSupplier}>
          <label>
            Name
            <input
              value={supplierForm.name}
              onChange={(e) => setSupplierForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </label>
          <label>
            Phone
            <input
              value={supplierForm.phone}
              onChange={(e) => setSupplierForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </label>
          <label>
            Contact Person
            <input
              value={supplierForm.contactPerson}
              onChange={(e) => setSupplierForm((p) => ({ ...p, contactPerson: e.target.value }))}
            />
          </label>
          <button type="submit">Add Supplier</button>
        </form>
      </Panel>

      <Panel title="Purchase Invoice" subtitle="Incoming stock + supplier payable">
        <form className="grid-form multi" onSubmit={submitPurchase}>
          <label>
            Supplier
            <select
              value={purchaseForm.supplierId}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, supplierId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Discount
            <input
              type="number"
              step="0.01"
              value={purchaseForm.discount}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, discount: e.target.value }))}
            />
          </label>
          <label>
            Tax
            <input
              type="number"
              step="0.01"
              value={purchaseForm.tax}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, tax: e.target.value }))}
            />
          </label>
          <label>
            Paid Amount
            <input
              type="number"
              step="0.01"
              value={purchaseForm.paidAmount}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, paidAmount: e.target.value }))}
            />
          </label>
          <label>
            Payment Method
            <select
              value={purchaseForm.paymentMethod}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, paymentMethod: e.target.value }))}
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="CARD">Card</option>
            </select>
          </label>
          <label>
            Note
            <input
              value={purchaseForm.note}
              onChange={(e) => setPurchaseForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>

          <div className="row-title">Items</div>
          {purchaseForm.items.map((item, index) => (
            <div key={`${index}-${item.productId}`} className="item-line">
              <select
                value={item.productId}
                onChange={(e) => changeItem(index, "productId", e.target.value)}
                required
              >
                <option value="">Product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={item.quantity}
                onChange={(e) => changeItem(index, "quantity", e.target.value)}
                placeholder="Qty"
                required
              />
              <input
                type="number"
                step="0.01"
                value={item.unitCost}
                onChange={(e) => changeItem(index, "unitCost", e.target.value)}
                placeholder="Unit Cost"
                required
              />
              <input
                type="number"
                step="0.01"
                value={item.discount}
                onChange={(e) => changeItem(index, "discount", e.target.value)}
                placeholder="Discount"
              />
              <input
                value={item.batchNumber}
                onChange={(e) => changeItem(index, "batchNumber", e.target.value)}
                placeholder="Batch"
              />
              <button type="button" onClick={() => removeItem(index)}>
                Remove
              </button>
            </div>
          ))}
          <div className="inline-actions">
            <button type="button" onClick={addItem}>
              + Add Item
            </button>
            <button type="submit">Create Purchase</button>
          </div>
        </form>
        <InlineError message={error} />
      </Panel>

      <Panel title="Supplier Payment" subtitle="Reduce purchase due">
        <form className="grid-form multi" onSubmit={submitPayment}>
          <label>
            Purchase Invoice
            <select
              value={paymentForm.invoiceId}
              onChange={(e) => setPaymentForm((p) => ({ ...p, invoiceId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {purchases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} - Due ${Number(p.dueAmount || 0).toFixed(2)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              step="0.01"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
              required
            />
          </label>
          <label>
            Method
            <select
              value={paymentForm.paymentMethod}
              onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMethod: e.target.value }))}
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="CARD">Card</option>
            </select>
          </label>
          <button type="submit">Add Payment</button>
        </form>
      </Panel>

      <Panel
        title={`Purchase Invoices (${purchases.length})`}
        actions={<button onClick={onReloadPurchases}>Refresh</button>}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{p.number}</td>
                  <td>{p.supplier?.name || "-"}</td>
                  <td>{new Date(p.invoiceDate).toLocaleDateString()}</td>
                  <td>${Number(p.total || 0).toFixed(2)}</td>
                  <td>${Number(p.paidAmount || 0).toFixed(2)}</td>
                  <td>${Number(p.dueAmount || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

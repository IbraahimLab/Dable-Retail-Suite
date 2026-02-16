import { useMemo, useState } from "react";
import { Panel, InlineError } from "../components/Panel";

function blankItem() {
  return { productId: "", quantity: 1, unitPrice: 0, discount: 0 };
}

export default function SalesTab({
  data,
  branches,
  customers,
  products,
  sales,
  onCreateCustomer,
  onCreateSale,
  onAddSalePayment,
  onCreateReturn,
  onReloadSales,
}) {
  const activeBranchId = useMemo(
    () => Number(data.user?.role === "ADMIN" ? data.selectedBranchId : data.user?.branchId),
    [data.selectedBranchId, data.user],
  );
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", address: "" });
  const [saleForm, setSaleForm] = useState({
    customerId: "",
    discount: 0,
    tax: 0,
    paidAmount: 0,
    paymentMethod: "CASH",
    note: "",
    items: [blankItem()],
  });
  const [paymentForm, setPaymentForm] = useState({ invoiceId: "", amount: 0, paymentMethod: "CASH" });
  const [returnForm, setReturnForm] = useState({
    invoiceId: "",
    productId: "",
    quantity: 1,
    refundAmount: 0,
    reason: "",
  });
  const [error, setError] = useState("");

  const addItem = () => setSaleForm((p) => ({ ...p, items: [...p.items, blankItem()] }));
  const changeItem = (index, key, value) =>
    setSaleForm((p) => {
      const items = [...p.items];
      items[index] = { ...items[index], [key]: value };
      return { ...p, items };
    });
  const removeItem = (index) =>
    setSaleForm((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== index) }));

  const submitCustomer = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onCreateCustomer({ ...customerForm, branchId: activeBranchId });
      setCustomerForm({ name: "", phone: "", address: "" });
    } catch (err) {
      setError(err.message);
    }
  };

  const submitSale = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onCreateSale({
        ...saleForm,
        branchId: activeBranchId,
        customerId: saleForm.customerId ? Number(saleForm.customerId) : null,
        discount: Number(saleForm.discount),
        tax: Number(saleForm.tax),
        paidAmount: Number(saleForm.paidAmount),
        items: saleForm.items.map((item) => ({
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
        })),
      });
      setSaleForm({
        customerId: "",
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

  const submitSalePayment = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onAddSalePayment({
        ...paymentForm,
      });
      setPaymentForm({ invoiceId: "", amount: 0, paymentMethod: "CASH" });
    } catch (err) {
      setError(err.message);
    }
  };

  const submitReturn = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onCreateReturn({
        invoiceId: Number(returnForm.invoiceId),
        items: [
          {
            productId: Number(returnForm.productId),
            quantity: Number(returnForm.quantity),
          },
        ],
        refundAmount: Number(returnForm.refundAmount),
        reason: returnForm.reason,
      });
      setReturnForm({
        invoiceId: "",
        productId: "",
        quantity: 1,
        refundAmount: 0,
        reason: "",
      });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="tab-grid">
      <Panel title="Customer" subtitle={`Branch: ${branches.find((b) => b.id === activeBranchId)?.name || ""}`}>
        <form className="grid-form multi" onSubmit={submitCustomer}>
          <label>
            Name
            <input
              value={customerForm.name}
              onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </label>
          <label>
            Phone
            <input
              value={customerForm.phone}
              onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))}
            />
          </label>
          <label>
            Address
            <input
              value={customerForm.address}
              onChange={(e) => setCustomerForm((p) => ({ ...p, address: e.target.value }))}
            />
          </label>
          <button type="submit">Add Customer</button>
        </form>
      </Panel>

      <Panel title="Sales Invoice" subtitle="Invoice-based selling with discount and credit">
        <form className="grid-form multi" onSubmit={submitSale}>
          <label>
            Customer
            <select
              value={saleForm.customerId}
              onChange={(e) => setSaleForm((p) => ({ ...p, customerId: e.target.value }))}
            >
              <option value="">Walk-in</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Discount
            <input
              type="number"
              step="0.01"
              value={saleForm.discount}
              onChange={(e) => setSaleForm((p) => ({ ...p, discount: e.target.value }))}
            />
          </label>
          <label>
            Tax
            <input
              type="number"
              step="0.01"
              value={saleForm.tax}
              onChange={(e) => setSaleForm((p) => ({ ...p, tax: e.target.value }))}
            />
          </label>
          <label>
            Paid Amount
            <input
              type="number"
              step="0.01"
              value={saleForm.paidAmount}
              onChange={(e) => setSaleForm((p) => ({ ...p, paidAmount: e.target.value }))}
            />
          </label>

          <div className="row-title">Items</div>
          {saleForm.items.map((item, index) => (
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
                value={item.unitPrice}
                onChange={(e) => changeItem(index, "unitPrice", e.target.value)}
                placeholder="Unit Price"
                required
              />
              <input
                type="number"
                step="0.01"
                value={item.discount}
                onChange={(e) => changeItem(index, "discount", e.target.value)}
                placeholder="Discount"
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
            <button type="submit">Create Sale</button>
          </div>
        </form>
      </Panel>

      <Panel title="Sales Payment" subtitle="Collect from customer">
        <form className="grid-form multi" onSubmit={submitSalePayment}>
          <label>
            Invoice
            <select
              value={paymentForm.invoiceId}
              onChange={(e) => setPaymentForm((p) => ({ ...p, invoiceId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number} - Due ${Number(s.dueAmount || 0).toFixed(2)}
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

      <Panel title="Sales Return / Refund" subtitle="Handle return and stock re-entry">
        <form className="grid-form multi" onSubmit={submitReturn}>
          <label>
            Invoice
            <select
              value={returnForm.invoiceId}
              onChange={(e) => setReturnForm((p) => ({ ...p, invoiceId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {sales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number}
                </option>
              ))}
            </select>
          </label>
          <label>
            Product
            <select
              value={returnForm.productId}
              onChange={(e) => setReturnForm((p) => ({ ...p, productId: e.target.value }))}
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
            Qty
            <input
              type="number"
              step="0.01"
              value={returnForm.quantity}
              onChange={(e) => setReturnForm((p) => ({ ...p, quantity: e.target.value }))}
              required
            />
          </label>
          <label>
            Refund Amount
            <input
              type="number"
              step="0.01"
              value={returnForm.refundAmount}
              onChange={(e) => setReturnForm((p) => ({ ...p, refundAmount: e.target.value }))}
            />
          </label>
          <label>
            Reason
            <input
              value={returnForm.reason}
              onChange={(e) => setReturnForm((p) => ({ ...p, reason: e.target.value }))}
            />
          </label>
          <button type="submit">Process Return</button>
        </form>
        <InlineError message={error} />
      </Panel>

      <Panel
        title={`Sales Invoices (${sales.length})`}
        actions={<button onClick={onReloadSales}>Refresh</button>}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>{s.number}</td>
                  <td>{s.customer?.name || "Walk-in"}</td>
                  <td>{new Date(s.invoiceDate).toLocaleDateString()}</td>
                  <td>{s.status}</td>
                  <td>${Number(s.total || 0).toFixed(2)}</td>
                  <td>${Number(s.paidAmount || 0).toFixed(2)}</td>
                  <td>${Number(s.dueAmount || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Panel, InlineError } from "../components/Panel";

function blankItem() {
  return { productId: "", quantity: 1, unitCost: 0, discount: 0, batchNumber: "" };
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

export default function PurchasesTab({
  data,
  branches,
  suppliers,
  products,
  purchases,
  accounts,
  onCreateSupplier,
  onCreatePurchase,
  onAddPurchasePayment,
  onReloadPurchases,
}) {
  const activeBranchId = useMemo(
    () => Number(data.user?.role === "ADMIN" ? data.selectedBranchId : data.user?.branchId),
    [data.selectedBranchId, data.user],
  );
  const hasActiveBranch = Number.isFinite(activeBranchId) && Number(activeBranchId) > 0;
  const accountBalances = useMemo(
    () => accounts?.balances || { CASH: 0, BANK: 0, CARD: 0 },
    [accounts],
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
    amount: "",
    paymentMethod: "CASH",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const purchasePreview = useMemo(() => {
    const lines = purchaseForm.items.map((item) => {
      const quantity = Number(item.quantity || 0);
      const unitCost = Number(item.unitCost || 0);
      const discount = Number(item.discount || 0);
      const amount = quantity * unitCost;
      return {
        ...item,
        quantity,
        unitCost,
        discount,
        lineTotal: Math.max(amount - discount, 0),
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const discount = Number(purchaseForm.discount || 0);
    const tax = Number(purchaseForm.tax || 0);
    const total = Math.max(subtotal - discount + tax, 0);
    const paid = Math.min(Math.max(Number(purchaseForm.paidAmount || 0), 0), total);
    const due = Math.max(total - paid, 0);
    return { lines, subtotal, total, paid, due };
  }, [purchaseForm.discount, purchaseForm.items, purchaseForm.paidAmount, purchaseForm.tax]);

  const purchaseValidationErrors = useMemo(() => {
    const issues = [];
    if (!purchaseForm.supplierId) {
      issues.push("Select a supplier.");
    }
    if (purchasePreview.lines.length === 0) {
      issues.push("Add at least one item.");
      return issues;
    }
    purchasePreview.lines.forEach((line, index) => {
      if (!line.productId) {
        issues.push(`Row ${index + 1}: select a product.`);
      }
      if (line.quantity <= 0) {
        issues.push(`Row ${index + 1}: quantity must be > 0.`);
      }
      if (line.unitCost < 0 || line.discount < 0) {
        issues.push(`Row ${index + 1}: unit cost and discount cannot be negative.`);
      }
      if (line.discount > line.quantity * line.unitCost) {
        issues.push(`Row ${index + 1}: discount cannot exceed line amount.`);
      }
    });
    if (Number(purchaseForm.discount || 0) < 0 || Number(purchaseForm.tax || 0) < 0) {
      issues.push("Invoice discount/tax must be non-negative.");
    }
    return issues;
  }, [purchaseForm.discount, purchaseForm.supplierId, purchaseForm.tax, purchasePreview.lines]);

  const availableForPurchaseMethod = useMemo(
    () => Number(accountBalances[purchaseForm.paymentMethod] || 0),
    [accountBalances, purchaseForm.paymentMethod],
  );
  const purchaseMethodShortage = Math.max(purchasePreview.paid - availableForPurchaseMethod, 0);

  const duePurchases = useMemo(
    () => purchases.filter((invoice) => Number(invoice.dueAmount || 0) > 0),
    [purchases],
  );
  const selectedPaymentInvoice = useMemo(
    () => duePurchases.find((invoice) => Number(invoice.id) === Number(paymentForm.invoiceId)) || null,
    [duePurchases, paymentForm.invoiceId],
  );
  const availableForPaymentMethod = useMemo(
    () => Number(accountBalances[paymentForm.paymentMethod] || 0),
    [accountBalances, paymentForm.paymentMethod],
  );

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
    setPurchaseForm((prev) => {
      const items = prev.items.filter((_, idx) => idx !== index);
      return { ...prev, items: items.length > 0 ? items : [blankItem()] };
    });
  };

  const submitSupplier = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!hasActiveBranch) {
      setError("Select a branch before creating suppliers.");
      return;
    }
    try {
      await onCreateSupplier({ ...supplierForm, branchId: activeBranchId });
      setSupplierForm({ name: "", phone: "", contactPerson: "" });
      setSuccess("Supplier created.");
    } catch (err) {
      setError(err.message);
    }
  };

  const submitPurchase = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!hasActiveBranch) {
      setError("Select a branch before creating purchase invoice.");
      return;
    }
    if (purchaseValidationErrors.length > 0) {
      setError(purchaseValidationErrors[0]);
      return;
    }
    if (purchaseMethodShortage > 0) {
      setError(
        `${purchaseForm.paymentMethod} balance is not enough for paid amount. Missing $${money(
          purchaseMethodShortage,
        )}.`,
      );
      return;
    }

    try {
      await onCreatePurchase({
        ...purchaseForm,
        branchId: activeBranchId,
        supplierId: Number(purchaseForm.supplierId),
        discount: Number(purchaseForm.discount || 0),
        tax: Number(purchaseForm.tax || 0),
        paidAmount: Number(purchaseForm.paidAmount || 0),
        items: purchasePreview.lines.map((item) => ({
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
          discount: Number(item.discount || 0),
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
      setSuccess("Purchase invoice created.");
    } catch (err) {
      setError(err.message);
    }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    const amount = Number(paymentForm.amount || 0);
    if (!paymentForm.invoiceId) {
      setError("Select an invoice.");
      return;
    }
    if (amount <= 0) {
      setError("Payment amount must be greater than zero.");
      return;
    }
    if (selectedPaymentInvoice && amount > Number(selectedPaymentInvoice.dueAmount || 0)) {
      setError("Payment amount cannot exceed invoice due.");
      return;
    }
    if (amount > availableForPaymentMethod) {
      setError(
        `${paymentForm.paymentMethod} balance is not enough. Available $${money(
          availableForPaymentMethod,
        )}.`,
      );
      return;
    }
    try {
      await onAddPurchasePayment({
        invoiceId: Number(paymentForm.invoiceId),
        amount,
        paymentMethod: paymentForm.paymentMethod,
      });
      setPaymentForm({ invoiceId: "", amount: "", paymentMethod: "CASH" });
      setSuccess("Supplier payment saved.");
    } catch (err) {
      setError(err.message);
    }
  };

  const branchName = branches.find((branch) => Number(branch.id) === activeBranchId)?.name || "";

  return (
    <div className="tab-grid">
      <Panel title="Supplier" subtitle={`Branch: ${branchName}`}>
        <form className="grid-form multi" onSubmit={submitSupplier}>
          <label>
            Name
            <input
              value={supplierForm.name}
              onChange={(event) => setSupplierForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>
          <label>
            Phone
            <input
              value={supplierForm.phone}
              onChange={(event) => setSupplierForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </label>
          <label>
            Contact Person
            <input
              value={supplierForm.contactPerson}
              onChange={(event) =>
                setSupplierForm((prev) => ({ ...prev, contactPerson: event.target.value }))
              }
            />
          </label>
          <button type="submit" disabled={!hasActiveBranch}>
            Add Supplier
          </button>
        </form>
      </Panel>

      <Panel title="Purchase Invoice" subtitle="Incoming stock + supplier payable + account validation">
        <form className="grid-form multi" onSubmit={submitPurchase}>
          <label>
            Supplier
            <select
              value={purchaseForm.supplierId}
              onChange={(event) =>
                setPurchaseForm((prev) => ({ ...prev, supplierId: event.target.value }))
              }
              required
            >
              <option value="">Select</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Discount
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchaseForm.discount}
              onChange={(event) =>
                setPurchaseForm((prev) => ({ ...prev, discount: event.target.value }))
              }
            />
          </label>
          <label>
            Tax
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchaseForm.tax}
              onChange={(event) => setPurchaseForm((prev) => ({ ...prev, tax: event.target.value }))}
            />
          </label>
          <label>
            Paid Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchaseForm.paidAmount}
              onChange={(event) =>
                setPurchaseForm((prev) => ({ ...prev, paidAmount: event.target.value }))
              }
            />
          </label>
          <label>
            Payment Method
            <select
              value={purchaseForm.paymentMethod}
              onChange={(event) =>
                setPurchaseForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
              }
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
              onChange={(event) => setPurchaseForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </label>

          <div className="row-title">Items</div>
          {purchasePreview.lines.map((item, index) => (
            <div key={`${index}-${item.productId}`} className="item-line">
              <select
                value={item.productId}
                onChange={(event) => changeItem(index, "productId", event.target.value)}
                required
              >
                <option value="">Product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={item.quantity}
                onChange={(event) => changeItem(index, "quantity", event.target.value)}
                placeholder="Qty"
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.unitCost}
                onChange={(event) => changeItem(index, "unitCost", event.target.value)}
                placeholder="Unit Cost"
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.discount}
                onChange={(event) => changeItem(index, "discount", event.target.value)}
                placeholder="Discount"
              />
              <input
                value={item.batchNumber}
                onChange={(event) => changeItem(index, "batchNumber", event.target.value)}
                placeholder="Batch"
              />
              <button type="button" onClick={() => removeItem(index)}>
                Remove
              </button>
            </div>
          ))}

          <div className="action-row">
            <button type="button" onClick={addItem}>
              + Add Item
            </button>
            <div className="summary-band">
              <span>Subtotal: ${money(purchasePreview.subtotal)}</span>
              <span>Total: ${money(purchasePreview.total)}</span>
              <span>Paid: ${money(purchasePreview.paid)}</span>
              <span>Due: ${money(purchasePreview.due)}</span>
              <span>
                {purchaseForm.paymentMethod} Available: ${money(availableForPurchaseMethod)}
              </span>
            </div>
            <button type="submit" disabled={!hasActiveBranch}>
              Create Purchase
            </button>
          </div>
        </form>
        {purchaseValidationErrors.length > 0 ? (
          <p className="danger-note">{purchaseValidationErrors[0]}</p>
        ) : null}
        {purchaseMethodShortage > 0 ? (
          <p className="danger-note">
            {purchaseForm.paymentMethod} shortage: ${money(purchaseMethodShortage)}
          </p>
        ) : null}
      </Panel>

      <Panel title="Supplier Payment" subtitle="Only due invoices are shown">
        <form className="grid-form multi" onSubmit={submitPayment}>
          <label>
            Purchase Invoice
            <select
              value={paymentForm.invoiceId}
              onChange={(event) => {
                const invoice = duePurchases.find(
                  (entry) => Number(entry.id) === Number(event.target.value),
                );
                setPaymentForm((prev) => ({
                  ...prev,
                  invoiceId: event.target.value,
                  amount: invoice ? Number(invoice.dueAmount).toFixed(2) : "",
                }));
              }}
              required
            >
              <option value="">Select</option>
              {duePurchases.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.number} - Due ${money(invoice.dueAmount)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={paymentForm.amount}
              onChange={(event) => setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))}
              required
            />
          </label>
          <label>
            Method
            <select
              value={paymentForm.paymentMethod}
              onChange={(event) =>
                setPaymentForm((prev) => ({ ...prev, paymentMethod: event.target.value }))
              }
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="CARD">Card</option>
            </select>
          </label>
          <label>
            Available
            <input value={`$${money(availableForPaymentMethod)}`} readOnly />
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
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.number}</td>
                  <td>{invoice.supplier?.name || "-"}</td>
                  <td>{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                  <td>{invoice.status}</td>
                  <td>${money(invoice.total)}</td>
                  <td>${money(invoice.paidAmount)}</td>
                  <td>${money(invoice.dueAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {success ? <p className="success-note">{success}</p> : null}
      <InlineError message={error} />
    </div>
  );
}

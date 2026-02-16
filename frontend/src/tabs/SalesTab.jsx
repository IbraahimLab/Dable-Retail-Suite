import { useEffect, useMemo, useState } from "react";
import { InlineError, Panel } from "../components/Panel";

function blankItem() {
  return { productId: "", quantity: 1, unitPrice: 0, discount: 0 };
}

function money(value) {
  return Number(value || 0).toFixed(2);
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
  onLoadCustomerLedger,
  onReloadSales,
}) {
  const activeBranchId = useMemo(
    () => {
      if (data.user?.role === "ADMIN") {
        return data.selectedBranchId ? Number(data.selectedBranchId) : null;
      }
      return data.user?.branchId ? Number(data.user.branchId) : null;
    },
    [data.selectedBranchId, data.user],
  );
  const hasActiveBranch = Number.isFinite(activeBranchId) && Number(activeBranchId) > 0;

  const productMap = useMemo(
    () => new Map(products.map((product) => [Number(product.id), product])),
    [products],
  );

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerForm, setCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [saleForm, setSaleForm] = useState({
    customerId: "",
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
  const [returnForm, setReturnForm] = useState({
    invoiceId: "",
    salesItemId: "",
    quantity: 1,
    refundAmount: "",
    reason: "",
  });
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const filteredCustomers = useMemo(() => {
    const needle = customerSearch.trim().toLowerCase();
    if (!needle) {
      return customers;
    }
    return customers.filter((customer) => {
      return (
        String(customer.name || "").toLowerCase().includes(needle) ||
        String(customer.phone || "").toLowerCase().includes(needle) ||
        String(customer.email || "").toLowerCase().includes(needle)
      );
    });
  }, [customerSearch, customers]);

  const selectedCustomer = useMemo(() => {
    const id = Number(saleForm.customerId);
    if (!id) {
      return null;
    }
    return customers.find((customer) => Number(customer.id) === id) || null;
  }, [customers, saleForm.customerId]);

  useEffect(() => {
    if (!selectedCustomer || !onLoadCustomerLedger) {
      setLedger(null);
      return;
    }
    const run = async () => {
      try {
        setLedgerLoading(true);
        const data = await onLoadCustomerLedger(selectedCustomer.id);
        setLedger(data);
      } catch {
        setLedger(null);
      } finally {
        setLedgerLoading(false);
      }
    };
    run();
  }, [onLoadCustomerLedger, selectedCustomer]);

  const saleInvoicePreview = useMemo(() => {
    const lines = saleForm.items.map((item) => {
      const product = productMap.get(Number(item.productId));
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const discount = Number(item.discount || 0);
      const amount = quantity * unitPrice;
      const lineTotal = Math.max(amount - discount, 0);
      return {
        ...item,
        product,
        quantity,
        unitPrice,
        discount,
        amount,
        lineTotal,
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const discount = Number(saleForm.discount || 0);
    const tax = Number(saleForm.tax || 0);
    const total = Math.max(subtotal - discount + tax, 0);
    const paid = Math.min(Math.max(Number(saleForm.paidAmount || 0), 0), total);
    const due = Math.max(total - paid, 0);
    return { lines, subtotal, total, paid, due };
  }, [productMap, saleForm.discount, saleForm.items, saleForm.paidAmount, saleForm.tax]);

  const saleValidationErrors = useMemo(() => {
    const issues = [];
    if (saleInvoicePreview.lines.length === 0) {
      issues.push("At least one item is required.");
      return issues;
    }
    saleInvoicePreview.lines.forEach((line, index) => {
      if (!line.product) {
        issues.push(`Row ${index + 1}: select a product.`);
      }
      if (line.quantity <= 0) {
        issues.push(`Row ${index + 1}: quantity must be > 0.`);
      }
      if (line.unitPrice < 0) {
        issues.push(`Row ${index + 1}: price cannot be negative.`);
      }
      if (line.discount < 0) {
        issues.push(`Row ${index + 1}: discount cannot be negative.`);
      }
      if (line.discount > line.amount) {
        issues.push(`Row ${index + 1}: discount cannot exceed line amount.`);
      }
      if (line.product && line.quantity > Number(line.product.stock || 0)) {
        issues.push(`Row ${index + 1}: insufficient stock for ${line.product.name}.`);
      }
    });
    return issues;
  }, [saleInvoicePreview.lines]);

  const dueInvoices = useMemo(
    () => sales.filter((invoice) => Number(invoice.dueAmount || 0) > 0),
    [sales],
  );

  const selectedReturnInvoice = useMemo(() => {
    return sales.find((invoice) => Number(invoice.id) === Number(returnForm.invoiceId)) || null;
  }, [returnForm.invoiceId, sales]);

  const returnableProducts = useMemo(() => {
    if (!selectedReturnInvoice) {
      return [];
    }
    const returnedBySalesItem = new Map();
    const unassignedByProduct = new Map();

    for (const ret of selectedReturnInvoice.returns || []) {
      for (const item of ret.items || []) {
        const qty = Number(item.quantity || 0);
        if (Number(item.salesItemId)) {
          const salesItemId = Number(item.salesItemId);
          returnedBySalesItem.set(
            salesItemId,
            (returnedBySalesItem.get(salesItemId) || 0) + qty,
          );
        } else {
          const productId = Number(item.productId);
          unassignedByProduct.set(productId, (unassignedByProduct.get(productId) || 0) + qty);
        }
      }
    }

    return (selectedReturnInvoice.items || [])
      .map((item) => {
        const salesItemId = Number(item.id);
        const productId = Number(item.productId);
        const soldQty = Number(item.quantity || 0);
        const lineReturned = Number(returnedBySalesItem.get(salesItemId) || 0);
        const remainingOnLine = Math.max(soldQty - lineReturned, 0);
        const productUnassigned = Number(unassignedByProduct.get(productId) || 0);
        const allocateUnassigned = Math.min(remainingOnLine, productUnassigned);
        if (allocateUnassigned > 0) {
          unassignedByProduct.set(productId, productUnassigned - allocateUnassigned);
        }
        const maxQty = Math.max(remainingOnLine - allocateUnassigned, 0);
        if (maxQty <= 0) {
          return null;
        }
        return {
          salesItemId,
          productId,
          name: item.product?.name || `Product ${productId}`,
          unitPrice: Number(item.unitPrice || 0),
          maxQty,
        };
      })
      .filter(Boolean);
  }, [selectedReturnInvoice]);

  const selectedReturnProduct = useMemo(() => {
    return (
      returnableProducts.find(
        (item) => Number(item.salesItemId) === Number(returnForm.salesItemId),
      ) || null
    );
  }, [returnForm.salesItemId, returnableProducts]);

  useEffect(() => {
    if (!selectedReturnProduct) {
      return;
    }
    setReturnForm((prev) => {
      const quantity = Math.min(Number(prev.quantity || 1), selectedReturnProduct.maxQty);
      if (
        Number(prev.quantity) === quantity &&
        Number(prev.refundAmount || 0) === quantity * selectedReturnProduct.unitPrice
      ) {
        return prev;
      }
      return {
        ...prev,
        quantity,
        refundAmount: (quantity * selectedReturnProduct.unitPrice).toFixed(2),
      };
    });
  }, [selectedReturnProduct]);

  const customerSales = useMemo(() => {
    if (!selectedCustomer) {
      return [];
    }
    return sales
      .filter((invoice) => Number(invoice.customerId) === Number(selectedCustomer.id))
      .slice(0, 8);
  }, [sales, selectedCustomer]);

  const changeItem = (index, key, value) => {
    setSaleForm((prev) => {
      const nextItems = [...prev.items];
      const current = { ...nextItems[index], [key]: value };
      if (key === "productId") {
        const product = productMap.get(Number(value));
        if (product && Number(current.unitPrice || 0) <= 0) {
          current.unitPrice = Number(product.sellPrice || 0);
        }
      }
      nextItems[index] = current;
      return { ...prev, items: nextItems };
    });
  };

  const addItem = () => {
    setSaleForm((prev) => ({ ...prev, items: [...prev.items, blankItem()] }));
  };

  const removeItem = (index) => {
    setSaleForm((prev) => {
      const items = prev.items.filter((_, idx) => idx !== index);
      return { ...prev, items: items.length > 0 ? items : [blankItem()] };
    });
  };

  const selectCustomerForSale = (customer) => {
    setSaleForm((prev) => ({ ...prev, customerId: String(customer.id) }));
    setSuccess("");
    setError("");
  };

  const submitCustomer = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!hasActiveBranch) {
      setError("Select a branch before creating customers.");
      return;
    }
    try {
      setBusyAction("customer");
      await onCreateCustomer({ ...customerForm, branchId: activeBranchId });
      setCustomerForm({ name: "", phone: "", email: "", address: "" });
      setSuccess("Customer created.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  };

  const submitSale = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!hasActiveBranch) {
      setError("Select a branch before creating invoices.");
      return;
    }
    if (saleValidationErrors.length > 0) {
      setError(saleValidationErrors[0]);
      return;
    }
    try {
      setBusyAction("sale");
      await onCreateSale({
        ...saleForm,
        branchId: activeBranchId,
        customerId: saleForm.customerId ? Number(saleForm.customerId) : null,
        discount: Number(saleForm.discount || 0),
        tax: Number(saleForm.tax || 0),
        paidAmount: Number(saleForm.paidAmount || 0),
        items: saleInvoicePreview.lines.map((line) => ({
          productId: Number(line.productId),
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          discount: Number(line.discount || 0),
        })),
      });
      setSaleForm({
        customerId: saleForm.customerId,
        discount: 0,
        tax: 0,
        paidAmount: 0,
        paymentMethod: "CASH",
        note: "",
        items: [blankItem()],
      });
      setSuccess("Sales invoice created.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  };

  const submitSalePayment = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    try {
      setBusyAction("payment");
      await onAddSalePayment({
        invoiceId: Number(paymentForm.invoiceId),
        amount: Number(paymentForm.amount),
        paymentMethod: paymentForm.paymentMethod,
      });
      setPaymentForm({ invoiceId: "", amount: "", paymentMethod: "CASH" });
      setSuccess("Payment recorded.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  };

  const submitReturn = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!selectedReturnProduct) {
      setError("Select a valid return product.");
      return;
    }
    const qty = Number(returnForm.quantity || 0);
    if (qty <= 0 || qty > selectedReturnProduct.maxQty) {
      setError(`Return quantity must be between 1 and ${selectedReturnProduct.maxQty}.`);
      return;
    }
    try {
      setBusyAction("return");
      await onCreateReturn({
        invoiceId: Number(returnForm.invoiceId),
        items: [
          {
            productId: Number(selectedReturnProduct.productId),
            salesItemId: Number(selectedReturnProduct.salesItemId),
            quantity: qty,
            unitPrice: Number(selectedReturnProduct.unitPrice),
          },
        ],
        refundAmount: Number(returnForm.refundAmount || 0),
        reason: returnForm.reason,
      });
      setReturnForm({
        invoiceId: "",
        salesItemId: "",
        quantity: 1,
        refundAmount: "",
        reason: "",
      });
      setSuccess("Return processed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  };

  const openPaymentForInvoice = (invoice) => {
    setPaymentForm({
      invoiceId: String(invoice.id),
      amount: Number(invoice.dueAmount || 0).toFixed(2),
      paymentMethod: "CASH",
    });
  };

  const openReturnForInvoice = (invoice) => {
    setReturnForm({
      invoiceId: String(invoice.id),
      salesItemId: "",
      quantity: 1,
      refundAmount: "",
      reason: "",
    });
  };

  return (
    <div className="sales-workspace">
      <section className="sales-main">
        <Panel title="Sales Invoice Builder" subtitle="Fast invoice flow with live stock/totals checks">
          <form className="grid-form multi" onSubmit={submitSale}>
            <label>
              Customer
              <select
                value={saleForm.customerId}
                onChange={(event) =>
                  setSaleForm((prev) => ({ ...prev, customerId: event.target.value }))
                }
              >
                <option value="">Walk-in</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
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
                onChange={(event) =>
                  setSaleForm((prev) => ({ ...prev, discount: event.target.value }))
                }
              />
            </label>
            <label>
              Tax
              <input
                type="number"
                step="0.01"
                value={saleForm.tax}
                onChange={(event) =>
                  setSaleForm((prev) => ({ ...prev, tax: event.target.value }))
                }
              />
            </label>
            <label>
              Paid Now
              <input
                type="number"
                step="0.01"
                value={saleForm.paidAmount}
                onChange={(event) =>
                  setSaleForm((prev) => ({ ...prev, paidAmount: event.target.value }))
                }
              />
            </label>
            <label>
              Note
              <input
                value={saleForm.note}
                onChange={(event) =>
                  setSaleForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </label>

            <div className="row-title">Items</div>
            {saleInvoicePreview.lines.map((line, index) => {
              const availableStock = Number(line.product?.stock || 0);
              return (
                <div key={`${index}-${line.productId}`} className="item-line sales-item-line">
                  <select
                    value={line.productId}
                    onChange={(event) => changeItem(index, "productId", event.target.value)}
                    required
                  >
                    <option value="">Product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} | Stock {money(product.stock)} | ${money(product.sellPrice)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={line.quantity}
                    onChange={(event) => changeItem(index, "quantity", event.target.value)}
                    placeholder="Qty"
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) => changeItem(index, "unitPrice", event.target.value)}
                    placeholder="Unit Price"
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={line.discount}
                    onChange={(event) => changeItem(index, "discount", event.target.value)}
                    placeholder="Item Discount"
                  />
                  <span className="sales-line-total">
                    ${money(line.lineTotal)}
                    {line.product ? (
                      <small className={line.quantity > availableStock ? "danger-note" : "muted-note"}>
                        Stock: {money(availableStock)}
                      </small>
                    ) : null}
                  </span>
                  <button type="button" onClick={() => removeItem(index)}>
                    Remove
                  </button>
                </div>
              );
            })}

            <div className="action-row">
              <button type="button" onClick={addItem}>
                + Add Item
              </button>
              <div className="summary-band">
                <span>Subtotal: ${money(saleInvoicePreview.subtotal)}</span>
                <span>Total: ${money(saleInvoicePreview.total)}</span>
                <span>Due: ${money(saleInvoicePreview.due)}</span>
              </div>
              <button type="submit" disabled={busyAction === "sale" || !hasActiveBranch}>
                {busyAction === "sale" ? "Saving..." : "Create Invoice"}
              </button>
            </div>
          </form>
          {!hasActiveBranch ? (
            <p className="danger-note">Select a branch from the header before creating invoices.</p>
          ) : null}
          {saleValidationErrors.length > 0 ? (
            <p className="danger-note">{saleValidationErrors[0]}</p>
          ) : null}
        </Panel>

        <Panel title={`Sales Invoices (${sales.length})`} actions={<button onClick={onReloadSales}>Refresh</button>}>
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.number}</td>
                    <td>{invoice.customer?.name || "Walk-in"}</td>
                    <td>{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                    <td>{invoice.status}</td>
                    <td>${money(invoice.total)}</td>
                    <td>${money(invoice.paidAmount)}</td>
                    <td>${money(invoice.dueAmount)}</td>
                    <td className="inline-actions">
                      <button
                        type="button"
                        onClick={() => openPaymentForInvoice(invoice)}
                        disabled={Number(invoice.dueAmount || 0) <= 0}
                      >
                        Collect
                      </button>
                      <button type="button" onClick={() => openReturnForInvoice(invoice)}>
                        Return
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <aside className="sales-side">
        <Panel
          title="Customers"
          subtitle={`Branch: ${branches.find((branch) => branch.id === activeBranchId)?.name || ""}`}
        >
          <div className="customer-search">
            <input
              placeholder="Search customer by name / phone"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
            />
          </div>
          <div className="mini-list">
            {filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className={`mini-list-item ${Number(saleForm.customerId) === Number(customer.id) ? "active" : ""}`}
                onClick={() => selectCustomerForSale(customer)}
              >
                <div>
                  <strong>{customer.name}</strong>
                  <small>{customer.phone || "No phone"}</small>
                </div>
                <span className={Number(customer.outstanding || 0) > 0 ? "danger-note" : "muted-note"}>
                  Due ${money(customer.outstanding)}
                </span>
              </button>
            ))}
          </div>

          <form className="grid-form multi compact" onSubmit={submitCustomer}>
            <label>
              Name
              <input
                value={customerForm.name}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Phone
              <input
                value={customerForm.phone}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, phone: event.target.value }))
                }
              />
            </label>
            <label>
              Email
              <input
                value={customerForm.email}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, email: event.target.value }))
                }
              />
            </label>
            <label>
              Address
              <input
                value={customerForm.address}
                onChange={(event) =>
                  setCustomerForm((prev) => ({ ...prev, address: event.target.value }))
                }
              />
            </label>
            <button type="submit" disabled={busyAction === "customer" || !hasActiveBranch}>
              {busyAction === "customer" ? "Saving..." : "Add Customer"}
            </button>
          </form>
        </Panel>

        <Panel title="Selected Customer Overview" subtitle="Outstanding + recent activity">
          {selectedCustomer ? (
            <div className="customer-overview">
              <div className="summary-band">
                <span>Outstanding: ${money(selectedCustomer.outstanding)}</span>
                <span>Loyalty: {Number(selectedCustomer.loyaltyPoints || 0)}</span>
              </div>
              <div className="summary-band">
                <span>Invoices: {Number(selectedCustomer.purchaseCount || 0)}</span>
                <span>Total Spent: ${money(selectedCustomer.totalSpent)}</span>
              </div>
              {ledgerLoading ? <p className="muted-note">Loading ledger...</p> : null}
              {ledger ? (
                <div className="mini-list">
                  {(ledger.entries || []).slice(0, 6).map((entry) => (
                    <div key={entry.id} className="mini-list-item static">
                      <div>
                        <strong>{entry.type}</strong>
                        <small>
                          {entry.salesInvoice?.number || "No Invoice"} |{" "}
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </small>
                      </div>
                      <span>${money(entry.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mini-list">
                {customerSales.map((invoice) => (
                  <div key={invoice.id} className="mini-list-item static">
                    <div>
                      <strong>{invoice.number}</strong>
                      <small>{new Date(invoice.invoiceDate).toLocaleDateString()}</small>
                    </div>
                    <span className="muted-note">Due ${money(invoice.dueAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="muted-note">Select a customer to view outstanding ledger and history.</p>
          )}
        </Panel>

        <Panel title="Collect Payment" subtitle="Only invoices with due are listed">
          <form className="grid-form multi compact" onSubmit={submitSalePayment}>
            <label>
              Invoice
              <select
                value={paymentForm.invoiceId}
                onChange={(event) => {
                  const invoice = dueInvoices.find(
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
                {dueInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number} | {invoice.customer?.name || "Walk-in"} | Due $
                    {money(invoice.dueAmount)}
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
                onChange={(event) =>
                  setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))
                }
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
            <button type="submit" disabled={busyAction === "payment"}>
              {busyAction === "payment" ? "Saving..." : "Save Payment"}
            </button>
          </form>
        </Panel>

        <Panel title="Sales Return" subtitle="Validated by sold qty minus previous returns">
          <form className="grid-form multi compact" onSubmit={submitReturn}>
            <label>
              Invoice
              <select
                value={returnForm.invoiceId}
                onChange={(event) =>
                  setReturnForm({
                    invoiceId: event.target.value,
                    salesItemId: "",
                    quantity: 1,
                    refundAmount: "",
                    reason: "",
                  })
                }
                required
              >
                <option value="">Select</option>
                {sales.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.number} | {invoice.customer?.name || "Walk-in"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Invoice Line
              <select
                value={returnForm.salesItemId}
                onChange={(event) =>
                  setReturnForm((prev) => ({ ...prev, salesItemId: event.target.value }))
                }
                required
                disabled={!returnForm.invoiceId}
              >
                <option value="">Select</option>
                {returnableProducts.map((item) => (
                  <option key={item.salesItemId} value={item.salesItemId}>
                    {item.name} | Line #{item.salesItemId} | Max {money(item.maxQty)} | $
                    {money(item.unitPrice)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                step="0.01"
                value={returnForm.quantity}
                onChange={(event) =>
                  setReturnForm((prev) => ({ ...prev, quantity: event.target.value }))
                }
                min={0}
                max={selectedReturnProduct?.maxQty || undefined}
                required
              />
            </label>
            <label>
              Refund Amount
              <input
                type="number"
                step="0.01"
                value={returnForm.refundAmount}
                onChange={(event) =>
                  setReturnForm((prev) => ({ ...prev, refundAmount: event.target.value }))
                }
              />
            </label>
            <label>
              Reason
              <input
                value={returnForm.reason}
                onChange={(event) =>
                  setReturnForm((prev) => ({ ...prev, reason: event.target.value }))
                }
              />
            </label>
            <button type="submit" disabled={busyAction === "return"}>
              {busyAction === "return" ? "Saving..." : "Process Return"}
            </button>
          </form>
        </Panel>

        {success ? <p className="success-note">{success}</p> : null}
        <InlineError message={error} />
      </aside>
    </div>
  );
}

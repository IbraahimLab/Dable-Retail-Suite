import { useMemo, useState } from "react";
import { Panel, InlineError } from "../components/Panel";

export default function ProductsTab({
  data,
  branches,
  categories,
  units,
  suppliers,
  products,
  lowStock,
  onCreateProduct,
  onCreateCategory,
  onAdjustStock,
  onReloadProducts,
}) {
  const activeBranchId = useMemo(
    () => Number(data.user?.role === "ADMIN" ? data.selectedBranchId : data.user?.branchId),
    [data.selectedBranchId, data.user],
  );

  const [productForm, setProductForm] = useState({
    name: "",
    sku: "",
    categoryId: "",
    baseUnitId: "",
    supplierId: "",
    minStock: 0,
    sellPrice: 0,
  });
  const [categoryForm, setCategoryForm] = useState({ name: "" });
  const [stockForm, setStockForm] = useState({
    productId: "",
    quantity: "",
    unitCost: 0,
    sellPrice: 0,
    note: "",
  });
  const [error, setError] = useState("");

  const submitProduct = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onCreateProduct({
        ...productForm,
        branchId: activeBranchId,
      });
      setProductForm({
        name: "",
        sku: "",
        categoryId: "",
        baseUnitId: "",
        supplierId: "",
        minStock: 0,
        sellPrice: 0,
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const submitCategory = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const created = await onCreateCategory({
        name: String(categoryForm.name || "").trim(),
      });
      setCategoryForm({ name: "" });
      if (created?.id) {
        setProductForm((prev) => ({ ...prev, categoryId: String(created.id) }));
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const submitAdjust = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onAdjustStock({
        ...stockForm,
        productId: Number(stockForm.productId),
        branchId: activeBranchId,
        quantity: Number(stockForm.quantity),
      });
      setStockForm({
        productId: "",
        quantity: "",
        unitCost: 0,
        sellPrice: 0,
        note: "",
      });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="tab-grid">
      <Panel title="New Product" subtitle={`Branch: ${branches.find((b) => b.id === activeBranchId)?.name || ""}`}>
        <form className="grid-form multi" onSubmit={submitProduct}>
          <label>
            Name
            <input
              value={productForm.name}
              onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </label>
          <label>
            SKU
            <input
              value={productForm.sku}
              onChange={(e) => setProductForm((p) => ({ ...p, sku: e.target.value }))}
              required
            />
          </label>
          <label>
            Category
            <select
              value={productForm.categoryId}
              onChange={(e) => setProductForm((p) => ({ ...p, categoryId: e.target.value }))}
            >
              <option value="">Select</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            New Category
            <div className="inline-actions">
              <input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ name: e.target.value })}
                placeholder="Create category"
              />
              <button type="button" onClick={submitCategory} disabled={!String(categoryForm.name || "").trim()}>
                + Category
              </button>
            </div>
          </label>
          <label>
            Unit
            <select
              value={productForm.baseUnitId}
              onChange={(e) => setProductForm((p) => ({ ...p, baseUnitId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Supplier
            <select
              value={productForm.supplierId}
              onChange={(e) => setProductForm((p) => ({ ...p, supplierId: e.target.value }))}
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
            Min Stock
            <input
              type="number"
              step="0.01"
              value={productForm.minStock}
              onChange={(e) => setProductForm((p) => ({ ...p, minStock: e.target.value }))}
            />
          </label>
          <label>
            Sell Price
            <input
              type="number"
              step="0.01"
              value={productForm.sellPrice}
              onChange={(e) => setProductForm((p) => ({ ...p, sellPrice: e.target.value }))}
            />
          </label>
          <button type="submit">Create Product</button>
        </form>
      </Panel>

      <Panel title="Stock Adjustment" subtitle="Positive = add stock, Negative = reduce stock">
        <form className="grid-form multi" onSubmit={submitAdjust}>
          <label>
            Product
            <select
              value={stockForm.productId}
              onChange={(e) => setStockForm((p) => ({ ...p, productId: e.target.value }))}
              required
            >
              <option value="">Select</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input
              type="number"
              step="0.01"
              value={stockForm.quantity}
              onChange={(e) => setStockForm((p) => ({ ...p, quantity: e.target.value }))}
              required
            />
          </label>
          <label>
            Unit Cost
            <input
              type="number"
              step="0.01"
              value={stockForm.unitCost}
              onChange={(e) => setStockForm((p) => ({ ...p, unitCost: e.target.value }))}
            />
          </label>
          <label>
            Sell Price
            <input
              type="number"
              step="0.01"
              value={stockForm.sellPrice}
              onChange={(e) => setStockForm((p) => ({ ...p, sellPrice: e.target.value }))}
            />
          </label>
          <label>
            Note
            <input
              value={stockForm.note}
              onChange={(e) => setStockForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <button type="submit">Adjust Stock</button>
        </form>
        <InlineError message={error} />
      </Panel>

      <Panel
        title={`Products (${products.length})`}
        subtitle="Current branch inventory"
        actions={<button onClick={onReloadProducts}>Refresh</button>}
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Supplier</th>
                <th>Unit</th>
                <th>Stock</th>
                <th>Min Stock</th>
                <th>Sell Price</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.sku}</td>
                  <td>{p.category?.name || "-"}</td>
                  <td>{p.supplier?.name || "-"}</td>
                  <td>{p.baseUnit?.name || "-"}</td>
                  <td>{Number(p.stock || 0).toFixed(2)}</td>
                  <td>{Number(p.minStock || 0).toFixed(2)}</td>
                  <td>${Number(p.sellPrice || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title={`Low Stock Alerts (${lowStock.length})`} subtitle="Reorder immediately">
        <div className="chips">
          {lowStock.map((item) => (
            <span key={item.id} className="chip danger">
              {item.name} ({Number(item.stock || 0).toFixed(2)})
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}

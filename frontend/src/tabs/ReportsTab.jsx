import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../components/Panel";

export default function ReportsTab({ reports, onLoadReports }) {
  const [range, setRange] = useState({
    from: "",
    to: "",
  });

  const run = async (e) => {
    e.preventDefault();
    await onLoadReports(range);
  };

  return (
    <div className="tab-grid">
      <Panel title="Report Range" subtitle="Use date range for branch-level reports">
        <form className="grid-form multi" onSubmit={run}>
          <label>
            From
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((p) => ({ ...p, to: e.target.value }))}
            />
          </label>
          <button type="submit">Load Reports</button>
        </form>
      </Panel>

      <Panel title="Profit Summary">
        <div className="kpi-row">
          <div>
            <span>Revenue</span>
            <strong>${Number(reports.profit?.revenue || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Cost</span>
            <strong>${Number(reports.profit?.cost || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Gross Profit</span>
            <strong>${Number(reports.profit?.grossProfit || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Margin</span>
            <strong>{Number(reports.profit?.margin || 0).toFixed(2)}%</strong>
          </div>
        </div>
      </Panel>

      <Panel title="Best Selling Products">
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={reports.bestSelling || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="quantity" fill="#de6d1f" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Slow Moving Stock">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Sold Qty</th>
                <th>Current Stock</th>
                <th>Min Stock</th>
              </tr>
            </thead>
            <tbody>
              {(reports.slowMoving || []).map((item) => (
                <tr key={item.productId}>
                  <td>{item.name}</td>
                  <td>{Number(item.soldQuantity || 0).toFixed(2)}</td>
                  <td>{Number(item.currentStock || 0).toFixed(2)}</td>
                  <td>{Number(item.minStock || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Expense Breakdown">
        <div className="chips">
          {(reports.expenses?.byCategory || []).map((c) => (
            <span key={c.name} className="chip">
              {c.name}: ${Number(c.amount || 0).toFixed(2)}
            </span>
          ))}
        </div>
      </Panel>

      <Panel title="Branch Summary">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Invoices</th>
                <th>Sales</th>
                <th>Collected</th>
                <th>Due</th>
                <th>Expenses</th>
                <th>Stock Value</th>
              </tr>
            </thead>
            <tbody>
              {(reports.branchSummary?.branches || []).map((b) => (
                <tr key={b.branchId}>
                  <td>{b.branchName}</td>
                  <td>{b.invoices}</td>
                  <td>${Number(b.salesTotal || 0).toFixed(2)}</td>
                  <td>${Number(b.collected || 0).toFixed(2)}</td>
                  <td>${Number(b.due || 0).toFixed(2)}</td>
                  <td>${Number(b.expenses || 0).toFixed(2)}</td>
                  <td>${Number(b.stockValue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

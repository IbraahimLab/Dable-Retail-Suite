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

      <Panel title="Income Statement">
        <div className="kpi-row">
          <div>
            <span>Revenue</span>
            <strong>${Number(reports.incomeStatement?.revenue || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Cost of Goods</span>
            <strong>${Number(reports.incomeStatement?.costOfGoods || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Gross Profit</span>
            <strong>${Number(reports.incomeStatement?.grossProfit || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Operating Expense</span>
            <strong>${Number(reports.incomeStatement?.operatingExpense || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Net Profit</span>
            <strong>${Number(reports.incomeStatement?.netProfit || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Net Margin</span>
            <strong>{Number(reports.incomeStatement?.netMargin || 0).toFixed(2)}%</strong>
          </div>
        </div>
      </Panel>

      <Panel title="Cash Flow">
        <div className="kpi-row">
          <div>
            <span>Total Inflow</span>
            <strong>${Number(reports.cashFlow?.inflow || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Total Outflow</span>
            <strong>${Number(reports.cashFlow?.outflow || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Net</span>
            <strong>${Number(reports.cashFlow?.net || 0).toFixed(2)}</strong>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Inflow</th>
                <th>Outflow</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {(reports.cashFlow?.byMethod || []).map((row) => (
                <tr key={row.method}>
                  <td>{row.method}</td>
                  <td>${Number(row.inflow || 0).toFixed(2)}</td>
                  <td>${Number(row.outflow || 0).toFixed(2)}</td>
                  <td>${Number(row.net || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

      <Panel title="Accounts Receivable (Customer Outstanding)">
        <div className="kpi-row">
          <div>
            <span>Customers with Due</span>
            <strong>{Number(reports.accountsReceivable?.count || 0)}</strong>
          </div>
          <div>
            <span>Total Outstanding</span>
            <strong>${Number(reports.accountsReceivable?.totalOutstanding || 0).toFixed(2)}</strong>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Invoices</th>
                <th>Total Sales</th>
                <th>Due on Invoices</th>
                <th>Outstanding</th>
                <th>Last Invoice</th>
              </tr>
            </thead>
            <tbody>
              {(reports.accountsReceivable?.customers || []).map((row) => (
                <tr key={row.customerId}>
                  <td>{row.name}</td>
                  <td>{row.invoices}</td>
                  <td>${Number(row.totalSales || 0).toFixed(2)}</td>
                  <td>${Number(row.dueOnInvoices || 0).toFixed(2)}</td>
                  <td>${Number(row.outstanding || 0).toFixed(2)}</td>
                  <td>{row.lastInvoiceDate ? new Date(row.lastInvoiceDate).toLocaleDateString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Accounts Payable (Supplier Outstanding)">
        <div className="kpi-row">
          <div>
            <span>Suppliers with Due</span>
            <strong>{Number(reports.accountsPayable?.count || 0)}</strong>
          </div>
          <div>
            <span>Total Outstanding</span>
            <strong>${Number(reports.accountsPayable?.totalOutstanding || 0).toFixed(2)}</strong>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Invoices</th>
                <th>Purchased</th>
                <th>Paid</th>
                <th>Outstanding</th>
                <th>Last Invoice</th>
              </tr>
            </thead>
            <tbody>
              {(reports.accountsPayable?.suppliers || []).map((row) => (
                <tr key={row.supplierId}>
                  <td>{row.name}</td>
                  <td>{row.invoices}</td>
                  <td>${Number(row.totalPurchased || 0).toFixed(2)}</td>
                  <td>${Number(row.paidOnInvoices || 0).toFixed(2)}</td>
                  <td>${Number(row.outstanding || 0).toFixed(2)}</td>
                  <td>{row.lastInvoiceDate ? new Date(row.lastInvoiceDate).toLocaleDateString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        <div className="kpi-row">
          <div>
            <span>Total Expenses</span>
            <strong>${Number(reports.expenses?.total || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Transactions</span>
            <strong>{Number(reports.expenses?.count || 0)}</strong>
          </div>
        </div>
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

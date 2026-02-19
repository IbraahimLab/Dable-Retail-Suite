import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel } from "../components/Panel";

export default function ReportsTab({ reports, onLoadReports, onCloseFiscalYear, userRole, company }) {
  const canViewOwnerReports = userRole === "ADMIN" || userRole === "MANAGER";
  const [range, setRange] = useState({
    from: "",
    to: "",
    fiscalYear: String(new Date().getFullYear()),
  });
  const [closeNote, setCloseNote] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [closeSuccess, setCloseSuccess] = useState("");

  const run = async (e) => {
    e.preventDefault();
    await onLoadReports(range);
  };

  const closeYear = async () => {
    setCloseBusy(true);
    setCloseError("");
    setCloseSuccess("");
    try {
      const result = await onCloseFiscalYear({
        from: range.from,
        to: range.to,
        fiscalYear: Number(range.fiscalYear),
        note: closeNote,
      });
      setCloseSuccess(`Fiscal year ${result?.closing?.fiscalYear} closed successfully.`);
      setCloseNote("");
    } catch (error) {
      setCloseError(error.message);
    } finally {
      setCloseBusy(false);
    }
  };

  const alreadyClosed = Boolean(reports.yearEndOwner?.closed?.id);

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
          {canViewOwnerReports ? (
            <label>
              Fiscal Year
              <input
                type="number"
                min="1900"
                max="3000"
                value={range.fiscalYear}
                onChange={(e) => setRange((p) => ({ ...p, fiscalYear: e.target.value }))}
              />
            </label>
          ) : null}
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

      {canViewOwnerReports ? (
        <Panel title="Balance Sheet">
          <div className="kpi-row">
            <div>
              <span>Total Assets</span>
              <strong>${Number(reports.balanceSheet?.assets?.total || 0).toFixed(2)}</strong>
            </div>
            <div>
              <span>Total Liabilities</span>
              <strong>${Number(reports.balanceSheet?.liabilities?.total || 0).toFixed(2)}</strong>
            </div>
            <div>
              <span>Total Equity</span>
              <strong>${Number(reports.balanceSheet?.equity?.total || 0).toFixed(2)}</strong>
            </div>
            <div>
              <span>Balance Gap</span>
              <strong>${Number(reports.balanceSheet?.equation?.balanceGap || 0).toFixed(2)}</strong>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Item</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Assets</td>
                  <td>Cash + Bank + Card</td>
                  <td>${Number(reports.balanceSheet?.assets?.cashAndAccounts || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Assets</td>
                  <td>Receivables</td>
                  <td>${Number(reports.balanceSheet?.assets?.receivables || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Assets</td>
                  <td>Inventory Value</td>
                  <td>${Number(reports.balanceSheet?.assets?.inventoryValue || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Liabilities</td>
                  <td>Supplier Payables</td>
                  <td>${Number(reports.balanceSheet?.liabilities?.supplierPayables || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Equity</td>
                  <td>Opening Capital</td>
                  <td>${Number(reports.balanceSheet?.equity?.openingCapital || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Equity</td>
                  <td>Retained Earnings</td>
                  <td>${Number(reports.balanceSheet?.equity?.retainedEarnings || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Equity</td>
                  <td>Owner Withdrawals</td>
                  <td>${Number(reports.balanceSheet?.equity?.ownerWithdrawals || 0).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {canViewOwnerReports ? (
        <Panel
          title="Year-End Owner Summary"
          subtitle={`${company?.name || "Company"} | Fiscal ${reports.yearEndOwner?.fiscalYear || range.fiscalYear}`}
        >
          <div className="chips">
            <span className="chip">Period: {reports.yearEndOwner?.period?.label || "-"}</span>
            <span className="chip">Owner: {reports.yearEndOwner?.company?.ownerName || "-"}</span>
          </div>
          <div className="kpi-row">
            <div>
              <span>Revenue</span>
              <strong>${Number(reports.yearEndOwner?.revenue || 0).toFixed(2)}</strong>
            </div>
            <div>
              <span>Net Profit</span>
              <strong>${Number(reports.yearEndOwner?.netProfit || 0).toFixed(2)}</strong>
            </div>
            <div>
              <span>Owner Withdrawn</span>
              <strong>${Number(reports.yearEndOwner?.ownerWithdrawals || 0).toFixed(2)}</strong>
            </div>
            <div>
              <span>Available Funds</span>
              <strong>${Number(reports.yearEndOwner?.yearEndPosition?.availableFunds || 0).toFixed(2)}</strong>
            </div>
          </div>
          <div className="kpi-row">
            <div>
              <span>Suggested Owner Take</span>
              <strong>${Number(reports.yearEndOwner?.ownerTakeGuide?.suggestedTakeNow || 0).toFixed(2)}</strong>
            </div>
            <div>
              <span>Max by Profit</span>
              <strong>${Number(reports.yearEndOwner?.ownerTakeGuide?.maxByProfit || 0).toFixed(2)}</strong>
            </div>
            <div>
              <span>Max by Cash</span>
              <strong>${Number(reports.yearEndOwner?.ownerTakeGuide?.maxByCash || 0).toFixed(2)}</strong>
            </div>
          </div>
          <div className="grid-form multi">
            <label>
              Close Note (optional)
              <input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
            </label>
            <label>
              Closed Status
              <input
                readOnly
                value={
                  reports.yearEndOwner?.closed
                    ? `Closed on ${new Date(reports.yearEndOwner.closed.closedAt).toLocaleDateString()}`
                    : "Open"
                }
              />
            </label>
            <button type="button" onClick={closeYear} disabled={closeBusy || alreadyClosed}>
              {alreadyClosed ? "Fiscal Year Closed" : closeBusy ? "Closing..." : "Close Fiscal Year"}
            </button>
          </div>
          {reports.yearEndOwner?.closed ? (
            <div className="chips">
              <span className="chip">Closed By: {reports.yearEndOwner.closed.closedBy?.username || "-"}</span>
              <span className="chip">Closed At: {new Date(reports.yearEndOwner.closed.closedAt).toLocaleString()}</span>
            </div>
          ) : null}
          {closeSuccess ? <p className="success-note">{closeSuccess}</p> : null}
          {closeError ? <p className="error-text">{closeError}</p> : null}
        </Panel>
      ) : null}

      {canViewOwnerReports ? (
        <Panel title="Closed Fiscal Years">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fiscal Year</th>
                  <th>Branch</th>
                  <th>Closed At</th>
                  <th>Closed By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(reports.fiscalClosings?.closings || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.fiscalYear}</td>
                    <td>{row.branch?.name || "-"}</td>
                    <td>{new Date(row.closedAt).toLocaleString()}</td>
                    <td>{row.closedBy?.username || "-"}</td>
                    <td>{row.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

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

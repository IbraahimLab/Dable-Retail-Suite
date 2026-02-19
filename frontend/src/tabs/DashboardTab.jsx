import { useMemo } from "react";
import { Panel } from "../components/Panel";

const metricLabels = [
  ["todaySalesCount", "Invoices Today"],
  ["todaySalesTotal", "Sales Today"],
  ["todayCollected", "Collected Today"],
  ["todayDue", "Due Today"],
  ["monthSalesCount", "Invoices This Month"],
  ["monthSalesTotal", "Sales This Month"],
  ["monthCollected", "Collected This Month"],
  ["monthDue", "Month Due"],
  ["monthProfit", "Gross Profit (Month)"],
  ["monthExpenses", "Expenses (Month)"],
  ["lowStockCount", "Low Stock Items"],
  ["customerOutstanding", "Customer Outstanding"],
  ["supplierOutstanding", "Supplier Outstanding"],
  ["inventoryValue", "Inventory Value"],
];

function metricValue(key, value) {
  if (key.includes("Count") || key.includes("Stock")) {
    return Number(value || 0).toLocaleString();
  }
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function DashboardTab({ dashboard, dailySales, accounts }) {
  const cards = useMemo(
    () =>
      metricLabels.map(([key, label]) => ({
        key,
        label,
        value: metricValue(key, dashboard?.[key]),
      })),
    [dashboard],
  );
  const accountBalances = dashboard?.accountBalances?.balances || accounts?.balances || {};
  const topProducts = dashboard?.topProducts || [];

  return (
    <div className="tab-grid">
      <Panel title="Business Snapshot" subtitle="Operations + finance view">
        <div className="stat-grid">
          {cards.map((item) => (
            <article key={item.key} className="stat-card">
              <h4>{item.label}</h4>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="Account Balances" subtitle="Cash/Bank/Card available for spending">
        <div className="kpi-row">
          <div>
            <span>Cash</span>
            <strong>${Number(accountBalances.CASH || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Bank</span>
            <strong>${Number(accountBalances.BANK || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Card</span>
            <strong>${Number(accountBalances.CARD || 0).toFixed(2)}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>${Number(dashboard?.accountBalances?.total || accounts?.total || 0).toFixed(2)}</strong>
          </div>
        </div>
      </Panel>

      <Panel title="Daily Sales" subtitle={dailySales?.date || "No date selected"}>
        <div className="kpi-row">
          <div>
            <span>Total</span>
            <strong>
              ${Number(dailySales?.total || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </strong>
          </div>
          <div>
            <span>Paid</span>
            <strong>
              ${Number(dailySales?.paid || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </strong>
          </div>
          <div>
            <span>Due</span>
            <strong>
              ${Number(dailySales?.due || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </strong>
          </div>
          <div>
            <span>Invoices</span>
            <strong>{Number(dailySales?.invoiceCount || 0)}</strong>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {(dailySales?.invoices || []).slice(0, 10).map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.number}</td>
                  <td>{invoice.customer?.name || "Walk-in"}</td>
                  <td>${Number(invoice.total || 0).toFixed(2)}</td>
                  <td>${Number(invoice.paidAmount || 0).toFixed(2)}</td>
                  <td>${Number(invoice.dueAmount || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Top Selling Products (Month)">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Qty</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((item) => (
                <tr key={item.productId}>
                  <td>{item.name}</td>
                  <td>{item.sku || "-"}</td>
                  <td>{Number(item.quantity || 0).toFixed(2)}</td>
                  <td>${Number(item.revenue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

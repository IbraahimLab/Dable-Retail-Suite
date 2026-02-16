import { useMemo } from "react";
import { Panel } from "../components/Panel";

const metricLabels = [
  ["todaySalesCount", "Invoices Today"],
  ["todaySalesTotal", "Sales Today"],
  ["todayCollected", "Collected Today"],
  ["todayDue", "Due Today"],
  ["lowStockCount", "Low Stock Items"],
  ["customerOutstanding", "Customer Outstanding"],
];

function metricValue(key, value) {
  if (key.includes("Count")) {
    return Number(value || 0).toLocaleString();
  }
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function DashboardTab({ dashboard, dailySales }) {
  const cards = useMemo(
    () =>
      metricLabels.map(([key, label]) => ({
        key,
        label,
        value: metricValue(key, dashboard?.[key]),
      })),
    [dashboard],
  );

  return (
    <div className="tab-grid">
      <Panel title="Business Snapshot" subtitle="Today at a glance">
        <div className="stat-grid">
          {cards.map((item) => (
            <article key={item.key} className="stat-card">
              <h4>{item.label}</h4>
              <strong>{item.value}</strong>
            </article>
          ))}
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
      </Panel>
    </div>
  );
}

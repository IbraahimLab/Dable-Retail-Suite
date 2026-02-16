export function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

export function invoiceStatus(total, paid) {
  const due = Math.max(toNumber(total) - toNumber(paid), 0);
  if (due === 0 && toNumber(total) > 0) {
    return "PAID";
  }
  if (toNumber(paid) > 0 && due > 0) {
    return "PARTIAL";
  }
  return "UNPAID";
}

export function computeTotals({ subtotal, discount = 0, tax = 0, paidAmount = 0 }) {
  const safeSubtotal = toNumber(subtotal);
  const safeDiscount = toNumber(discount);
  const safeTax = toNumber(tax);
  const safePaid = toNumber(paidAmount);
  const total = Math.max(safeSubtotal - safeDiscount + safeTax, 0);
  const paid = Math.min(Math.max(safePaid, 0), total);
  const due = Math.max(total - paid, 0);
  return {
    total,
    paid,
    due,
    status: invoiceStatus(total, paid),
  };
}

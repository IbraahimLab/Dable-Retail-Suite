import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, invoiceStatus, toNumber } from "../src/lib/calculations.js";

test("toNumber returns fallback for invalid value", () => {
  assert.equal(toNumber("x", 7), 7);
  assert.equal(toNumber("12.5", 0), 12.5);
});

test("computeTotals calculates total, paid and due", () => {
  const result = computeTotals({
    subtotal: 100,
    discount: 10,
    tax: 5,
    paidAmount: 50,
  });
  assert.equal(result.total, 95);
  assert.equal(result.paid, 50);
  assert.equal(result.due, 45);
  assert.equal(result.status, "PARTIAL");
});

test("invoiceStatus returns PAID for zero due", () => {
  assert.equal(invoiceStatus(100, 100), "PAID");
});

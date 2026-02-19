import dayjs from "dayjs";
import { safeNumber } from "./common.js";

const DEFAULT_COMPANY_NAME = "My Company";
const MIN_YEAR = 1900;
const MAX_YEAR = 3000;

function cleanText(value, fallback = null) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const text = String(value).trim();
  return text ? text : fallback;
}

function monthInRange(value, fallback = 1) {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return fallback;
  }
  return month;
}

export function money(value) {
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

export function normalizeCurrency(value, fallback = "USD") {
  const candidate = String(value || fallback)
    .trim()
    .toUpperCase();
  if (!candidate) {
    return fallback;
  }
  return candidate.length > 8 ? candidate.slice(0, 8) : candidate;
}

export function normalizeCompanyPayload(input = {}, fallback = {}) {
  const name = cleanText(input.name, cleanText(fallback.name, DEFAULT_COMPANY_NAME));
  return {
    name,
    legalName: cleanText(input.legalName, cleanText(fallback.legalName)),
    registrationNumber: cleanText(
      input.registrationNumber,
      cleanText(fallback.registrationNumber),
    ),
    taxNumber: cleanText(input.taxNumber, cleanText(fallback.taxNumber)),
    phone: cleanText(input.phone, cleanText(fallback.phone)),
    email: cleanText(input.email, cleanText(fallback.email)),
    address: cleanText(input.address, cleanText(fallback.address)),
    currency: normalizeCurrency(input.currency, fallback.currency || "USD"),
    startDate: input.startDate
      ? dayjs(input.startDate).startOf("day").toDate()
      : fallback.startDate || null,
    fiscalYearStartMonth: monthInRange(
      input.fiscalYearStartMonth,
      monthInRange(fallback.fiscalYearStartMonth, 1),
    ),
    openingCapital: Math.max(0, money(input.openingCapital ?? fallback.openingCapital ?? 0)),
    ownerName: cleanText(input.ownerName, cleanText(fallback.ownerName)),
  };
}

export async function ensureCompany(tx, defaults = {}) {
  const current = await tx.company.findFirst({ orderBy: { id: "asc" } });
  if (current) {
    return current;
  }
  const payload = normalizeCompanyPayload(defaults);
  return tx.company.create({
    data: payload,
  });
}

export function resolveFiscalYearPeriod(company, requestedYear) {
  const startMonth = monthInRange(company?.fiscalYearStartMonth, 1);
  const today = dayjs();

  let fiscalYear = Number(requestedYear);
  if (!Number.isInteger(fiscalYear) || fiscalYear < MIN_YEAR || fiscalYear > MAX_YEAR) {
    const currentYearStart = dayjs(new Date(today.year(), startMonth - 1, 1)).startOf("day");
    fiscalYear = today.isBefore(currentYearStart) ? today.year() - 1 : today.year();
  }

  const periodStart = dayjs(new Date(fiscalYear, startMonth - 1, 1)).startOf("day");
  const periodEnd = periodStart.add(1, "year").subtract(1, "day").endOf("day");

  return {
    fiscalYear,
    startMonth,
    periodStart: periodStart.toDate(),
    periodEnd: periodEnd.toDate(),
    periodLabel: `${periodStart.format("YYYY-MM-DD")} to ${periodEnd.format("YYYY-MM-DD")}`,
  };
}

import dayjs from "dayjs";

export function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
}

export function docNumber(prefix) {
  const stamp = dayjs().format("YYYYMMDDHHmmss");
  const random = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${stamp}-${random}`;
}

export function parseDateRange({ from, to }) {
  const start = from
    ? dayjs(from).startOf("day").toDate()
    : dayjs().startOf("month").toDate();
  const end = to ? dayjs(to).endOf("day").toDate() : dayjs().endOf("day").toDate();
  return { start, end };
}

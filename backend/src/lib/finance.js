import { safeNumber } from "./common.js";

export const ACCOUNT_TYPES = ["CASH", "BANK", "CARD"];

const ACCOUNT_SETTING_PREFIX = "account.balance.";

function money(value) {
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function accountSettingKey(accountType) {
  return `${ACCOUNT_SETTING_PREFIX}${accountType}`;
}

export function normalizeAccountType(value, fallback = "CASH") {
  const candidate = String(value || fallback)
    .trim()
    .toUpperCase();
  return ACCOUNT_TYPES.includes(candidate) ? candidate : fallback;
}

export function accountTypeFromPaymentMethod(value) {
  const candidate = String(value || "")
    .trim()
    .toUpperCase();
  return ACCOUNT_TYPES.includes(candidate) ? candidate : null;
}

function assertBranchId(branchId) {
  const id = Number(branchId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Valid branchId is required.");
  }
  return id;
}

async function upsertBalanceSetting(tx, branchId, accountType, value) {
  await tx.setting.upsert({
    where: {
      branchId_key: {
        branchId,
        key: accountSettingKey(accountType),
      },
    },
    update: {
      value: money(value).toFixed(2),
    },
    create: {
      branchId,
      key: accountSettingKey(accountType),
      value: money(value).toFixed(2),
    },
  });
}

export async function getAccountBalances(tx, branchId) {
  const scopedBranchId = assertBranchId(branchId);
  const keys = ACCOUNT_TYPES.map(accountSettingKey);
  const rows = await tx.setting.findMany({
    where: {
      branchId: scopedBranchId,
      key: { in: keys },
    },
    orderBy: { key: "asc" },
  });

  const map = new Map(rows.map((row) => [row.key, row.value]));
  const balances = ACCOUNT_TYPES.reduce((acc, accountType) => {
    acc[accountType] = money(map.get(accountSettingKey(accountType)));
    return acc;
  }, {});

  return {
    branchId: scopedBranchId,
    balances,
    total: money(ACCOUNT_TYPES.reduce((sum, accountType) => sum + balances[accountType], 0)),
  };
}

export async function setAccountBalances(tx, { branchId, balances }) {
  const scopedBranchId = assertBranchId(branchId);
  const provided = balances || {};

  for (const accountType of ACCOUNT_TYPES) {
    if (!(accountType in provided)) {
      continue;
    }
    const amount = money(provided[accountType]);
    if (amount < 0) {
      throw new Error(`${accountType} balance cannot be negative.`);
    }
    await upsertBalanceSetting(tx, scopedBranchId, accountType, amount);
  }

  return getAccountBalances(tx, scopedBranchId);
}

export async function ensureAccountHasFunds(tx, { branchId, paymentMethod, amount, purpose }) {
  const spendAmount = money(amount);
  if (spendAmount <= 0) {
    return null;
  }
  const accountType = accountTypeFromPaymentMethod(paymentMethod);
  if (!accountType) {
    return null;
  }
  const balances = await getAccountBalances(tx, branchId);
  const available = money(balances.balances[accountType]);
  if (spendAmount > available) {
    throw new Error(
      `Insufficient ${accountType} balance for ${purpose || "this transaction"}. Available ${available.toFixed(2)}, required ${spendAmount.toFixed(2)}.`,
    );
  }
  return {
    accountType,
    available,
  };
}

export async function applyAccountMovement(
  tx,
  { branchId, paymentMethod, amount, direction = "OUT", purpose = "transaction" },
) {
  const movementAmount = money(amount);
  if (movementAmount <= 0) {
    return null;
  }
  const accountType = accountTypeFromPaymentMethod(paymentMethod);
  if (!accountType) {
    return null;
  }

  const normalizedDirection = String(direction || "OUT")
    .trim()
    .toUpperCase();
  if (!["IN", "OUT"].includes(normalizedDirection)) {
    throw new Error("Account movement direction must be IN or OUT.");
  }

  const balances = await getAccountBalances(tx, branchId);
  const current = money(balances.balances[accountType]);
  const next =
    normalizedDirection === "OUT"
      ? money(current - movementAmount)
      : money(current + movementAmount);

  if (next < 0) {
    throw new Error(
      `Insufficient ${accountType} balance for ${purpose}. Available ${current.toFixed(2)}, required ${movementAmount.toFixed(2)}.`,
    );
  }

  await upsertBalanceSetting(tx, Number(branchId), accountType, next);

  return {
    branchId: Number(branchId),
    accountType,
    before: current,
    after: next,
    amount: movementAmount,
    direction: normalizedDirection,
  };
}

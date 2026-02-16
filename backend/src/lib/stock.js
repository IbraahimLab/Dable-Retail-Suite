function parseQty(value) {
  const qty = Number(value);
  if (Number.isNaN(qty)) {
    return 0;
  }
  return qty;
}

export async function getProductStock(tx, productId, branchId) {
  const aggregate = await tx.stockBatch.aggregate({
    where: {
      productId: Number(productId),
      branchId: Number(branchId),
    },
    _sum: {
      quantityRemaining: true,
    },
  });
  return parseQty(aggregate._sum.quantityRemaining);
}

export async function addStockBatch(
  tx,
  {
    productId,
    branchId,
    quantity,
    unitCost,
    sellPrice,
    batchNumber = null,
    expiryDate = null,
    purchaseItemId = null,
  },
) {
  return tx.stockBatch.create({
    data: {
      productId: Number(productId),
      branchId: Number(branchId),
      quantityRemaining: parseQty(quantity),
      unitCost: Number(unitCost || 0),
      sellPrice: Number(sellPrice || 0),
      batchNumber,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      purchaseItemId,
    },
  });
}

export async function consumeStockFIFO(tx, { productId, branchId, quantity }) {
  const needed = parseQty(quantity);
  if (needed <= 0) {
    return { costOfGoods: 0 };
  }

  const batches = await tx.stockBatch.findMany({
    where: {
      productId: Number(productId),
      branchId: Number(branchId),
      quantityRemaining: { gt: 0 },
    },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
  });

  let remaining = needed;
  let costOfGoods = 0;

  for (const batch of batches) {
    if (remaining <= 0) {
      break;
    }
    const useQty = Math.min(remaining, parseQty(batch.quantityRemaining));
    remaining -= useQty;
    costOfGoods += useQty * Number(batch.unitCost || 0);

    await tx.stockBatch.update({
      where: { id: batch.id },
      data: {
        quantityRemaining: Number(batch.quantityRemaining) - useQty,
      },
    });
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient stock for product ${productId}. Missing ${remaining.toFixed(2)} units.`,
    );
  }

  return { costOfGoods };
}

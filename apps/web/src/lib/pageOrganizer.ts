/** A reviewable, one-based page plan; no PDF bytes are changed until Apply. */
export type PagePlan = {
  order: number[];
  removed: number[];
  rotations: Record<number, number>;
};

export function moveSelectedPages(order: number[], selected: number[], before: number | null): number[] {
  const moving = new Set(selected);
  if (before !== null && moving.has(before)) return order;
  const keep = order.filter(page => !moving.has(page));
  const moved = order.filter(page => moving.has(page));
  const index = before === null ? keep.length : keep.indexOf(before);
  if (index === -1 || !moved.length) return order;
  return [...keep.slice(0, index), ...moved, ...keep.slice(index)];
}

export function validatePagePlan(plan: PagePlan, total: number) {
  const all = new Set(plan.order);
  const removed = new Set(plan.removed);
  if (!Number.isSafeInteger(total) || total < 1 || all.size !== total ||
      plan.order.length !== total || plan.order.some(page => !Number.isInteger(page) || page < 1 || page > total)) {
    throw new Error("The page plan must contain each original page exactly once.");
  }
  if (plan.removed.some(page => !all.has(page)) || removed.size !== plan.removed.length || removed.size === total) {
    throw new Error("At least one valid page must remain.");
  }
  if (Object.entries(plan.rotations).some(([key, value]) =>
    !all.has(Number(key)) || !Number.isInteger(value) || value % 90 !== 0)) {
    throw new Error("Invalid page rotation.");
  }
  return plan.order.filter(page => !removed.has(page));
}

export type PageOperationBridge = {
  reorderPages?: (bytes: Uint8Array, order: number[]) => Promise<Uint8Array>;
  deletePages: (bytes: Uint8Array, pages: number[]) => Promise<Uint8Array>;
  rotatePages: (bytes: Uint8Array, pages: number[], degrees: number) => Promise<Uint8Array>;
};

export async function applyPagePlan(bytes: Uint8Array, bridge: PageOperationBridge, plan: PagePlan) {
  const remaining = validatePagePlan(plan, plan.order.length);
  let output = bytes;
  const identity = plan.order.every((page, index) => page === index + 1);
  if (!identity) {
    if (!bridge.reorderPages) throw new Error("Page reordering is unavailable in this runtime.");
    output = await bridge.reorderPages(output, plan.order);
  }
  const deletedPositions = plan.order.flatMap((page, index) =>
    plan.removed.includes(page) ? [index + 1] : []);
  if (deletedPositions.length) output = await bridge.deletePages(output, deletedPositions);
  for (const degrees of [-90, 90, 180] as const) {
    const positions = remaining.flatMap((page, index) =>
      (((plan.rotations[page] || 0) % 360 + 360) % 360 === (degrees + 360) % 360)
        ? [index + 1] : []);
    if (positions.length) output = await bridge.rotatePages(output, positions, degrees);
  }
  return { bytes: output, pageCount: remaining.length };
}

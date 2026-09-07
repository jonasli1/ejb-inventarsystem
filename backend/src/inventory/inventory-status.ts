import { InventoryStatus } from '@prisma/client';
import { AppBadRequestException } from '../common/exceptions/app.exception';
import { INVENTORY_STATUS_LABEL } from '../common/constants/labels';

// `borrowed` is only ever set by the loan workflow (checkout/return), never
// through a direct create/update call - otherwise an item could be marked
// "borrowed" without an actual loan record behind it.
export const MANUALLY_ASSIGNABLE_INVENTORY_STATUSES = Object.values(
  InventoryStatus,
).filter((status) => status !== InventoryStatus.borrowed);

/**
 * Allowed manual status transitions. There was previously no adjacency
 * check at all (any manually-assignable status could jump to any other),
 * which allowed nonsensical hops like retired -> available. This map makes
 * the state machine explicit and consistent:
 *  - available/maintenance/defect freely cycle among each other and can move
 *    to installed or retired.
 *  - installed can move back to any working state or be retired.
 *  - retired is terminal (an ausgemustertes Objekt is not manually
 *    reactivated) - it also frees up its inventory number for reuse.
 *  - borrowed is reachable only via the loan workflow (issue), and leaves
 *    only via the loan workflow (return), which is why it isn't a key here;
 *    ALLOWED_STATUS_TRANSITIONS_FROM_BORROWED covers the return step.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<
  InventoryStatus,
  InventoryStatus[]
> = {
  available: [
    InventoryStatus.maintenance,
    InventoryStatus.defect,
    InventoryStatus.installed,
    InventoryStatus.retired,
  ],
  maintenance: [
    InventoryStatus.available,
    InventoryStatus.defect,
    InventoryStatus.retired,
  ],
  defect: [
    InventoryStatus.available,
    InventoryStatus.maintenance,
    InventoryStatus.retired,
  ],
  installed: [
    InventoryStatus.available,
    InventoryStatus.maintenance,
    InventoryStatus.defect,
    InventoryStatus.retired,
  ],
  retired: [],
  // Not reachable through the manual-update path at all: an item currently
  // out on loan can only change status via the loan return workflow
  // (LoansService#returnLoan, constrained separately by ReturnLoanItemDto's
  // own newStatus allowlist), never through a direct PUT /inventory/:id -
  // otherwise the InventoryItem and its still-open LoanItem/Loan records
  // would desync (item "available" again while the loan stays "issued"
  // forever, with no way to complete it).
  borrowed: [],
};

/** Throws a German 400 if `from -> to` is not an allowed transition. Same status is always a no-op allowed "transition". */
export function assertValidStatusTransition(
  from: InventoryStatus,
  to: InventoryStatus,
): void {
  if (from === to) return;
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppBadRequestException(
      `Der Statuswechsel von "${INVENTORY_STATUS_LABEL[from] ?? from}" zu "${INVENTORY_STATUS_LABEL[to] ?? to}" ist nicht zulässig.`,
      'INVALID_STATUS_TRANSITION',
    );
  }
}

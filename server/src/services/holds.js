import { run } from '../database.js';
import { logger } from '../logger.js';

export function clearExpiredHolds() {
  const now = new Date().toISOString();
  return run(
    `UPDATE seats SET status = 'vacant', held_by = NULL, held_until = NULL
     WHERE status = 'held' AND held_until < ?`,
    [now]
  );
}

export function releaseExpiredHolds(io) {
  const result = clearExpiredHolds();

  if (result.changes > 0) {
    logger.info('Released expired seat holds', { seats_released: result.changes });
    io.emit('seats:refresh');
  }
}

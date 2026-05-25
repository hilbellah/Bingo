import assert from 'node:assert/strict';
import {
  holdExpiresAt,
  resolveHoldConfig,
} from '../server/src/services/holds.js';

function config(env) {
  return resolveHoldConfig(env);
}

assert.equal(config({}).holdMinutes, 20);
assert.equal(config({ SESSION_HOLD_MINUTES: '60' }).holdMinutes, 20);
assert.equal(config({ SESSION_HOLD_MINUTES: '10' }).holdMinutes, 10);
assert.equal(config({ SESSION_HOLD_MINUTES: 'abc' }).holdMinutes, 20);
assert.equal(config({ SESSION_HOLD_MINUTES: '-5' }).holdMinutes, 20);

assert.equal(config({}).paymentFailureHoldMinutes, 5);
assert.equal(config({ PAYMENT_FAILURE_HOLD_MINUTES: '60' }).paymentFailureHoldMinutes, 5);
assert.equal(config({ PAYMENT_FAILURE_HOLD_MINUTES: '3' }).paymentFailureHoldMinutes, 3);
assert.equal(config({ PAYMENT_FAILURE_HOLD_MINUTES: 'abc' }).paymentFailureHoldMinutes, 5);
assert.equal(config({ PAYMENT_FAILURE_HOLD_MINUTES: '-5' }).paymentFailureHoldMinutes, 5);

assert.equal(holdExpiresAt(5, Date.parse('2026-05-25T00:00:00.000Z')), '2026-05-25T00:05:00.000Z');

console.log('Hold config check passed.');

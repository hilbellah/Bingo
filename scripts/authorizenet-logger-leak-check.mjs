// The Authorize.Net SDK must not leak a winston logger per gateway call.
//
// authorizenet 1.0.10 creates a brand-new winston logger (random category
// name) inside every contract constructor and controller, and winston's
// container keeps each one forever. Left alone that retained ~136 KB per
// reconciler cycle and crashed the 512 MB Render instance every ~2.5 days
// (2026-09-07 18:32 UTC). server/src/services/payments.js neutralises the
// SDK's logger factory at import time; this check fails the build if that
// guard ever stops working, for example after an SDK or winston upgrade.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverDir = path.join(repoRoot, 'server');

// Resolve from server/ so we observe the exact winston instance the SDK uses.
const serverRequire = createRequire(pathToFileURL(path.join(serverDir, 'package.json')));
const winston = serverRequire('winston');
const { APIContracts, APIControllers, Constants } = serverRequire('authorizenet');

// Mirrors what listUnsettledTransactions() builds for one reconciler cycle,
// minus the network call: request contracts, controller, response contract.
function simulateGatewayCall() {
  const auth = new APIContracts.MerchantAuthenticationType();
  auth.setName('leak-check');
  auth.setTransactionKey('leak-check');
  const paging = new APIContracts.Paging();
  paging.setLimit(1000);
  paging.setOffset(1);
  const sorting = new APIContracts.TransactionListSorting();
  sorting.setOrderBy(APIContracts.TransactionListOrderFieldEnum.SUBMITTIMEUTC);
  sorting.setOrderDescending(true);
  const request = new APIContracts.GetUnsettledTransactionListRequest();
  request.setMerchantAuthentication(auth);
  request.setPaging(paging);
  request.setSorting(sorting);
  const ctrl = new APIControllers.GetUnsettledTransactionListController(request.getJSON());
  ctrl.setEnvironment(Constants.endpoint.sandbox);
  new APIContracts.GetUnsettledTransactionListResponse({ messages: { resultCode: 'Ok' } });
}

const loggerCount = () => winston.loggers.loggers.size;

// 1. Show the detector works: before the guard is installed, the raw SDK
//    should register loggers. Informational only, so a future SDK release that
//    fixes the bug upstream does not turn this into a false failure.
const rawBefore = loggerCount();
simulateGatewayCall();
const rawLeaked = loggerCount() - rawBefore;
if (rawLeaked > 0) {
  console.log(`Raw SDK registered ${rawLeaked} winston loggers for one gateway call (leak present upstream, guard required).`);
} else {
  console.log('Raw SDK registered no winston loggers; the upstream leak may be fixed and the guard in payments.js could be retired.');
}

// 2. Importing the payments service installs the guard.
await import(pathToFileURL(path.join(serverDir, 'src', 'services', 'payments.js')));

// 3. Under the guard, many simulated calls must register nothing new.
const CALLS = 500;
const guardedBefore = loggerCount();
for (let i = 0; i < CALLS; i += 1) simulateGatewayCall();
const guardedLeaked = loggerCount() - guardedBefore;
assert.equal(
  guardedLeaked,
  0,
  `Authorize.Net SDK leaked ${guardedLeaked} winston loggers over ${CALLS} simulated gateway calls; the logger guard in server/src/services/payments.js is not taking effect`
);

// 4. And the SDK must still be able to log without throwing (the guard hands
//    it a no-op logger, not nothing).
const sdkLogger = serverRequire('authorizenet/lib/logger.js');
const logger = sdkLogger.getLogger('LeakCheck');
assert.doesNotThrow(() => { logger.debug('x'); logger.info('x'); logger.warn('x'); logger.error('x'); });
assert.equal(sdkLogger.getLogger('A'), sdkLogger.getLogger('B'), 'guard should hand out one shared logger');

console.log(`Authorize.Net logger leak check passed (${CALLS} guarded calls, 0 loggers retained).`);

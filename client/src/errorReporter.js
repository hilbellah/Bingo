// Reports unexpected browser errors (customer and admin pages) to our own
// server, POST /api/client-errors. It only listens - the page behaves exactly
// as it would without it - and it never sends query strings (ticket links carry
// access tokens), at most MAX_REPORTS per page load, each distinct error once.
const ENDPOINT = '/api/client-errors';
const MAX_REPORTS = 5;
const MAX_FIELD = 4000;

// Noise from browser extensions and harmless browser warnings.
const IGNORE = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
];

export function createErrorReporter({ send, location = window.location } = {}) {
  const seen = new Set();
  let sent = 0;

  const report = ({ message, stack }) => {
    const text = String(message || '').trim();
    const trace = String(stack || '');
    if (!text) return false;
    if (IGNORE.some(pattern => pattern.test(text) || pattern.test(trace))) return false;
    const key = `${text}|${trace.split('\n')[1] || ''}`;
    if (seen.has(key) || sent >= MAX_REPORTS) return false;
    seen.add(key);
    sent += 1;
    try {
      send({
        message: text.slice(0, MAX_FIELD),
        stack: trace.slice(0, MAX_FIELD),
        page: location.pathname,
      });
    } catch {
      // Reporting must never throw into the page.
    }
    return true;
  };

  const onError = event => {
    const err = event?.error;
    report({ message: err?.message || event?.message, stack: err?.stack || (event?.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : '') });
  };
  const onRejection = event => {
    const reason = event?.reason;
    report({
      message: reason instanceof Error ? reason.message : (typeof reason === 'string' ? reason : 'Unhandled promise rejection'),
      stack: reason instanceof Error ? reason.stack : '',
    });
  };

  return { report, onError, onRejection };
}

function beacon(payload) {
  const body = JSON.stringify(payload);
  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

export function installErrorReporter() {
  if (typeof window === 'undefined' || window.__wolaErrorReporter) return;
  const reporter = createErrorReporter({ send: beacon });
  window.addEventListener('error', reporter.onError);
  window.addEventListener('unhandledrejection', reporter.onRejection);
  window.__wolaErrorReporter = reporter;
}

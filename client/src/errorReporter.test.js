import { describe, it, expect, vi } from 'vitest';
import { createErrorReporter } from './errorReporter';

const setup = (pathname = '/tickets/BNG-1') => {
  const send = vi.fn();
  const reporter = createErrorReporter({ send, location: { pathname, search: '?ticketAccessToken=SECRET' } });
  return { send, reporter };
};

describe('browser error reporter', () => {
  it('sends the message, stack and page path - never the query string', () => {
    const { send, reporter } = setup();
    reporter.onError({ error: new Error('Cannot read properties of undefined') });
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.message).toBe('Cannot read properties of undefined');
    expect(payload.page).toBe('/tickets/BNG-1');
    expect(JSON.stringify(payload)).not.toContain('SECRET');
    expect(payload.stack).toContain('Error');
  });

  it('reports each distinct error once per page load', () => {
    const { send, reporter } = setup();
    const err = new Error('Same failure');
    reporter.onError({ error: err });
    reporter.onError({ error: err });
    reporter.onError({ error: err });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('caps reports at 5 per page load', () => {
    const { send, reporter } = setup();
    for (let i = 0; i < 12; i += 1) reporter.onError({ error: new Error(`Failure ${i}`) });
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('reports unhandled promise rejections', () => {
    const { send, reporter } = setup('/admin/dashboard');
    reporter.onRejection({ reason: new Error('Request failed') });
    reporter.onRejection({ reason: 'plain string reason' });
    expect(send.mock.calls.map(call => call[0].message)).toEqual(['Request failed', 'plain string reason']);
    expect(send.mock.calls[0][0].page).toBe('/admin/dashboard');
  });

  it('ignores browser-extension noise and empty events', () => {
    const { send, reporter } = setup();
    reporter.onError({ message: 'Script error.' });
    reporter.onError({ message: 'ResizeObserver loop completed with undelivered notifications.' });
    const ext = new Error('boom');
    ext.stack = 'Error: boom\n    at x (chrome-extension://abc/content.js:1:1)';
    reporter.onError({ error: ext });
    reporter.onError({});
    expect(send).not.toHaveBeenCalled();
  });

  it('never throws into the page if sending fails', () => {
    const reporter = createErrorReporter({ send: () => { throw new Error('network'); }, location: { pathname: '/' } });
    expect(() => reporter.onError({ error: new Error('x') })).not.toThrow();
  });
});

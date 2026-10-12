import React, { useCallback, useEffect, useState } from 'react';
import { fetchAdminErrors, resolveAdminError } from '../api';

const WHERE = error => (error.source === 'server' ? 'Server' : String(error.page || '').startsWith('/admin') ? 'Admin screen' : 'Customer page');

// "System errors" on the Archive & Audit tab: unexpected errors recorded by
// the in-house monitor (server/src/services/errorMonitor.js). Repeats are
// grouped with a count; resolving hides an entry until it happens again.
export default function SystemErrorsPanel({ token, canResolve }) {
  const [errors, setErrors] = useState([]);
  const [showResolved, setShowResolved] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAdminErrors(token, { includeResolved: showResolved })
      .then(data => {
        if (cancelled) return;
        setErrors(data);
        setLoadError('');
      })
      .catch(err => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => { cancelled = true; };
  }, [token, showResolved, reloadKey]);

  const resolve = useCallback(async id => {
    const result = await resolveAdminError(token, id);
    if (!result.ok) setLoadError(result.error || 'Could not mark as resolved.');
    setReloadKey(key => key + 1);
  }, [token]);

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-semibold text-brand-blue">System Errors</h3>
        <label className="text-xs text-gray-500 flex items-center gap-2">
          <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Unexpected errors from the booking pages, admin screens and server. Repeats are grouped; super users get one email digest when something new appears.
      </p>
      {loadError && <p className="text-sm text-red-600 mb-2">{loadError}</p>}
      {errors.length === 0 ? (
        <p className="text-gray-400 text-sm">{showResolved ? 'No errors recorded.' : 'No open errors.'}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase">
              <th className="pb-2">Last seen</th>
              <th className="pb-2">Where</th>
              <th className="pb-2">Error</th>
              <th className="pb-2 text-center">Times</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {errors.map(error => (
              <React.Fragment key={error.id}>
                <tr className="border-t align-top">
                  <td className="py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(error.lastSeenAt).toLocaleString()}</td>
                  <td className="py-2 text-xs">
                    <div className="font-medium text-gray-700">{WHERE(error)}</div>
                    {error.page && <div className="text-gray-400">{error.page}</div>}
                  </td>
                  <td className="py-2 text-gray-800 break-words">
                    {error.message}
                    {error.stack && (
                      <button type="button" className="ml-2 text-xs text-brand-blue underline" onClick={() => setExpanded(expanded === error.id ? null : error.id)}>
                        {expanded === error.id ? 'Hide details' : 'Details'}
                      </button>
                    )}
                  </td>
                  <td className="py-2 text-center">{error.occurrences}</td>
                  <td className="py-2">
                    {error.resolvedAt ? (
                      <span className="text-xs text-gray-400">Resolved</span>
                    ) : canResolve ? (
                      <button type="button" onClick={() => resolve(error.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700">
                        Resolve
                      </button>
                    ) : null}
                  </td>
                </tr>
                {expanded === error.id && (
                  <tr>
                    <td colSpan={5} className="pb-3">
                      <pre className="text-xs bg-gray-50 rounded p-3 overflow-x-auto whitespace-pre-wrap text-gray-600">{error.stack}</pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

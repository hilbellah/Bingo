import React, { useMemo, useState } from 'react';
import { fetchAdminSeats, fetchSessionPackages } from '../api';
import { useAdminDashboard } from './AdminDashboardContext';
import { DEPARTMENT_OPTIONS, formatPrintTime, writeSpecialPaperPrintDocument, buildSpecialPaperPrintBody } from './bulkPrintDocuments';

// Walk-in tickets on the Bulk Print tab: blank fill-in tickets for a session's
// unsold seats. Print-only, no bookings are created. Moved verbatim from
// BulkPrintTab.
export default function WalkInTicketsPanel() {
  const { sessions, token } = useAdminDashboard();
  const [walkInSessionId, setWalkInSessionId] = useState('');
  const [walkInSeats, setWalkInSeats] = useState([]);
  const [walkInPackage, setWalkInPackage] = useState(null);
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkInSelectedTables, setWalkInSelectedTables] = useState(new Set());

  const walkInSessions = useMemo(() => (
    [...(sessions || [])].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  ), [sessions]);
  const walkInSession = useMemo(
    () => (sessions || []).find(session => String(session.id) === String(walkInSessionId)),
    [sessions, walkInSessionId]
  );
  const walkInAvailableSeats = useMemo(
    () => walkInSeats.filter(seat => seat.status === 'vacant' && !seat.is_disabled),
    [walkInSeats]
  );
  const walkInTables = useMemo(() => {
    const map = new Map();
    for (const seat of walkInAvailableSeats) {
      map.set(seat.table_number, (map.get(seat.table_number) || 0) + 1);
    }
    return [...map.entries()]
      .map(([tableNumber, count]) => ({ tableNumber, count }))
      .sort((a, b) => Number(a.tableNumber) - Number(b.tableNumber));
  }, [walkInAvailableSeats]);
  const walkInSeatsToPrint = useMemo(() => (
    walkInAvailableSeats
      .filter(seat => walkInSelectedTables.has(seat.table_number))
      .sort((a, b) => (Number(a.table_number) - Number(b.table_number)) || (Number(a.chair_number) - Number(b.chair_number)))
  ), [walkInAvailableSeats, walkInSelectedTables]);

  const getWalkInSessionTypeLabel = (session) => {
    const sessionType = session.session_type || (session.is_special_event ? 'special_bingo' : 'regular_bingo');
    const option = DEPARTMENT_OPTIONS.find(item => item.value === sessionType);
    return option ? option.label : 'Regular Bingo';
  };

  const handleSelectWalkInSession = async (sessionId) => {
    setWalkInSessionId(sessionId);
    setWalkInSeats([]);
    setWalkInPackage(null);
    setWalkInSelectedTables(new Set());
    if (!sessionId) return;
    setWalkInLoading(true);
    try {
      const [seats, packages] = await Promise.all([
        fetchAdminSeats(token, sessionId),
        fetchSessionPackages(sessionId),
      ]);
      const seatList = Array.isArray(seats) ? seats : [];
      const packageList = Array.isArray(packages) ? packages : [];
      const entryPackage = packageList.find(pkg => pkg.type === 'required') || packageList[0] || null;
      setWalkInSeats(seatList);
      setWalkInPackage(entryPackage);
      setWalkInSelectedTables(new Set(
        seatList.filter(seat => seat.status === 'vacant' && !seat.is_disabled).map(seat => seat.table_number)
      ));
    } catch {
      setWalkInSeats([]);
      setWalkInPackage(null);
    } finally {
      setWalkInLoading(false);
    }
  };

  const toggleWalkInTable = (tableNumber) => {
    setWalkInSelectedTables(prev => {
      const next = new Set(prev);
      if (next.has(tableNumber)) next.delete(tableNumber);
      else next.add(tableNumber);
      return next;
    });
  };

  const handlePrintWalkInTickets = () => {
    if (!walkInSession || walkInSeatsToPrint.length === 0) return;
    const sessionType = walkInSession.session_type || (walkInSession.is_special_event ? 'special_bingo' : 'regular_bingo');
    const printSession = {
      sessionId: walkInSession.id,
      sessionType,
      eventTitle: walkInSession.event_title,
      sessionDate: walkInSession.date,
      sessionTime: walkInSession.time,
    };
    const walkInTickets = walkInSeatsToPrint.map(seat => ({
      sessionId: walkInSession.id,
      isWalkIn: true,
      firstName: '',
      lastName: '',
      tableNumber: seat.table_number,
      chairNumber: seat.chair_number,
      packageName: walkInPackage?.name || 'Entry Package',
      packagePrice: Number(walkInPackage?.price || 0),
      referenceNumber: '',
    }));
    const body = buildSpecialPaperPrintBody([printSession], walkInTickets, { nameCopy: true, seatCopy: true });
    if (!body) return;
    writeSpecialPaperPrintDocument(body);
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm mb-4 no-print">
      <h3 className="font-semibold text-brand-blue mb-1">Walk-in Tickets (blank)</h3>
      <p className="text-sm text-gray-500 mb-3">
        Print fill-in tickets for a session&apos;s remaining unsold seats. The name line prints blank for staff to write in;
        the ticket uses that session&apos;s required entry package, with the real table and seat number. Print-only: no bookings are created and these
        never count toward seat sale totals.
      </p>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Session</label>
          <select
            value={walkInSessionId}
            onChange={e => handleSelectWalkInSession(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm min-w-[280px]"
          >
            <option value="">Select a session...</option>
            {walkInSessions.map(session => (
              <option key={session.id} value={session.id}>
                {session.date} {formatPrintTime(session.time)} — {session.event_title || getWalkInSessionTypeLabel(session)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handlePrintWalkInTickets}
          disabled={walkInLoading || walkInSeatsToPrint.length === 0}
          className="bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-blue/90 disabled:opacity-40"
        >
          {walkInLoading ? 'Loading seats...' : `Print Walk-in Tickets (${walkInSeatsToPrint.length})`}
        </button>
      </div>
      {walkInSessionId && !walkInLoading && walkInPackage && (
        <p className="text-xs text-gray-600 mt-3">
          Walk-in ticket package: <span className="font-semibold text-brand-blue">
            ${(Number(walkInPackage.price || 0) / 100).toFixed(2)} {walkInPackage.name}
          </span>
        </p>
      )}
      {walkInSessionId && !walkInLoading && walkInAvailableSeats.length === 0 && (
        <p className="text-sm text-gray-400 mt-3">No unsold seats left for this session.</p>
      )}
      {walkInSessionId && !walkInLoading && walkInAvailableSeats.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <p className="text-xs text-gray-500">
              {walkInAvailableSeats.length} unsold seat(s) across {walkInTables.length} table(s). Untick tables you do not want to print.
            </p>
            <button
              onClick={() => setWalkInSelectedTables(new Set(walkInTables.map(table => table.tableNumber)))}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Select all
            </button>
            <button
              onClick={() => setWalkInSelectedTables(new Set())}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {walkInTables.map(table => (
              <label key={table.tableNumber} className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-sm bg-white">
                <input
                  type="checkbox"
                  checked={walkInSelectedTables.has(table.tableNumber)}
                  onChange={() => toggleWalkInTable(table.tableNumber)}
                />
                Table {table.tableNumber} ({table.count})
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

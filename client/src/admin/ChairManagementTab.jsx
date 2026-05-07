import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import { fetchSeats, toggleAdminSeat } from '../api';

export default function ChairManagementTab() {
  const {
    tab,
    sessions,
    chairMgmtSession,
    setChairMgmtSession,
    setChairMgmtLoading,
    setChairMgmtSeats,
    chairMgmtLoading,
    chairMgmtSeats,
    chairMgmtFilter,
    setChairMgmtFilter,
    token,
  } = useAdminDashboard();

  return (
    <>
        {/* CHAIR MANAGEMENT TAB */}
        {tab === 'chairs' && (
          <div className="max-w-6xl">
            <h3 className="text-xl font-bold text-brand-blue mb-6">Chair Management</h3>
            <p className="text-sm text-gray-500 mb-4">Disable broken or unavailable chairs so customers cannot book them.</p>

            {/* Session Selector */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Select Session</label>
              <select
                value={chairMgmtSession}
                onChange={async (e) => {
                  const sid = e.target.value;
                  setChairMgmtSession(sid);
                  if (sid) {
                    setChairMgmtLoading(true);
                    const seats = await fetchSeats(sid);
                    setChairMgmtSeats(seats);
                    setChairMgmtLoading(false);
                  } else {
                    setChairMgmtSeats([]);
                  }
                }}
                className="w-full sm:w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">-- Choose a session --</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.date} @ {s.time}{s.is_special_event ? ` — ${s.event_title}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {chairMgmtLoading && (
              <div className="text-center py-8 text-gray-400">Loading chairs...</div>
            )}

            {chairMgmtSession && !chairMgmtLoading && chairMgmtSeats.length > 0 && (() => {
              const disabledCount = chairMgmtSeats.filter(s => s.is_disabled).length;
              const availableCount = chairMgmtSeats.filter(s => s.status === 'vacant' && !s.is_disabled).length;
              const soldCount = chairMgmtSeats.filter(s => s.status === 'sold').length;
              const heldCount = chairMgmtSeats.filter(s => s.status === 'held').length;

              // Group seats by table
              const tables = {};
              chairMgmtSeats.forEach(s => {
                if (!tables[s.table_number]) tables[s.table_number] = [];
                tables[s.table_number].push(s);
              });
              const tableNumbers = Object.keys(tables).map(Number).sort((a, b) => a - b);

              // Filter tables
              const filteredTables = tableNumbers.filter(tn => {
                if (chairMgmtFilter === 'all') return true;
                return tables[tn].some(s => {
                  if (chairMgmtFilter === 'disabled') return s.is_disabled;
                  if (chairMgmtFilter === 'available') return s.status === 'vacant' && !s.is_disabled;
                  if (chairMgmtFilter === 'sold') return s.status === 'sold' || s.status === 'held';
                  return true;
                });
              });

              return (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div className="rounded-xl p-4 shadow-sm bg-green-600 text-white">
                      <p className="text-sm opacity-80">Available</p>
                      <p className="text-3xl font-bold">{availableCount}</p>
                    </div>
                    <div className="rounded-xl p-4 shadow-sm bg-gray-600 text-white">
                      <p className="text-sm opacity-80">Sold</p>
                      <p className="text-3xl font-bold">{soldCount}</p>
                    </div>
                    <div className="rounded-xl p-4 shadow-sm bg-amber-500 text-white">
                      <p className="text-sm opacity-80">Held</p>
                      <p className="text-3xl font-bold">{heldCount}</p>
                    </div>
                    <div className="rounded-xl p-4 shadow-sm bg-red-600 text-white">
                      <p className="text-sm opacity-80">Disabled</p>
                      <p className="text-3xl font-bold">{disabledCount}</p>
                    </div>
                  </div>

                  {/* Filter */}
                  <div className="flex gap-2 mb-4 flex-wrap">
                    {[
                      { key: 'all', label: 'All Tables' },
                      { key: 'disabled', label: 'With Disabled' },
                      { key: 'available', label: 'With Available' },
                      { key: 'sold', label: 'With Sold/Held' },
                    ].map(f => (
                      <button key={f.key} onClick={() => setChairMgmtFilter(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                          chairMgmtFilter === f.key
                            ? 'bg-brand-blue text-white'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}>{f.label}</button>
                    ))}
                  </div>

                  {/* Tables Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredTables.map(tn => {
                      const chairs = tables[tn].sort((a, b) => a.chair_number - b.chair_number);
                      const tableDisabled = chairs.filter(c => c.is_disabled).length;
                      return (
                        <div key={tn} className={`bg-white rounded-xl shadow-sm p-3 border-2 ${tableDisabled > 0 ? 'border-red-300' : 'border-transparent'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-brand-blue">Table {tn}</span>
                            {tableDisabled > 0 && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{tableDisabled} disabled</span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {chairs.map(chair => {
                              const isSold = chair.status === 'sold';
                              const isHeld = chair.status === 'held';
                              const isDisabled = chair.is_disabled;

                              let bgColor = 'bg-green-100 hover:bg-green-200 text-green-800'; // available
                              let statusText = 'Available';
                              if (isDisabled) { bgColor = 'bg-red-100 text-red-700 ring-2 ring-red-400'; statusText = 'Disabled'; }
                              else if (isSold) { bgColor = 'bg-gray-200 text-gray-500'; statusText = chair.booked_name || 'Sold'; }
                              else if (isHeld) { bgColor = 'bg-amber-100 text-amber-700'; statusText = 'Held'; }

                              return (
                                <button
                                  key={chair.id}
                                  onClick={async () => {
                                    if (isSold) return; // Can't disable sold chairs
                                    const newDisabled = !isDisabled;
                                    await toggleAdminSeat(token, chair.id, newDisabled);
                                    setChairMgmtSeats(prev => prev.map(s =>
                                      s.id === chair.id ? { ...s, is_disabled: newDisabled ? 1 : 0 } : s
                                    ));
                                  }}
                                  disabled={isSold}
                                  title={isSold ? `Sold to ${chair.booked_name || 'customer'} — cannot disable` : `Chair ${chair.chair_number}: ${statusText} — click to ${isDisabled ? 'enable' : 'disable'}`}
                                  className={`rounded-lg p-2 text-center transition cursor-pointer ${bgColor} ${isSold ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                  <div className="text-xs font-bold">C{chair.chair_number}</div>
                                  <div className="text-[10px] leading-tight truncate">{statusText}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredTables.length === 0 && (
                    <div className="text-center py-8 text-gray-400">No tables match the selected filter.</div>
                  )}
                </>
              );
            })()}

            {chairMgmtSession && !chairMgmtLoading && chairMgmtSeats.length === 0 && (
              <div className="text-center py-8 text-gray-400">No chairs found for this session.</div>
            )}
          </div>
        )}

    </>
  );
}



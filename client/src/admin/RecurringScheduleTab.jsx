import React, { useEffect, useState, useCallback } from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import {
  fetchRecurringSchedules,
  createRecurringSchedule,
  updateRecurringSchedule,
  deleteRecurringSchedule,
  fetchRecurringScheduleSummary,
  updateAutoGenerateConfig,
  triggerScheduleGenerate,
} from '../api';
import { confirmAdminAction } from './adminConfirm';

// JS Date.getDay() convention: Sunday = 0
const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SESSION_TYPES = [
  { value: 'regular_bingo', label: 'Regular Bingo' },
  { value: 'special_bingo', label: 'Special Bingo' },
];

function formatTimestamp(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function RecurringScheduleTab() {
  const { tab, token } = useAdminDashboard();
  const [schedules, setSchedules] = useState([]);
  const [config, setConfig] = useState({ lookAheadDays: 30, enabled: true, lastRunAt: null });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [lookAheadInput, setLookAheadInput] = useState(30);
  const [statusMessage, setStatusMessage] = useState(null); // { kind: 'ok'|'err', text }
  const [newSchedule, setNewSchedule] = useState({
    day_of_week: 1,
    time: '18:30',
    cutoff_time: '12:00',
    session_type: 'regular_bingo',
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRecurringSchedules(token);
      setSchedules(data.schedules || []);
      setConfig(data.config || { lookAheadDays: 30, enabled: true, lastRunAt: null });
      setLookAheadInput(data.config?.lookAheadDays ?? 30);
      const sum = await fetchRecurringScheduleSummary(token);
      setSummary(sum);
    } catch (err) {
      setStatusMessage({ kind: 'err', text: err?.message || 'Failed to load schedule' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === 'recurring' && token) load();
  }, [tab, token, load]);

  // Auto-dismiss status messages after 5s so the page doesn't accumulate banners.
  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  if (tab !== 'recurring') return null;

  const handleAdd = async () => {
    if (!confirmAdminAction({
      action: 'Add this recurring schedule slot',
      details: [
        `Day: ${DAY_LABELS_FULL[newSchedule.day_of_week]}`,
        `Start time: ${newSchedule.time}`,
        `Booking cutoff: ${newSchedule.cutoff_time}`,
        `Type: ${newSchedule.session_type === 'special_bingo' ? 'Special Bingo' : 'Regular Bingo'}`,
      ],
      warning: 'Future sessions will be auto-created from this slot.',
    })) return;
    try {
      await createRecurringSchedule(token, newSchedule);
      setNewSchedule({ day_of_week: 1, time: '18:30', cutoff_time: '12:00', session_type: 'regular_bingo' });
      setStatusMessage({ kind: 'ok', text: 'Recurring slot added.' });
      await load();
    } catch (err) {
      setStatusMessage({ kind: 'err', text: err?.message || 'Failed to add slot' });
    }
  };

  const handleToggleActive = async (schedule) => {
    if (!confirmAdminAction({
      action: `${schedule.is_active ? 'Pause' : 'Resume'} this recurring slot`,
      details: [
        `Day: ${DAY_LABELS_FULL[schedule.day_of_week]}`,
        `Start time: ${schedule.time}`,
      ],
      warning: schedule.is_active
        ? 'Future auto-generation will stop for this slot.'
        : 'Future auto-generation will resume for this slot.',
    })) return;
    try {
      await updateRecurringSchedule(token, schedule.id, { is_active: schedule.is_active ? 0 : 1 });
      await load();
    } catch (err) {
      setStatusMessage({ kind: 'err', text: err?.message || 'Failed to toggle slot' });
    }
  };

  const handleStartEdit = (schedule) => {
    setEditingId(schedule.id);
    setEditForm({
      day_of_week: schedule.day_of_week,
      time: schedule.time,
      cutoff_time: schedule.cutoff_time,
      session_type: schedule.session_type,
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    if (!confirmAdminAction({
      action: 'Save changes to this recurring slot',
      details: [
        `Day: ${DAY_LABELS_FULL[editForm.day_of_week]}`,
        `Start time: ${editForm.time}`,
        `Booking cutoff: ${editForm.cutoff_time}`,
        `Type: ${editForm.session_type === 'special_bingo' ? 'Special Bingo' : 'Regular Bingo'}`,
      ],
      warning: 'This affects future auto-generated sessions only.',
    })) return;
    try {
      await updateRecurringSchedule(token, editingId, editForm);
      setEditingId(null);
      setEditForm(null);
      setStatusMessage({ kind: 'ok', text: 'Slot updated.' });
      await load();
    } catch (err) {
      setStatusMessage({ kind: 'err', text: err?.message || 'Failed to update slot' });
    }
  };

  const handleDelete = async (schedule) => {
    const ok = window.confirm(
      `Remove the ${DAY_LABELS_FULL[schedule.day_of_week]} ${schedule.time} slot?\n\n` +
      `Existing sessions already created from this slot will be kept — only future auto-generation stops.`
    );
    if (!ok) return;
    try {
      await deleteRecurringSchedule(token, schedule.id);
      setStatusMessage({ kind: 'ok', text: 'Slot removed.' });
      await load();
    } catch (err) {
      setStatusMessage({ kind: 'err', text: err?.message || 'Failed to delete slot' });
    }
  };

  const handleSaveConfig = async (patch) => {
    const nextEnabled = patch.enabled ?? config.enabled;
    const nextLookAheadDays = patch.lookAheadDays ?? config.lookAheadDays;
    if (!confirmAdminAction({
      action: 'Save auto-generation settings',
      details: [
        `Auto-generation: ${nextEnabled ? 'Enabled' : 'Disabled'}`,
        `Look-ahead: ${nextLookAheadDays} days`,
      ],
      warning: 'This changes how far ahead regular bingo sessions are automatically created.',
    })) return;
    setSavingConfig(true);
    try {
      const next = await updateAutoGenerateConfig(token, patch);
      setConfig(next);
      setLookAheadInput(next.lookAheadDays);
      setStatusMessage({ kind: 'ok', text: 'Settings saved.' });
      await load();
    } catch (err) {
      setStatusMessage({ kind: 'err', text: err?.message || 'Failed to save settings' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleGenerateNow = async () => {
    if (!confirmAdminAction({
      action: 'Generate scheduled sessions now',
      warning: 'The server will create any missing future sessions based on the recurring schedule.',
    })) return;
    setGenerating(true);
    try {
      const result = await triggerScheduleGenerate(token);
      if (!result.ok) {
        setStatusMessage({ kind: 'err', text: result.error || 'Generation failed' });
      } else {
        setStatusMessage({ kind: 'ok', text: result.message || 'Generation complete.' });
      }
      await load();
    } catch (err) {
      setStatusMessage({ kind: 'err', text: err?.message || 'Generation failed' });
    } finally {
      setGenerating(false);
    }
  };

  // Group schedule rows by day so the UI shows a stable Sun→Sat order even
  // if multiple slots exist on the same day.
  const schedulesByDay = {};
  for (const s of schedules) {
    if (!schedulesByDay[s.day_of_week]) schedulesByDay[s.day_of_week] = [];
    schedulesByDay[s.day_of_week].push(s);
  }

  const activeDayCount = new Set(schedules.filter(s => s.is_active).map(s => s.day_of_week)).size;
  const upcomingPreview = (summary?.upcomingInWindow || []).slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Header / overview card */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-brand-blue text-base mb-1">🔁 Auto-Generated Bingo Schedule</h3>
            <p className="text-sm text-gray-600 max-w-2xl">
              Define which days of the week the app should auto-create regular bingo sessions for.
              The generator runs on server start and every hour, keeping a rolling{' '}
              <span className="font-semibold">{config.lookAheadDays}-day</span> window of upcoming sessions ready.
              Each generated session gets the full 75-table x 6-chair seat grid.
            </p>
          </div>
          <button
            onClick={handleGenerateNow}
            disabled={generating}
            className="bg-brand-blue text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-blue/90 disabled:opacity-50"
          >
            {generating ? 'Generating…' : '▶ Generate Now'}
          </button>
        </div>

        {statusMessage && (
          <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${
            statusMessage.kind === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {statusMessage.text}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">Active days</div>
            <div className="text-lg font-semibold text-brand-blue">{activeDayCount} / 7</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">Upcoming auto sessions</div>
            <div className="text-lg font-semibold text-brand-blue">{summary?.upcomingAutoSessions ?? '—'}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">Look-ahead</div>
            <div className="text-lg font-semibold text-brand-blue">{config.lookAheadDays} days</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500">Last run</div>
            <div className="text-xs font-medium text-gray-700 truncate" title={formatTimestamp(config.lastRunAt)}>
              {formatTimestamp(config.lastRunAt)}
            </div>
          </div>
        </div>
      </div>

      {/* Master config */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h4 className="font-semibold text-brand-blue mb-3">Generator Settings</h4>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleSaveConfig({ enabled: e.target.checked })}
              disabled={savingConfig}
            />
            <span className="font-medium">Auto-generation enabled</span>
          </label>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Look-ahead (days)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="180"
                value={lookAheadInput}
                onChange={(e) => setLookAheadInput(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm w-24"
              />
              <button
                onClick={() => handleSaveConfig({ lookAheadDays: Number(lookAheadInput) })}
                disabled={savingConfig || Number(lookAheadInput) === config.lookAheadDays}
                className="text-xs bg-brand-blue text-white px-3 py-2 rounded-lg hover:bg-brand-blue/90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Max 180. Higher = more bookings can be made further ahead.</p>
          </div>
        </div>
      </div>

      {/* Day-of-week grid */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h4 className="font-semibold text-brand-blue mb-3">Weekly Slots</h4>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5, 6].map(dow => {
              const daySchedules = schedulesByDay[dow] || [];
              return (
                <div key={dow} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-sm text-gray-700">{DAY_LABELS_FULL[dow]}</div>
                    {daySchedules.length === 0 && (
                      <span className="text-xs text-gray-400 italic">No sessions scheduled</span>
                    )}
                  </div>
                  {daySchedules.length > 0 && (
                    <div className="space-y-2">
                      {daySchedules.map(s => editingId === s.id ? (
                        <div key={s.id} className="flex flex-wrap items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg">
                          <input
                            type="time"
                            value={editForm.time}
                            onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                            className="px-2 py-1 border rounded text-sm"
                          />
                          <span className="text-xs text-gray-500">cutoff</span>
                          <input
                            type="time"
                            value={editForm.cutoff_time}
                            onChange={(e) => setEditForm({ ...editForm, cutoff_time: e.target.value })}
                            className="px-2 py-1 border rounded text-sm"
                          />
                          <select
                            value={editForm.session_type}
                            onChange={(e) => setEditForm({ ...editForm, session_type: e.target.value })}
                            className="px-2 py-1 border rounded text-sm"
                          >
                            {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <button onClick={handleSaveEdit} className="text-xs bg-brand-blue text-white px-3 py-1 rounded">Save</button>
                          <button onClick={() => { setEditingId(null); setEditForm(null); }} className="text-xs px-3 py-1 border rounded">Cancel</button>
                        </div>
                      ) : (
                        <div key={s.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg ${s.is_active ? 'bg-green-50' : 'bg-gray-100 opacity-60'}`}>
                          <span className="font-medium text-sm">{s.time}</span>
                          <span className="text-xs text-gray-500">cutoff {s.cutoff_time}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white border">
                            {s.session_type === 'special_bingo' ? 'Special' : 'Regular'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <div className="flex gap-1 ml-auto">
                            <button onClick={() => handleToggleActive(s)} className="text-xs px-2 py-1 border rounded hover:bg-white">
                              {s.is_active ? 'Pause' : 'Resume'}
                            </button>
                            <button onClick={() => handleStartEdit(s)} className="text-xs px-2 py-1 border rounded hover:bg-white">Edit</button>
                            <button onClick={() => handleDelete(s)} className="text-xs px-2 py-1 border rounded text-red-700 hover:bg-red-50">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add new slot */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h4 className="font-semibold text-brand-blue mb-3">Add New Recurring Slot</h4>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Day</label>
            <select
              value={newSchedule.day_of_week}
              onChange={(e) => setNewSchedule({ ...newSchedule, day_of_week: Number(e.target.value) })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              {DAY_LABELS_FULL.map((label, i) => (
                <option key={i} value={i}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start time</label>
            <input
              type="time"
              value={newSchedule.time}
              onChange={(e) => setNewSchedule({ ...newSchedule, time: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Booking cutoff</label>
            <input
              type="time"
              value={newSchedule.cutoff_time}
              onChange={(e) => setNewSchedule({ ...newSchedule, cutoff_time: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Session type</label>
            <select
              value={newSchedule.session_type}
              onChange={(e) => setNewSchedule({ ...newSchedule, session_type: e.target.value })}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              {SESSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <button
            onClick={handleAdd}
            className="bg-brand-gold text-brand-blue px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
          >
            + Add Slot
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          You can have multiple slots on the same day (e.g. a midday and an evening session).
          Each will be auto-generated forward through the look-ahead window.
        </p>
      </div>

      {/* Upcoming preview */}
      {upcomingPreview.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h4 className="font-semibold text-brand-blue mb-3">Next Upcoming Auto-Generated Sessions</h4>
          <div className="text-xs text-gray-500 mb-2">
            Showing the first 10 of {summary?.upcomingAutoSessions || 0} in the look-ahead window.
            Manage or cancel individual sessions on the Bingo Sessions tab.
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr className="border-b">
                <th className="text-left py-2">Date</th>
                <th className="text-left py-2">Time</th>
                <th className="text-left py-2">Cutoff</th>
                <th className="text-left py-2">Type</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcomingPreview.map((s, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="py-2">{formatDateLabel(s.date)}</td>
                  <td className="py-2">{s.time}</td>
                  <td className="py-2 text-gray-500">{s.cutoff_time}</td>
                  <td className="py-2">{s.session_type === 'special_bingo' ? 'Special' : 'Regular'}</td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {s.is_available ? 'Open' : 'Closed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

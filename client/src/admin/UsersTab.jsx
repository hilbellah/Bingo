import React, { useEffect, useState } from 'react';
import { createAdminUser, deactivateAdminUser, fetchAdminUsers, updateAdminUser } from '../api';
import { useAdminDashboard } from './AdminDashboardContext';
import { confirmAdminAction } from './adminConfirm';

const emptyForm = { email: '', displayName: '', password: '', isSuperUser: false };

export default function UsersTab() {
  const { tab, token, isSuperUser } = useAdminDashboard();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadUsers = async () => {
    if (!isSuperUser) return;
    setLoading(true);
    setError('');
    try {
      setUsers(await fetchAdminUsers(token));
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (tab === 'users') loadUsers();
  }, [tab]);

  const showSuccess = (message) => {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!confirmAdminAction({
      action: 'Create this admin user',
      details: [
        `Email: ${form.email}`,
        `Display name: ${form.displayName || '(none)'}`,
        `Role: ${form.isSuperUser ? 'Super user' : 'Admin'}`,
      ],
      warning: 'This person will be able to access the admin dashboard.',
    })) return;
    setSaving(true);
    setError('');
    try {
      await createAdminUser(token, form);
      setForm(emptyForm);
      await loadUsers();
      showSuccess('User created.');
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const handleToggleActive = async (user) => {
    if (!confirmAdminAction({
      action: `${user.is_active ? 'Deactivate' : 'Reactivate'} this admin user`,
      details: [`User: ${user.display_name || user.email}`],
      warning: user.is_active
        ? 'This user will no longer be able to sign in.'
        : 'This user will be able to sign in again.',
    })) return;
    setError('');
    try {
      if (user.is_active) {
        await deactivateAdminUser(token, user.id);
      } else {
        await updateAdminUser(token, user.id, { isActive: true });
      }
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleSuper = async (user) => {
    if (!confirmAdminAction({
      action: `${user.is_super_user ? 'Remove super user access from' : 'Grant super user access to'} this admin user`,
      details: [`User: ${user.display_name || user.email}`],
      warning: user.is_super_user
        ? 'This user will lose super user permissions.'
        : 'This user will be able to manage other admin users.',
    })) return;
    setError('');
    try {
      await updateAdminUser(token, user.id, { isSuperUser: !user.is_super_user });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  if (tab !== 'users') return null;

  if (!isSuperUser) {
    return (
      <div className="max-w-2xl bg-white rounded-xl p-5 shadow-sm">
        <p className="text-sm text-red-600 font-medium">Super user access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 text-sm">{success}</div>}

      <form onSubmit={handleCreate} className="bg-white rounded-xl p-5 shadow-sm">
        <h4 className="font-semibold text-gray-700 mb-4">Add Admin User</h4>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Display Name</label>
            <input
              type="text"
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              minLength={8}
              required
            />
          </div>
          <label className="flex items-center gap-3 mt-6 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isSuperUser}
              onChange={e => setForm({ ...form, isSuperUser: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue"
            />
            <span className="text-sm text-gray-700">Super user</span>
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 bg-brand-blue text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-800 transition-colors disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add User'}
        </button>
      </form>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-gray-700">Admin Users</h4>
          <button onClick={loadUsers} className="text-sm text-brand-blue hover:text-blue-800 font-medium">Refresh</button>
        </div>
        {loading ? (
          <p className="text-sm text-gray-500">Loading users...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-b last:border-b-0">
                    <td className="py-3 pr-3">
                      <div className="font-medium text-gray-800">{user.display_name || user.email}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <button
                        onClick={() => handleToggleSuper(user)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${user.is_super_user ? 'bg-brand-gold/20 text-brand-blue' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {user.is_super_user ? 'Super user' : 'Admin'}
                      </button>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className="text-sm text-brand-blue hover:text-blue-800 font-medium"
                      >
                        {user.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-gray-500">No admin users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

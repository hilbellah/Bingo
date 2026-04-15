import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../api';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    if (sessionStorage.getItem('admin_token')) navigate('/admin/dashboard');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { token, displayName } = await adminLogin(username, password);
      sessionStorage.setItem('admin_token', token);
      sessionStorage.setItem('admin_display_name', displayName || username);
      navigate('/admin/dashboard');
    } catch {
      setError('Invalid username or password');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-blue-dark via-brand-blue to-brand-blue-mid flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-brand-gold to-brand-gold-light rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-brand-blue">Admin Panel</h1>
          <p className="text-gray-500 text-sm mt-1">Saint Mary's Entertainment Centre</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="admin-user">Username</label>
            <input id="admin-user" type="text" value={username} onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none"
              autoFocus />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-2" htmlFor="admin-pass">Password</label>
            <div className="relative">
              <input id="admin-pass" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-xl text-lg focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold outline-none" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-gold transition"
                tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          {error && <p className="text-red-500 text-base font-medium text-center">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-r from-brand-blue to-brand-blue-mid text-white py-3 rounded-xl font-semibold text-lg hover:opacity-90 transition disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <a href="/" className="block text-center text-sm text-gray-400 hover:text-brand-gold mt-6 transition">
          Back to booking page
        </a>
      </div>
    </div>
  );
}

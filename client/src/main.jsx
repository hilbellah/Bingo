import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import './index.css';

const App = lazy(() => import('./App'));
const AdminLogin = lazy(() => import('./admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'));
const BookingProcessing = lazy(() => import('./components/BookingProcessing'));
const PrintableTickets = lazy(() => import('./components/PrintableTickets'));
const Tutorial = lazy(() => import('./components/Tutorial'));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-brand-blue-dark text-white flex items-center justify-center">
      {/* Pipeline verification branch only. */}
      <div className="text-sm text-white/70">Loading...</div>
    </div>
  );
}

function PaymentReturnRoute() {
  const { bookingId } = useParams();
  return <BookingProcessing bookingId={bookingId || ''} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/booking/:bookingId/processing" element={<PaymentReturnRoute />} />
          <Route path="/booking/:bookingId/cancelled" element={<PaymentReturnRoute />} />
          <Route path="/tickets" element={<PrintableTickets />} />
          <Route path="/tickets/:ref" element={<PrintableTickets />} />
          <Route path="/tutorial" element={<Tutorial />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import App from './App';
import AdminLogin from './admin/AdminLogin';
import AdminDashboard from './admin/AdminDashboard';
import BookingProcessing from './components/BookingProcessing';
import PrintableTickets from './components/PrintableTickets';
import Tutorial from './components/Tutorial';
import './index.css';

function PaymentReturnRoute() {
  const { bookingId } = useParams();
  return <BookingProcessing bookingId={bookingId || ''} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
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
    </BrowserRouter>
  </React.StrictMode>
);

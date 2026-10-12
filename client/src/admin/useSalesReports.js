import { useRef, useState } from 'react';
import { fetchAdminBookings, fetchBookingSales, fetchDailySales, fetchAdminTransactions, fetchAdminCustomers, getCustomersExportUrl, adminHeaders } from '../api';
import { printDailySalesReceipt as printDailySalesReceiptDocument, printSalesDrilldown, saveSalesDrilldownCsv } from './adminPrintUtils';
import { venueToday } from '../utils/formatters';

// Sales & reporting state for the admin: Booking Sales (with its date view),
// Daily Sales, Transactions, Customers and the sales drilldown. Moved verbatim
// out of AdminDashboard; names are unchanged so the context value is too.
export function useSalesReports({ token, receiptConfigRef }) {
  const [bookingSales, setBookingSales] = useState([]);
  // Date view for Booking Sales: { dateFrom, dateTo } when active, otherwise
  // null. Kept separate from bookingSales so Event Sales is unaffected.
  const [bookingSalesRange, setBookingSalesRange] = useState(null);
  const [datedBookingSales, setDatedBookingSales] = useState(null); // { rows, error, loading }
  const bookingSalesRangeRef = useRef(null);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [salesDrilldown, setSalesDrilldown] = useState(null); // { session, bookings }
  const [dailySales, setDailySales] = useState(null);
  const [dailySalesDate, setDailySalesDate] = useState(venueToday());
  const [dailySalesDateTo, setDailySalesDateTo] = useState(venueToday());
  const [dailySalesRange, setDailySalesRange] = useState('daily');
  const [dailySalesSearch, setDailySalesSearch] = useState('');
  const [transactions, setTransactions] = useState({ items: [], summary: null, filters: {} });
  const [transactionFilters, setTransactionFilters] = useState({ dateFrom: '', dateTo: '', status: 'all', search: '' });

  const loadDatedBookingSales = (range) => {
    bookingSalesRangeRef.current = range;
    setBookingSalesRange(range);
    if (!range) {
      setDatedBookingSales(null);
      return Promise.resolve();
    }
    setDatedBookingSales(prev => ({ rows: prev?.rows || [], error: '', loading: true }));
    return fetchBookingSales(token, range)
      .then(data => {
        if (bookingSalesRangeRef.current !== range) return;
        if (!Array.isArray(data)) throw new Error(data?.error || 'Could not load booking sales for those dates.');
        setDatedBookingSales({ rows: data, error: '', loading: false });
      })
      .catch(err => {
        if (bookingSalesRangeRef.current !== range) return;
        setDatedBookingSales({ rows: [], error: err?.message || 'Could not load booking sales for those dates.', loading: false });
      });
  };
  // Refunds and other booking changes call this; refresh the date view too
  // so its counts do not go stale while staff work through past sessions.
  const loadBookingSales = () => {
    if (bookingSalesRangeRef.current) loadDatedBookingSales(bookingSalesRangeRef.current);
    return fetchBookingSales(token).then(setBookingSales);
  };
  const loadDailySales = (filters = {}, legacySearch) => {
    const nextFilters = typeof filters === 'object' && filters !== null
      ? filters
      : { date: filters, search: legacySearch };
    const range = nextFilters.range || dailySalesRange;
    const date = nextFilters.date || dailySalesDate;
    const dateFrom = nextFilters.dateFrom || date;
    const dateTo = nextFilters.dateTo || dailySalesDateTo || dateFrom;
    const request = {
      range,
      search: nextFilters.search ?? dailySalesSearch,
    };
    if (range === 'multi-day') {
      request.dateFrom = dateFrom;
      request.dateTo = dateTo;
    } else {
      request.date = date;
    }
    return fetchDailySales(token, request).then(setDailySales);
  };
  const loadTransactions = (filters = transactionFilters) => fetchAdminTransactions(token, filters).then(setTransactions);
  const loadCustomers = (search) => fetchAdminCustomers(token, search ?? customerSearch).then(setCustomers);


  const handleSalesDrilldown = (sale) => {
    const quantity = Number(sale?.quantity || sale?.sold || 0);
    if (!sale?.id || quantity <= 0) return;

    setSalesDrilldown({ session: { ...sale, quantity }, bookings: [], loading: true, error: '' });
    fetchAdminBookings(token, sale.id)
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error(data?.message || data?.error || 'Could not load booking details.');
        }
        setSalesDrilldown({ session: { ...sale, quantity }, bookings: data, loading: false, error: '' });
      })
      .catch(err => {
        setSalesDrilldown({
          session: { ...sale, quantity },
          bookings: [],
          loading: false,
          error: err?.message || 'Could not load booking details.',
        });
      });
  };

  const handlePrintSalesDrilldown = () => {
    printSalesDrilldown(salesDrilldown);
  };

  const handleSaveSalesDrilldownCsv = () => {
    saveSalesDrilldownCsv(salesDrilldown);
  };

  const handlePrintDailySalesReceipt = () => {
    printDailySalesReceiptDocument(dailySales, receiptConfigRef.current);
  };

  const handleExportCustomers = () => {
    fetch(getCustomersExportUrl(customerSearch), { headers: adminHeaders(token) })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'customers-report.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
  };

  return {
    bookingSales,
    setBookingSales,
    bookingSalesRange,
    setBookingSalesRange,
    datedBookingSales,
    setDatedBookingSales,
    customers,
    setCustomers,
    customerSearch,
    setCustomerSearch,
    salesDrilldown,
    setSalesDrilldown,
    dailySales,
    setDailySales,
    dailySalesDate,
    setDailySalesDate,
    dailySalesDateTo,
    setDailySalesDateTo,
    dailySalesRange,
    setDailySalesRange,
    dailySalesSearch,
    setDailySalesSearch,
    transactions,
    setTransactions,
    transactionFilters,
    setTransactionFilters,
    loadDatedBookingSales,
    loadBookingSales,
    loadDailySales,
    loadTransactions,
    loadCustomers,
    handleSalesDrilldown,
    handlePrintSalesDrilldown,
    handleSaveSalesDrilldownCsv,
    handlePrintDailySalesReceipt,
    handleExportCustomers,
  };
}

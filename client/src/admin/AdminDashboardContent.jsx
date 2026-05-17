import React from 'react';
import DashboardTab from './DashboardTab';
import SessionsTab from './SessionsTab';
import RecurringScheduleTab from './RecurringScheduleTab';
import PackagesTab from './PackagesTab';
import AnnouncementsTab from './AnnouncementsTab';
import BookingsTab from './BookingsTab';
import EventSalesTab from './EventSalesTab';
import CustomersTab from './CustomersTab';
import BulkPrintTab from './BulkPrintTab';
import ArchiveAuditTab from './ArchiveAuditTab';
import ChairManagementTab from './ChairManagementTab';
import InventoryTab from './InventoryTab';
import UsersTab from './UsersTab';
import SettingsTab from './SettingsTab';
import SalesDrilldownModal from './SalesDrilldownModal';
import SoldTicketsModal from './SoldTicketsModal';
import { AdminDashboardProvider } from './AdminDashboardContext';

export default function AdminDashboardContent({ value }) {
  return (
    <AdminDashboardProvider value={value}>
      <div className="flex-1 px-6 py-6">
        <DashboardTab />
        <SessionsTab />
        <RecurringScheduleTab />
        <PackagesTab />
        <AnnouncementsTab />
        <BookingsTab />
        <EventSalesTab />
        <CustomersTab />
        <BulkPrintTab />
        <ArchiveAuditTab />
        <ChairManagementTab />
        <InventoryTab />
        <UsersTab />
        <SettingsTab />
      </div>

      <SalesDrilldownModal />
      <SoldTicketsModal />
    </AdminDashboardProvider>
  );
}

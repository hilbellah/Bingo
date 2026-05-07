import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import { saveSettings } from '../api';

export default function SettingsTab() {
  const {
    tab,
    printBookingReceipt,
    token,
    receiptConfig,
    setReceiptConfig,
    receiptSaved,
    setReceiptSaved,
    setAutoPrint,
  } = useAdminDashboard();

  return (
    <>
        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <div className="max-w-3xl">
            {/* PRINTING & RECEIPTS SETTINGS */}
              <div>
                {receiptSaved && (
                  <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2 mb-4 text-sm">
                    Receipt settings saved!
                  </div>
                )}

                <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
                  <h4 className="font-semibold text-gray-700 mb-3">Receipt Information</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Business Name on Receipt</label>
                      <input type="text" value={receiptConfig.businessName}
                        onChange={e => setReceiptConfig({ ...receiptConfig, businessName: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Subtitle / Tagline</label>
                      <input type="text" value={receiptConfig.businessSubtitle}
                        onChange={e => setReceiptConfig({ ...receiptConfig, businessSubtitle: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Receipt Title</label>
                      <input type="text" value={receiptConfig.receiptTitle}
                        onChange={e => setReceiptConfig({ ...receiptConfig, receiptTitle: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Footer Message</label>
                      <input type="text" value={receiptConfig.footerText}
                        onChange={e => setReceiptConfig({ ...receiptConfig, footerText: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
                  <h4 className="font-semibold text-gray-700 mb-3">Display Options</h4>
                  <div className="space-y-3">
                    {[
                      { key: 'showRefNumber', label: 'Show Reference Number' },
                      { key: 'showTableChair', label: 'Show Table & Chair Numbers' },
                      { key: 'showPackagePrice', label: 'Show Package Prices' },
                      { key: 'showAddons', label: 'Show Add-ons' },
                      { key: 'showTimestamp', label: 'Show Timestamp' },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={receiptConfig[opt.key]}
                          onChange={e => setReceiptConfig({ ...receiptConfig, [opt.key]: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue" />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl p-5 shadow-sm mb-4">
                  <h4 className="font-semibold text-gray-700 mb-3">Printer Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Paper Width</label>
                      <select value={receiptConfig.paperWidth}
                        onChange={e => setReceiptConfig({ ...receiptConfig, paperWidth: e.target.value })}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue">
                        <option value="58mm">58mm (Small Thermal)</option>
                        <option value="80mm">80mm (Standard Thermal)</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={receiptConfig.autoPrintEnabled}
                        onChange={e => {
                          const val = e.target.checked;
                          setReceiptConfig({ ...receiptConfig, autoPrintEnabled: val });
                          setAutoPrint(val);
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue" />
                      <span className="text-sm text-gray-700">Auto-Print on New Orders</span>
                    </label>
                    <p className="text-xs text-gray-400 ml-7">When enabled, a receipt will automatically print every time a new booking is placed. Set your thermal printer as the default browser printer for silent printing.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => {
                    saveSettings(token, 'receipt_config', receiptConfig).then(() => {
                      setReceiptSaved(true);
                      setTimeout(() => setReceiptSaved(false), 3000);
                    });
                  }} className="bg-brand-blue text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-800 transition-colors">
                    Save Receipt Settings
                  </button>
                  <button onClick={() => {
                    printBookingReceipt({
                      referenceNumber: 'SAMPLE-001',
                      sessionDate: new Date().toISOString().split('T')[0],
                      sessionTime: '18:30',
                      totalFormatted: '$25.00',
                      createdAt: new Date().toISOString(),
                      items: [
                        { firstName: 'John', lastName: 'Doe', tableNumber: 1, chairNumber: 3, packageName: 'Regular Bingo', packagePriceFormatted: '$20.00', addons: [{ packageName: 'Extra Card', quantity: 1, priceFormatted: '$5.00' }] }
                      ]
                    });
                  }} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors border">
                    Print Preview
                  </button>
                </div>
              </div>
          </div>
        )}
    </>
  );
}



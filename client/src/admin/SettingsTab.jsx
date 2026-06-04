import React from 'react';
import { useAdminDashboard } from './AdminDashboardContext';
import { saveSettings } from '../api';
import { confirmAdminAction } from './adminConfirm';

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
  const receiptCutPercent = Number(receiptConfig.receiptCutPercent ?? (receiptConfig.partialCutBetweenReceipts ? 70 : 0));
  const receiptCutEnabled = receiptCutPercent > 0;
  const receiptCutSliderValue = receiptCutEnabled ? receiptCutPercent : 70;
  const updateReceiptCut = (nextPercent) => {
    const value = Math.min(99, Math.max(1, Math.round(Number(nextPercent) || 70)));
    setReceiptConfig({
      ...receiptConfig,
      receiptCutPercent: value,
      partialCutBetweenReceipts: true,
    });
  };
  const toggleReceiptCut = () => {
    const nextEnabled = !receiptCutEnabled;
    setReceiptConfig({
      ...receiptConfig,
      receiptCutPercent: nextEnabled ? receiptCutSliderValue : 0,
      partialCutBetweenReceipts: nextEnabled,
    });
  };

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
                        <option value="80mm">80mm (Epson TM-T88V / Standard Thermal)</option>
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
                    <p className="text-xs text-gray-400 ml-7">When enabled, a receipt will automatically print every time a new booking is placed. Install the Epson driver, set the TM-T88V as the default printer, and use 80mm receipt paper.</p>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="block text-sm text-gray-600">Cut After Each Receipt</label>
                        <button
                          type="button"
                          onClick={toggleReceiptCut}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${receiptCutEnabled ? 'bg-brand-blue text-white border-brand-blue' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'}`}
                        >
                          {receiptCutEnabled ? 'Cut On' : 'Cut Off'}
                        </button>
                      </div>
                      <div className={`flex items-center gap-3 ${receiptCutEnabled ? '' : 'opacity-45'}`}>
                        <input
                          type="range"
                          min="1"
                          max="99"
                          step="1"
                          value={receiptCutSliderValue}
                          disabled={!receiptCutEnabled}
                          onChange={e => updateReceiptCut(e.target.value)}
                          className="w-full accent-brand-blue"
                        />
                        <span className="w-12 text-right text-sm font-semibold text-gray-700">{receiptCutSliderValue}%</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">For the Epson TM-T88V, each bulk thermal receipt prints as its own cut-ready page. Match this percentage in the printer driver cutter setting.</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => {
                    if (!confirmAdminAction({
                      action: 'Save receipt settings',
                      details: [
                        `Business name: ${receiptConfig.businessName}`,
                        `Paper width: ${receiptConfig.paperWidth}`,
                        `Auto-print: ${receiptConfig.autoPrintEnabled ? 'On' : 'Off'}`,
                        `Receipt cut: ${receiptCutEnabled ? `${receiptCutSliderValue}%` : 'Off'}`,
                      ],
                      warning: 'This changes how admin receipts print.',
                    })) return;
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



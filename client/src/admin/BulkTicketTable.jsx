import React from 'react';

// The ticket list on the Bulk Print tab: one row per ticket with a select
// checkbox and printed status. Moved verbatim from BulkPrintTab.
export default function BulkTicketTable({ visibleTickets, selectedTicketIds, toggleTicket }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm mb-4 no-print overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b">
            <th className="pb-2 w-10"></th>
            <th className="pb-2">Ticket</th>
            <th className="pb-2">Name</th>
            <th className="pb-2">Session</th>
            <th className="pb-2 text-center">Table</th>
            <th className="pb-2 text-center">Seat</th>
            <th className="pb-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {visibleTickets.length === 0 ? (
            <tr>
              <td className="py-5 text-center text-gray-400" colSpan={7}>No tickets match this filter.</td>
            </tr>
          ) : visibleTickets.map(ticket => (
            <tr key={ticket.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2">
                <input
                  type="checkbox"
                  checked={selectedTicketIds.has(ticket.id)}
                  onChange={() => toggleTicket(ticket.id)}
                />
              </td>
              <td className="py-2 font-mono text-brand-blue">{ticket.referenceNumber}</td>
              <td className="py-2 font-medium text-gray-800">{ticket.firstName} {ticket.lastName}</td>
              <td className="py-2 text-gray-600">
                {ticket.sessionDate} {ticket.sessionTime}
                {ticket.eventTitle ? <span className="ml-1 text-amber-700">- {ticket.eventTitle}</span> : null}
              </td>
              <td className="py-2 text-center">{ticket.tableNumber}</td>
              <td className="py-2 text-center">{ticket.chairNumber}</td>
              <td className="py-2">
                {ticket.printedAt ? (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                    Printed {new Date(ticket.printedAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Unprinted</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

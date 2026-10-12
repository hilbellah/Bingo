import React from 'react';

// White card with a title and description, used by the sales boards.
export default function SalesPanel({ title, description, children }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-brand-blue">{title}</h3>
        <p className="text-sm text-gray-500 mt-1">{description}</p>
      </div>
      <div className="px-5 pb-5">
        {children}
      </div>
    </section>
  );
}

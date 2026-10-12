// Print and on-screen styles for the Bulk Print special-paper tickets, rendered
// by BulkPrintTab in a <style> tag. Moved verbatim (same text) from the tab.
export const BULK_PRINT_PAGE_CSS = `
              @media print {
                .no-print, header, .bg-white.border-b { display: none !important; }
                body { margin: 0; padding: 0; color: #000; background: #fff; }
                .bulk-ticket-page,
                .bulk-ticket-page *,
                .bulk-ticket-page *::before,
                .bulk-ticket-page *::after,
                .event-ticket-page,
                .event-ticket-page *,
                .event-ticket-page *::before,
                .event-ticket-page *::after {
                  print-color-adjust: exact;
                  -webkit-print-color-adjust: exact;
                }
                .bulk-ticket-page img,
                .event-ticket-page img {
                  filter: none !important;
                  -webkit-filter: none !important;
                }
                @page { size: letter; margin: 0.2in; }
                .max-w-6xl { max-width: none !important; padding: 0 !important; }
                .min-h-screen { min-height: auto !important; }
                .bulk-ticket-page,
                .event-ticket-page {
                  background: #fff !important;
                  margin: 0 auto !important;
                  overflow: hidden !important;
                }
                .bulk-ticket-page .ticket-card {
                  background: linear-gradient(135deg, #fdf6e3 0%, #fcecd6 50%, #f8e0c0 100%) !important;
                  border-color: #c5a55a !important;
                }
                .event-ticket-card {
                  background: #fffdf8 !important;
                  border-color: #1a3a5c !important;
                }
                .bulk-ticket-page .ticket-title,
                .bulk-ticket-page .ticket-name-prominent,
                .bulk-ticket-page .ticket-name-secondary,
                .bulk-ticket-page .ticket-value,
                .bulk-ticket-page .ticket-value-md,
                .bulk-ticket-page .ticket-ref-value,
                .event-ticket-title,
                .event-ticket-name,
                .event-ticket-ref {
                  color: #1a3a5c !important;
                }
                .bulk-ticket-page .ticket-price,
                .bulk-ticket-page .ticket-price-sm {
                  color: #c5a55a !important;
                }
                .bulk-ticket-page .ticket-pkg,
                .bulk-ticket-page .ticket-label,
                .bulk-ticket-page .ticket-label-sm,
                .bulk-ticket-page .ticket-meta-text,
                .event-ticket-meta {
                  color: #555 !important;
                }
              }

              @media screen {
                .bulk-ticket-page, .event-ticket-page {
                  max-width: 8.5in;
                  margin: 10px auto;
                  padding: 0.25in;
                  background: white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
              }

              .event-ticket-page {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                grid-template-rows: repeat(3, 1fr);
                gap: 0.12in;
                width: 7.6in;
                height: 10in;
                page-break-after: always;
              }

              .event-ticket-card {
                border: 1.5px dashed #1a3a5c;
                border-radius: 6px;
                box-sizing: border-box;
                padding: 0.18in;
                background: #fffdf8;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                text-align: center;
                color: #1a3a5c;
                overflow: hidden;
              }

              .event-ticket-title {
                font-family: Georgia, serif;
                font-size: 18px;
                font-weight: 700;
                line-height: 1.15;
                margin-bottom: 0.12in;
              }

              .event-ticket-name {
                font-size: 20px;
                font-weight: 700;
                line-height: 1.2;
                word-break: break-word;
                max-width: 100%;
                margin-bottom: 0.1in;
              }

              .event-ticket-row {
                display: flex;
                gap: 0.18in;
                justify-content: center;
                font-size: 16px;
                font-weight: 700;
                margin-bottom: 0.08in;
              }

              .event-ticket-meta {
                font-size: 12px;
                color: #555;
                font-weight: 600;
                margin-bottom: 0.08in;
              }

              .event-ticket-ref {
                font-family: monospace;
                font-size: 13px;
                font-weight: 700;
                color: #0f2d48;
              }

              .bulk-ticket-page {
                display: flex;
                flex-direction: column;
                width: 7.6in;
                height: 10in;
                page-break-after: always;
                justify-content: space-between;
              }

              .bulk-ticket-page .ticket-card {
                width: 100%;
                height: 3.2in;
                border: 1.5px dashed #c5a55a;
                border-radius: 8px;
                box-sizing: border-box;
                background: linear-gradient(135deg, #fdf6e3 0%, #fcecd6 50%, #f8e0c0 100%);
                position: relative;
                overflow: hidden;
              }

              .bulk-ticket-page .ticket-inner {
                display: flex;
                height: 100%;
                padding: 0.25in 0.3in;
                gap: 0;
              }

              .bulk-ticket-page .ticket-half {
                flex: 1;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                text-align: center; box-sizing: border-box;
                padding: 0 0.2in; gap: 2px;
              }
              .bulk-ticket-page .ticket-half-left {
                border-right: 2px dashed #c5a55a;
              }
              .bulk-ticket-page .ticket-card-single .ticket-inner {
                justify-content: center;
              }
              .bulk-ticket-page .ticket-card-single .ticket-half {
                flex: 0 1 50%;
                border-right: 0;
              }
              .bulk-ticket-page .ticket-half-row {
                display: flex; gap: 16px;
                justify-content: center; align-items: center;
              }
              .bulk-ticket-page .ticket-title {
                font-family: 'Georgia', serif;
                font-size: 16px; font-weight: bold;
                color: #1a3a5c; margin: 0 0 4px 0; line-height: 1.2;
              }
              .bulk-ticket-page .ticket-logo {
                width: 0.95in; height: 0.3in;
                display: flex; align-items: center; justify-content: center;
                margin-bottom: 4px;
              }
              .bulk-ticket-page .ticket-logo-img {
                max-width: 100%; max-height: 100%;
                object-fit: contain; opacity: 1;
              }
              .bulk-ticket-page .ticket-name-prominent {
                font-size: 22px; font-weight: 700;
                color: #1a3a5c; margin: 0 0 2px 0;
                line-height: 1.2; word-break: break-word; max-width: 100%;
              }
              .bulk-ticket-page .ticket-name-secondary {
                font-size: 16px; font-weight: 700;
                color: #1a3a5c; line-height: 1.2;
                word-break: break-word; margin: 2px 0;
              }
              .bulk-ticket-page .ticket-price {
                font-family: 'Georgia', serif;
                font-size: 20px; font-weight: bold;
                color: #c5a55a; margin: 2px 0 0 0;
              }
              .bulk-ticket-page .ticket-price-sm {
                font-size: 12px; font-weight: 600;
                color: #c5a55a; margin: 2px 0;
              }
              .bulk-ticket-page .ticket-pkg {
                font-size: 11px; color: #888; margin: 0;
              }
              .bulk-ticket-page .ticket-detail-compact { text-align: center; }
              .bulk-ticket-page .ticket-value-md {
                display: block; font-size: 22px; font-weight: bold;
                color: #1a3a5c; line-height: 1.1;
              }
              .bulk-ticket-page .ticket-detail { text-align: center; }
              .bulk-ticket-page .ticket-label {
                display: block; font-size: 11px; color: #888;
                text-transform: uppercase; letter-spacing: 1px;
              }
              .bulk-ticket-page .ticket-value {
                display: block; font-size: 36px; font-weight: bold;
                color: #1a3a5c; line-height: 1.1;
              }
              .bulk-ticket-page .ticket-label-sm {
                display: block; font-size: 9px; color: #aaa;
                text-transform: uppercase; letter-spacing: 0.5px;
              }
              .bulk-ticket-page .ticket-meta { margin-top: 2px; }
              .bulk-ticket-page .ticket-meta-text {
                font-size: 11px; font-weight: 600; color: #555;
              }
              .bulk-ticket-page .ticket-ref-block {
                margin-top: 2px; text-align: center;
              }
              .bulk-ticket-page .ticket-ref-value {
                display: block; font-size: 13px; font-weight: 700;
                color: #1a3a5c; font-family: monospace; letter-spacing: 0.5px;
              }
              .bulk-ticket-page .ticket-name-right {
                display: block; font-size: 18px; font-weight: 700;
                color: #1a3a5c; line-height: 1.2; word-break: break-word;
              }
`;

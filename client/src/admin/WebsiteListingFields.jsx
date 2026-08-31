import React from 'react';

// "Publish to website" panel, shared by the Add Special Bingo form and the
// Edit Session modal.
//
// Ticking the box is the ONLY way an event reaches wolastoqcasino.ca. Nothing
// syncs automatically: a session stays invisible to the marketing site until
// someone fills in the flyer and the copy here and saves.
//
// Field names match the server columns (website_*) and, in turn, the keys the
// WordPress event registry already renders, so nothing is translated between
// this form and the live flyer.

const FLYER_HINT = 'Portrait poster, the same artwork you would post on Facebook. Shown on the Bingo page, the Events page and the homepage card.';

export function emptyWebsiteListing() {
  return {
    website_published: false,
    website_slug: '',
    website_name: '',
    website_name_hl: '',
    website_flyer_url: '',
    website_flyer_alt: '',
    website_badge: '',
    website_datefmt: '',
    website_kicker: '',
    website_lead: '',
    website_blurb: '',
    website_detail_rows: [],
    website_prize: '',
    website_end_date: '',
  };
}

/** Pull the website listing fields off a session row loaded from the API. */
export function websiteListingFromSession(session = {}) {
  let rows = [];
  try {
    const parsed = JSON.parse(session.website_detail_rows || '[]');
    if (Array.isArray(parsed)) rows = parsed;
  } catch (_) {
    rows = [];
  }
  return {
    website_published: !!Number(session.website_published || 0),
    website_slug: session.website_slug || '',
    website_name: session.website_name || '',
    website_name_hl: session.website_name_hl || '',
    website_flyer_url: session.website_flyer_url || '',
    website_flyer_alt: session.website_flyer_alt || '',
    website_badge: session.website_badge || '',
    website_datefmt: session.website_datefmt || '',
    website_kicker: session.website_kicker || '',
    website_lead: session.website_lead || '',
    website_blurb: session.website_blurb || '',
    website_detail_rows: rows,
    website_prize: session.website_prize == null ? '' : String(session.website_prize),
    website_end_date: session.website_end_date || '',
  };
}

/**
 * Client-side mirror of the server's publish rule, so the admin sees what is
 * missing before the save round-trips. The server re-checks everything.
 */
export function missingWebsiteListingFields(form) {
  if (!form.website_published) return [];
  const rows = Array.isArray(form.website_detail_rows) ? form.website_detail_rows : [];
  const filledRows = rows.filter(r => String(r?.[0] || '').trim() && String(r?.[1] || '').trim());
  const missing = [];
  if (!String(form.website_flyer_url || '').trim()) missing.push('Flyer image');
  if (!String(form.website_flyer_alt || '').trim()) missing.push('Flyer alt text');
  if (!String(form.website_name || '').trim()) missing.push('Website event name');
  if (!String(form.website_kicker || '').trim()) missing.push('Kicker');
  if (!String(form.website_lead || '').trim()) missing.push('Lead paragraph');
  if (!String(form.website_blurb || '').trim()) missing.push('Short blurb');
  if (filledRows.length === 0) missing.push('At least one detail row');
  return missing;
}

function FieldLabel({ children, hint, required }) {
  return (
    <span className="block mb-1">
      <span className="text-xs font-medium text-gray-600">
        {children}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {hint && <span className="block text-[11px] text-gray-400 leading-snug">{hint}</span>}
    </span>
  );
}

export default function WebsiteListingFields({
  form,
  onChange,
  flyerFile,
  flyerPreview,
  onFlyerFileChange,
  sessionDate,
  disabled = false,
}) {
  const set = (patch) => onChange({ ...form, ...patch });
  const rows = Array.isArray(form.website_detail_rows) ? form.website_detail_rows : [];
  const missing = missingWebsiteListingFields(form);

  const setRow = (index, position, value) => {
    const next = rows.map((row, i) => {
      if (i !== index) return [row?.[0] ?? '', row?.[1] ?? ''];
      const pair = [row?.[0] ?? '', row?.[1] ?? ''];
      pair[position] = value;
      return pair;
    });
    set({ website_detail_rows: next });
  };

  return (
    <div className="mt-4 border-t pt-4">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!form.website_published}
          disabled={disabled}
          onChange={e => set({ website_published: e.target.checked })}
          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
        />
        <span>
          <span className="block text-sm font-medium text-gray-700">Publish this event to wolastoqcasino.ca</span>
          <span className="block text-xs text-gray-500">
            Off by default. Only events you tick here appear on the marketing site — the flyer and copy below become the
            Bingo-page banner, the Events-page poster and the homepage card.
          </span>
        </span>
      </label>

      {form.website_published && (
        <div className="mt-3 space-y-4 bg-fuchsia-50 rounded-lg p-4 border border-fuchsia-200">
          {missing.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Not ready to publish yet.</span> Still needed: {missing.join(', ')}.
            </div>
          )}

          {/* --- Flyer --- */}
          <div>
            <FieldLabel required hint={FLYER_HINT}>Flyer image</FieldLabel>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer bg-white hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm border transition-colors">
                {flyerFile ? 'Change Flyer' : 'Upload Flyer'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={disabled}
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file) {
                      onFlyerFileChange(file);
                      set({ website_flyer_url: '' });
                    }
                  }}
                />
              </label>
              <span className="text-gray-300">or</span>
              <input
                value={form.website_flyer_url || ''}
                disabled={disabled}
                onChange={e => {
                  onFlyerFileChange(null);
                  set({ website_flyer_url: e.target.value });
                }}
                className="flex-1 px-3 py-2 border rounded-lg text-sm"
                placeholder="Paste an https:// flyer URL..."
              />
            </div>
            {(flyerPreview || form.website_flyer_url) && (
              <div className="mt-2 relative inline-block">
                <img
                  src={flyerPreview || form.website_flyer_url}
                  alt="Website flyer preview"
                  className="h-40 w-32 rounded-lg object-cover border bg-white"
                />
                <button
                  type="button"
                  onClick={() => { onFlyerFileChange(null); set({ website_flyer_url: '' }); }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                >
                  &times;
                </button>
              </div>
            )}
          </div>

          <div>
            <FieldLabel required hint="Describes the flyer for screen readers and for anyone whose images do not load. Spell out the prizes, date and times.">
              Flyer alt text
            </FieldLabel>
            <textarea
              value={form.website_flyer_alt || ''}
              disabled={disabled}
              onChange={e => set({ website_flyer_alt: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="Bigger Bank Bingo at Wolastoq Casino, Sunday August 23 2026 — $2,000 regular games, $15,000 full card jackpot..."
            />
          </div>

          {/* --- Headline copy --- */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel required hint="Shown as the event heading on the website.">Website event name</FieldLabel>
              <input
                value={form.website_name || ''}
                disabled={disabled}
                onChange={e => set({ website_name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Bigger Bank Bingo"
              />
            </div>
            <div>
              <FieldLabel hint="Leave blank and the last word is highlighted automatically.">Highlighted heading (HTML)</FieldLabel>
              <input
                value={form.website_name_hl || ''}
                disabled={disabled}
                onChange={e => set({ website_name_hl: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                placeholder="Bigger Bank <span>Bingo</span>"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel hint="Pill above the poster. Auto-fills from the session date.">Badge</FieldLabel>
              <input
                value={form.website_badge || ''}
                disabled={disabled}
                onChange={e => set({ website_badge: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Sunday · August 23"
              />
            </div>
            <div>
              <FieldLabel hint="Long date under the banner heading. Auto-fills from the session date.">Long date</FieldLabel>
              <input
                value={form.website_datefmt || ''}
                disabled={disabled}
                onChange={e => set({ website_datefmt: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Sunday, August 23, 2026"
              />
            </div>
          </div>

          <div>
            <FieldLabel required hint="Small line above the event name on the Events page.">Kicker</FieldLabel>
            <input
              value={form.website_kicker || ''}
              disabled={disabled}
              onChange={e => set({ website_kicker: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="Play Big, Win Bigger"
            />
          </div>

          <div>
            <FieldLabel required hint="Opening paragraph on the Events page. Basic HTML like <strong> is allowed.">
              Lead paragraph
            </FieldLabel>
            <textarea
              value={form.website_lead || ''}
              disabled={disabled}
              onChange={e => set({ website_lead: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="Our biggest bingo payday of the summer — <strong>$2,000 regular games</strong>..."
            />
          </div>

          <div>
            <FieldLabel required hint="One line for the Bingo page banner and the homepage card.">Short blurb</FieldLabel>
            <input
              value={form.website_blurb || ''}
              disabled={disabled}
              onChange={e => set({ website_blurb: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="$2,000 regular games · $2,999 specials · $15,000 full card jackpot"
            />
          </div>

          {/* --- Detail rows --- */}
          <div>
            <FieldLabel required hint="The details table on the Events page. One row per line item.">Event details</FieldLabel>
            {rows.length === 0 && (
              <p className="text-xs text-gray-400 mb-2">No rows yet — add Ticket, Doors Open, Online Sales, and anything else players need.</p>
            )}
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2 items-center mb-2">
                <input
                  value={row?.[0] ?? ''}
                  disabled={disabled}
                  onChange={e => setRow(i, 0, e.target.value)}
                  className="w-40 px-2 py-1.5 border rounded text-sm"
                  placeholder="Ticket"
                />
                <input
                  value={row?.[1] ?? ''}
                  disabled={disabled}
                  onChange={e => setRow(i, 1, e.target.value)}
                  className="flex-1 px-2 py-1.5 border rounded text-sm"
                  placeholder="$150 — 9 UP Book, 1 Early Bird &amp; 1 Meal Ticket"
                />
                <button
                  type="button"
                  onClick={() => set({ website_detail_rows: rows.filter((_, j) => j !== i) })}
                  className="text-red-400 hover:text-red-600 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set({ website_detail_rows: [...rows, ['', '']] })}
              className="text-xs text-fuchsia-700 hover:text-fuchsia-900 font-medium"
            >
              + Add detail row
            </button>
          </div>

          {/* --- Listing controls --- */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <FieldLabel hint='Drives the "Come Play for ..." headline. Dollars, no cents.'>Top advertised prize</FieldLabel>
              <input
                value={form.website_prize || ''}
                disabled={disabled}
                onChange={e => set({ website_prize: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="15000"
              />
            </div>
            <div>
              <FieldLabel hint="The flyer disappears from the site after this date. Defaults to the event date.">Show until</FieldLabel>
              <input
                type="date"
                value={form.website_end_date || sessionDate || ''}
                disabled={disabled}
                onChange={e => set({ website_end_date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <FieldLabel hint="Page anchor on /events/. Auto-fills from the name.">Website link name</FieldLabel>
              <input
                value={form.website_slug || ''}
                disabled={disabled}
                onChange={e => set({ website_slug: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                placeholder="bigger-bank-bingo"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

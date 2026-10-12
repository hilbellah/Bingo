import { useState } from 'react';
import { fetchAdminSessions, createAdminSession, updateAdminSession, deleteAdminSession, fetchAdminSessionPackages, setAdminSessionPackages, uploadImage } from '../api';
import { confirmAdminAction } from './adminConfirm';
import { formatDateShort, formatTime } from '../utils/formatters';
import { emptyWebsiteListing, missingWebsiteListingFields, websiteListingFromSession } from './WebsiteListingFields';
import { packageSummary, splitSalesCutoffAt, buildSalesCutoffAt, formatSalesCutoff, defaultSpecialEventPackages, defaultEventPackages } from './adminDashboardHelpers';

// Bingo sessions and live events: create, edit, enable/disable, delete,
// session packages, flyers/images and website listing. Moved verbatim out
// of AdminDashboard; names are unchanged.
export function useSessionsAdmin({
  specialBingoConfig,
  token,
  loadBookingSales,
}) {
  const [sessions, setSessions] = useState([]);
  const [newSession, setNewSession] = useState({ date: '', time: '18:30', cutoff_time: '12:00', sales_cutoff_date: '', doors_open_time: '', is_special_event: true, event_title: '', event_description: '', event_image_url: '', packages: defaultSpecialEventPackages(), ...emptyWebsiteListing() });
  const [newEvent, setNewEvent] = useState({ date: '', time: '19:00', cutoff_time: '12:00', sales_cutoff_date: '', doors_open_time: '', ticket_limit: '', session_type: 'event', is_special_event: true, event_title: '', event_description: '', event_image_url: '', packages: defaultEventPackages() });
  const [editingSessionPkgs, setEditingSessionPkgs] = useState(null); // session id being edited
  const [sessionPkgList, setSessionPkgList] = useState([]);
  const [editingSession, setEditingSession] = useState(null); // session object being edited
  const [sessionFlyerFile, setSessionFlyerFile] = useState(null);
  const [sessionFlyerPreview, setSessionFlyerPreview] = useState(null);
  const [editFlyerFile, setEditFlyerFile] = useState(null);
  const [editFlyerPreview, setEditFlyerPreview] = useState(null);
  const [editForm, setEditForm] = useState({ date: '', time: '', cutoff_time: '', doors_open_time: '', is_special_event: false, event_title: '', event_description: '', event_image_url: '', ...emptyWebsiteListing() });
  const [sessionImageFile, setSessionImageFile] = useState(null);
  const [sessionImagePreview, setSessionImagePreview] = useState(null);
  const [eventImageFile, setEventImageFile] = useState(null);
  const [eventImagePreview, setEventImagePreview] = useState(null);
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState(null);
  const [uploadingEventImage, setUploadingEventImage] = useState(false);

  const loadSessions = () => fetchAdminSessions(token).then(setSessions);

  const resolveEventImageUrl = async (currentUrl, imageFile) => {
    if (!imageFile) return currentUrl || '';
    setUploadingEventImage(true);
    try {
      const result = await uploadImage(token, imageFile);
      return result.url || '';
    } finally {
      setUploadingEventImage(false);
    }
  };

  const handleSessionFlyerFileChange = (file) => {
    setSessionFlyerFile(file);
    setSessionFlyerPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleEditFlyerFileChange = (file) => {
    setEditFlyerFile(file);
    setEditFlyerPreview(file ? URL.createObjectURL(file) : null);
  };

  // Strip the website listing off a payload that must never reach the site,
  // and block a save that would publish an incomplete listing.
  const prepareWebsiteListing = (payload, { flyerFile, publishable }) => {
    if (!publishable || !payload.website_published) {
      // Take it off the site but keep the copy. The admin form posts every
      // field on save, so blanking the rows here would silently destroy the
      // listing and force a full retype if they ever re-publish.
      payload.website_published = false;
      return { ok: true, publishing: false };
    }
    const missing = missingWebsiteListingFields(payload, { hasFlyerFile: !!flyerFile });
    if (missing.length > 0) {
      alert('Cannot publish to the website yet. Still missing:\n\n- ' + missing.join('\n- '));
      return { ok: false, publishing: true };
    }
    return { ok: true, publishing: true, flyerFile };
  };

  const handleCreateSession = async () => {
    if (!newSession.date) return;
    const payload = { ...newSession, session_type: newSession.is_special_event ? 'special_bingo' : 'regular_bingo' };
    payload.packages = (payload.packages || []).map(({ priceText, ...pkg }) => pkg);
    if (payload.session_type === 'special_bingo') {
      payload.sales_cutoff_at = buildSalesCutoffAt(payload.sales_cutoff_date || payload.date, payload.cutoff_time);
    }
    delete payload.sales_cutoff_date;
    const proceed = confirmAdminAction({
      action: payload.is_special_event ? 'Create this special bingo event' : 'Create this regular bingo session',
      details: [
        payload.is_special_event ? `Title: ${payload.event_title || 'Special Bingo'}` : 'Type: Regular Bingo',
        `Date: ${formatDateShort(payload.date)}`,
        `Time: ${formatTime(payload.time)}`,
        payload.is_special_event && payload.doors_open_time ? `Doors open: ${formatTime(payload.doors_open_time)}` : '',
        `Sales cutoff: ${payload.session_type === 'special_bingo' ? formatSalesCutoff(payload.sales_cutoff_at, payload.cutoff_time) : formatTime(payload.cutoff_time)}`,
        payload.is_special_event ? `Packages: ${packageSummary(payload.packages) || 'No packages configured'}` : '',
        payload.website_published ? 'Website: published to wolastoqcasino.ca (flyer goes live)' : '',
      ],
      warning: 'This will make the session available for booking.',
    });
    if (!proceed) return;
    if (!payload.is_special_event) {
      delete payload.event_title;
      delete payload.event_description;
      delete payload.event_image_url;
      delete payload.doors_open_time;
      delete payload.packages;
    }
    // Only special bingo events carry a website listing; a regular session has
    // no flyer to show.
    const websitePlan = prepareWebsiteListing(payload, {
      flyerFile: sessionFlyerFile,
      publishable: payload.session_type === 'special_bingo',
    });
    if (!websitePlan.ok) return;
    try {
      if (payload.session_type === 'special_bingo') {
        payload.event_image_url = await resolveEventImageUrl(payload.event_image_url, sessionImageFile);
      }
      if (websitePlan.publishing) {
        payload.website_flyer_url = await resolveEventImageUrl(payload.website_flyer_url, sessionFlyerFile);
      }
      await createAdminSession(token, payload);
      setNewSession({ date: '', time: '18:30', cutoff_time: '12:00', sales_cutoff_date: '', doors_open_time: '', is_special_event: true, event_title: '', event_description: '', event_image_url: '', packages: defaultSpecialEventPackages(specialBingoConfig), ...emptyWebsiteListing() });
      setSessionImageFile(null);
      setSessionImagePreview(null);
      setSessionFlyerFile(null);
      setSessionFlyerPreview(null);
      loadSessions();
    } catch (err) {
      alert('Failed to create session: ' + (err?.message || 'Unknown error. Please try again.'));
      setUploadingEventImage(false);
    }
  };

  const handleEditSessionPkgs = async (sessionId) => {
    setEditingSessionPkgs(sessionId);
    const pkgs = await fetchAdminSessionPackages(token, sessionId);
    const session = sessions.find(s => s.id === sessionId);
    const sessionType = session?.session_type || (session?.is_special_event ? 'special_bingo' : 'regular_bingo');
    const fallbackPkgs = sessionType === 'special_bingo'
      ? defaultSpecialEventPackages(specialBingoConfig)
      : sessionType === 'event'
        ? defaultEventPackages()
        : [];
    setSessionPkgList(pkgs.length > 0 ? pkgs : [
      ...fallbackPkgs
    ]);
  };

  const handleSaveSessionPkgs = async () => {
    const dropped = sessionPkgList.filter(p => (p.name || p.priceText) && !(p.name && p.price > 0));
    if (dropped.length > 0) {
      const names = dropped.map(p => p.name || '(unnamed)').join(', ');
      if (!window.confirm(`These packages have no name or a CA$0.00 price and will be REMOVED from this session if you continue:\n\n${names}\n\nContinue and remove them?`)) return;
    }
    const valid = sessionPkgList.filter(p => p.name && p.price > 0).map(({ priceText, ...p }) => p);
    const session = sessions.find(s => s.id === editingSessionPkgs);
    if (!confirmAdminAction({
      action: 'Save package/pricing changes for this session',
      details: [
        session ? `Session: ${formatDateShort(session.date)} at ${formatTime(session.time)}` : '',
        `Packages: ${packageSummary(valid) || 'No valid packages'}`,
      ],
      warning: 'This affects new bookings for this session.',
    })) return;
    try {
      await setAdminSessionPackages(token, editingSessionPkgs, valid);
      setEditingSessionPkgs(null);
      setSessionPkgList([]);
    } catch (err) {
      alert('Failed to save packages: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleToggleSession = async (id, currentAvail) => {
    const session = sessions.find(s => s.id === id);
    if (!confirmAdminAction({
      action: `${currentAvail ? 'Disable' : 'Enable'} this session`,
      details: [
        session ? `Session: ${formatDateShort(session.date)} at ${formatTime(session.time)}` : '',
        session?.event_title ? `Title: ${session.event_title}` : '',
      ],
      warning: currentAvail
        ? 'Customers will not be able to book this session while it is disabled.'
        : 'Customers will be able to book this session again.',
    })) return;
    await updateAdminSession(token, id, { is_available: !currentAvail });
    loadSessions();
  };

  const handleDeleteSession = async (id, date, time) => {
    if (!confirmAdminAction({
      action: 'Delete this session',
      details: [`Session: ${formatDateShort(date)} at ${formatTime(time)}`],
      warning: 'This will soft-delete the session so it can be restored later.',
    })) return;
    await deleteAdminSession(token, id);
    loadSessions();
  };

  const handleStartEdit = (session) => {
    const salesCutoff = splitSalesCutoffAt(session.sales_cutoff_at, session.date || '', session.cutoff_time || '12:00');
    setEditingSession(session);
    setEditForm({
      date: session.date || '',
      time: session.time || '',
      cutoff_time: salesCutoff.time,
      sales_cutoff_date: salesCutoff.date,
      notify_reschedule: true,
      is_special_event: !!session.is_special_event,
      session_type: session.session_type || (session.is_special_event ? 'special_bingo' : 'regular_bingo'),
      event_title: session.event_title || '',
      event_description: session.event_description || '',
      doors_open_time: session.doors_open_time || '',
      ticket_limit: session.ticket_limit || '',
      event_image_url: session.event_image_url || '',
      ...websiteListingFromSession(session),
    });
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditFlyerFile(null);
    setEditFlyerPreview(null);
  };

  const handleSaveEdit = async () => {
    if (!editingSession || !editForm.date) return;
    const payload = { ...editForm };
    if (payload.session_type === 'event' || payload.session_type === 'special_bingo') {
      payload.is_special_event = true;
      payload.sales_cutoff_at = buildSalesCutoffAt(payload.sales_cutoff_date || payload.date, payload.cutoff_time);
    }
    delete payload.sales_cutoff_date;
    if (!payload.is_special_event && payload.session_type !== 'event') {
      payload.event_title = '';
      payload.event_description = '';
      payload.event_image_url = '';
      payload.doors_open_time = '';
      payload.sales_cutoff_at = null;
    }
    const websitePlan = prepareWebsiteListing(payload, {
      flyerFile: editFlyerFile,
      publishable: payload.session_type === 'special_bingo' || payload.session_type === 'event',
    });
    if (!websitePlan.ok) return;
    if (!confirmAdminAction({
      action: 'Save changes to this session',
      details: [
        `Date: ${formatDateShort(payload.date)}`,
        `Time: ${formatTime(payload.time)}`,
        (payload.session_type === 'event' || payload.session_type === 'special_bingo') && payload.doors_open_time ? `Doors open: ${formatTime(payload.doors_open_time)}` : '',
        `Sales cutoff: ${payload.session_type === 'event' || payload.session_type === 'special_bingo' ? formatSalesCutoff(payload.sales_cutoff_at, payload.cutoff_time) : formatTime(payload.cutoff_time)}`,
        payload.session_type === 'event' ? `Ticket limit: ${payload.ticket_limit || 'Unlimited'}` : '',
        payload.event_title ? `Title: ${payload.event_title}` : '',
        payload.website_published ? 'Website: published to wolastoqcasino.ca' : '',
      ],
      warning: payload.notify_reschedule === false
        ? 'Reschedule emails are turned off for this change.'
        : 'This can affect booking availability and customer tickets.',
    })) return;
    try {
      if (payload.session_type === 'event' || payload.session_type === 'special_bingo') {
        payload.event_image_url = await resolveEventImageUrl(payload.event_image_url, editImageFile);
      }
      if (websitePlan.publishing) {
        payload.website_flyer_url = await resolveEventImageUrl(payload.website_flyer_url, editFlyerFile);
      }
      await updateAdminSession(token, editingSession.id, payload);
      setEditingSession(null);
      setEditImageFile(null);
      setEditImagePreview(null);
      setEditFlyerFile(null);
      setEditFlyerPreview(null);
      loadSessions();
    } catch (err) {
      alert('Failed to update session: ' + (err?.message || 'Unknown error'));
      setUploadingEventImage(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!newEvent.date || !newEvent.event_title) return;
    const payload = {
      ...newEvent,
      session_type: 'event',
      is_special_event: true,
      sales_cutoff_at: buildSalesCutoffAt(newEvent.sales_cutoff_date || newEvent.date, newEvent.cutoff_time),
    };
    delete payload.sales_cutoff_date;
    payload.packages = (payload.packages || []).map(({ priceText, ...pkg }) => pkg);
    const proceed = confirmAdminAction({
      action: 'Create this live event / venue',
      details: [
        `Live Event / Venue: ${payload.event_title}`,
        `Date: ${formatDateShort(payload.date)}`,
        `Time: ${formatTime(payload.time)}`,
        payload.doors_open_time ? `Doors open: ${formatTime(payload.doors_open_time)}` : '',
        `Sales cutoff: ${formatSalesCutoff(payload.sales_cutoff_at, payload.cutoff_time)}`,
        `Ticket limit: ${payload.ticket_limit || 'Unlimited'}`,
        `Ticket: ${packageSummary(payload.packages) || 'No ticket price configured'}`,
      ],
      warning: 'This will make the live event / venue available for booking.',
    });
    if (!proceed) return;

    try {
      payload.event_image_url = await resolveEventImageUrl(payload.event_image_url, eventImageFile);
      await createAdminSession(token, payload);
      setNewEvent({ date: '', time: '19:00', cutoff_time: '12:00', sales_cutoff_date: '', doors_open_time: '', ticket_limit: '', session_type: 'event', is_special_event: true, event_title: '', event_description: '', event_image_url: '', packages: defaultEventPackages() });
      setEventImageFile(null);
      setEventImagePreview(null);
      loadSessions();
      loadBookingSales();
    } catch (err) {
      alert('Failed to create live event / venue: ' + (err?.message || 'Unknown error. Please try again.'));
      setUploadingEventImage(false);
    }
  };

  return {
    sessions,
    setSessions,
    newSession,
    setNewSession,
    newEvent,
    setNewEvent,
    editingSessionPkgs,
    setEditingSessionPkgs,
    sessionPkgList,
    setSessionPkgList,
    editingSession,
    setEditingSession,
    sessionFlyerFile,
    setSessionFlyerFile,
    sessionFlyerPreview,
    setSessionFlyerPreview,
    editFlyerFile,
    setEditFlyerFile,
    editFlyerPreview,
    setEditFlyerPreview,
    editForm,
    setEditForm,
    sessionImageFile,
    setSessionImageFile,
    sessionImagePreview,
    setSessionImagePreview,
    eventImageFile,
    setEventImageFile,
    eventImagePreview,
    setEventImagePreview,
    editImageFile,
    setEditImageFile,
    editImagePreview,
    setEditImagePreview,
    uploadingEventImage,
    setUploadingEventImage,
    loadSessions,
    resolveEventImageUrl,
    handleSessionFlyerFileChange,
    handleEditFlyerFileChange,
    prepareWebsiteListing,
    handleCreateSession,
    handleEditSessionPkgs,
    handleSaveSessionPkgs,
    handleToggleSession,
    handleDeleteSession,
    handleStartEdit,
    handleSaveEdit,
    handleCreateEvent,
  };
}

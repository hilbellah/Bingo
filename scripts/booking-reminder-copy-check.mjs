import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const emailServiceUrl = pathToFileURL(path.join(repoRoot, 'server/src/services/email.js'));
const { getBookingReminderText } = await import(emailServiceUrl);

assert.equal(
  getBookingReminderText({
    session_type: 'special_bingo',
    is_special_event: 1,
    time: '14:30',
    event_description: 'Doors open 12:00 pm - MP Eary Birds start 2:30 pm',
  }),
  'This session begins at 2:30 PM. Doors open at 12:00 PM. Bring this booking reference with you.'
);

assert.equal(
  getBookingReminderText({
    session_type: 'regular_bingo',
    is_special_event: 0,
    time: '18:30',
  }),
  'Please arrive by 4:30 PM. Doors open one hour before the session starts. Bring this booking reference with you.'
);

assert.equal(
  getBookingReminderText({
    session_type: 'event',
    is_special_event: 1,
    time: '19:00',
  }),
  'This event begins at 7:00 PM. Doors open one hour before the event starts. Bring this event ticket reference with you.'
);

assert.equal(
  getBookingReminderText({
    session_type: 'special_bingo',
    is_special_event: 1,
    time: '14:30',
    event_description: '',
  }),
  'This session begins at 2:30 PM. Bring this booking reference with you.'
);

assert.ok(
  !getBookingReminderText({
    session_type: 'special_bingo',
    is_special_event: 1,
    time: '14:30',
    event_description: '',
  }).includes('4:30 PM'),
  'Special bingo reminders must not use the regular bingo 4:30 PM arrival copy.'
);

console.log('Booking reminder copy check passed.');

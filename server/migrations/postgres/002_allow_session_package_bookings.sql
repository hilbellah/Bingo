-- Booking items/add-ons can reference either global packages or session_packages.
-- The application resolves package names with LEFT JOINs against both tables, so
-- a foreign key to packages(id) rejects valid special/event session bookings.

ALTER TABLE booking_items
  DROP CONSTRAINT IF EXISTS booking_items_package_id_fkey;

ALTER TABLE booking_addons
  DROP CONSTRAINT IF EXISTS booking_addons_package_id_fkey;

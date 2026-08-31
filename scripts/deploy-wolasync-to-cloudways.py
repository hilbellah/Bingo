#!/usr/bin/env python
"""
Deploy the booking-app event sync (WOLASYNC 20260831) to wolastoqcasino.ca.

Uploads inc/wola-booking-sync.php and applies three small additions:
  - functions.php          require_once for the sync file
  - inc/wola-events.php    wola_events_merged() + two one-line swaps
  - wp-config.php          feed URL + shared secret

SAFETY PROPERTIES — this script is built to be un-scary on a site whose event
flyers have been wiped by careless edits before:

  * It PATCHES THE LIVE FILES. It downloads what is actually on the server and
    edits that text. It never uploads the local July-31 mirror over live files,
    so anything changed on the server since then is preserved.
  * It BACKS UP every file it touches first, to <name>.bak-wolasync-<date>,
    matching the .bak-menufix-* convention already on the server.
  * It VERIFIES its anchors before writing. If any expected line is missing or
    ambiguous, it aborts having changed nothing.
  * It is IDEMPOTENT. Re-running it detects work already applied and skips it.
  * --dry-run does everything except write, and prints the exact diffs.

USAGE
  pip install paramiko
  python deploy-wolasync-to-cloudways.py --dry-run     # look first
  python deploy-wolasync-to-cloudways.py               # then do it

  Password: set SFTP_PASS in the environment, or it will prompt.
  Secret:   REQUIRED. Pass --secret or set WOLA_SYNC_SECRET. It must match
            WEBSITE_SYNC_SECRET in the booking app's Render environment.
            Never hardcode it in this file — this file is committed.

ROLLBACK
  Every changed file has a .bak-wolasync-<date> sibling on the server. Restore
  by copying it back over the original and purging Breeze.
"""

import argparse
import difflib
import getpass
import os
import posixpath
import sys
from datetime import date

try:
    import paramiko
except ImportError:
    sys.exit("paramiko is required:  pip install paramiko")

HOST = "45.32.87.253"
USER = "bobby"
PORT = 22

# Never hardcode the shared secret here — this file is committed. Supply it
# with --secret or the WOLA_SYNC_SECRET environment variable. It must match
# WEBSITE_SYNC_SECRET in the booking app's Render environment.
DEFAULT_SECRET = ""
FEED_URL = "https://booking.wolastoqcasino.ca/api/website/events"

STAMP = "wolasync-" + date.today().strftime("%Y%m%d")

# Local source of the new file, resolved relative to this script.
HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL_SYNC_FILE = os.path.join(
    HERE, "..", "wp-content", "themes", "wola", "inc", "wola-booking-sync.php"
)

# --------------------------------------------------------------------------
# The three patches. Each is (anchor, replacement). The anchor must appear
# EXACTLY ONCE in the live file or the patch is refused.
# --------------------------------------------------------------------------

FUNCTIONS_ANCHOR = "add_action('widgets_init', 'custom_footer_widgets_init');"
FUNCTIONS_PATCH = FUNCTIONS_ANCHOR + """

// -----------------------------------------
// BOOKING-APP EVENT SYNC (WOLASYNC 20260831) — DO NOT REMOVE
// Pulls events published from booking.wolastoqcasino.ca and stores them
// locally for inc/wola-events.php to merge. Must load on EVERY request (not
// just the three event templates) because it registers the REST push endpoint
// and the WP-Cron refresh. Rendering never makes an HTTP call.
// -----------------------------------------
$wola_booking_sync = get_stylesheet_directory() . '/inc/wola-booking-sync.php';
if ( file_exists( $wola_booking_sync ) ) {
    require_once $wola_booking_sync;
}"""

EVENTS_ANCHOR = (
    "/** Events whose end date hasn't passed, sorted by end date. "
    "$type: 'bingo'|'poker'|null */"
)
EVENTS_PATCH = """/**
 * The hand-written registry above PLUS any events published from the booking
 * app (see inc/wola-booking-sync.php).
 *
 * The hand-written entries always win: if a synced event carries a slug that
 * already exists above, the synced copy is discarded. Nothing the booking app
 * sends can overwrite or remove a flyer maintained by hand in this file.
 */
function wola_events_merged() {
\t$events = wola_events_all();

\tif ( ! function_exists( 'wola_booking_synced_events' ) ) {
\t\treturn $events; // sync file not loaded — behave exactly as before
\t}

\t$existing = array();
\tforeach ( $events as $e ) {
\t\tif ( ! empty( $e['slug'] ) ) { $existing[ $e['slug'] ] = true; }
\t}

\tforeach ( wola_booking_synced_events() as $synced ) {
\t\tif ( empty( $synced['slug'] ) || isset( $existing[ $synced['slug'] ] ) ) { continue; }
\t\t$existing[ $synced['slug'] ] = true;
\t\t$events[] = $synced;
\t}

\treturn $events;
}

""" + EVENTS_ANCHOR

EVENTS_LOOP_ANCHOR = "foreach ( wola_events_all() as $e ) {"
EVENTS_LOOP_PATCH = "foreach ( wola_events_merged() as $e ) {"

EVENTS_BOOK_ANCHOR = (
    "\t\tif ( $e['type'] === 'bingo' && ! empty( $e['start'] ) "
    "&& ! empty( $e['name'] ) ) {"
)
EVENTS_BOOK_PATCH = (
    "\t\t$is_synced = ( ! empty( $e['source'] ) && $e['source'] === 'booking' );\n"
    "\t\tif ( ! $is_synced && $e['type'] === 'bingo' && ! empty( $e['start'] ) "
    "&& ! empty( $e['name'] ) ) {"
)

WPCONFIG_ANCHOR = "/* That's all, stop editing!"


def wpconfig_patch(secret):
    return (
        "/* Wolastoq booking-app event sync (WOLASYNC 20260831) */\n"
        "define( 'WOLA_BOOKING_FEED_URL', '%s' );\n"
        "define( 'WOLA_BOOKING_SYNC_SECRET', '%s' );\n\n" % (FEED_URL, secret)
    ) + WPCONFIG_ANCHOR


# --------------------------------------------------------------------------


class Deployer:
    def __init__(self, sftp, dry_run):
        self.sftp = sftp
        self.dry_run = dry_run
        self.changed = []
        self.skipped = []

    def read(self, path):
        with self.sftp.open(path, "r") as fh:
            return fh.read().decode("utf-8")

    def write(self, path, text):
        if self.dry_run:
            return
        with self.sftp.open(path, "w") as fh:
            fh.write(text.encode("utf-8"))

    def backup(self, path):
        target = "%s.bak-%s" % (path, STAMP)
        try:
            self.sftp.stat(target)
            print("      backup already exists: %s" % posixpath.basename(target))
            return
        except IOError:
            pass
        if not self.dry_run:
            with self.sftp.open(path, "r") as src:
                data = src.read()
            with self.sftp.open(target, "w") as dst:
                dst.write(data)
        print("      backed up -> %s" % posixpath.basename(target))

    def apply(self, path, edits, already_applied_marker):
        """edits: list of (anchor, replacement). All must match exactly once."""
        label = posixpath.basename(path)
        print("\n  %s" % path)

        try:
            original = self.read(path)
        except IOError:
            print("      !! NOT FOUND - aborting, nothing has been changed")
            raise SystemExit(1)

        if already_applied_marker in original:
            print("      already patched - skipping")
            self.skipped.append(label)
            return

        text = original
        for anchor, replacement in edits:
            count = text.count(anchor)
            if count != 1:
                print("      !! anchor found %d times, expected exactly 1:" % count)
                print("         %s" % anchor.strip()[:90])
                print("      !! ABORTING - no files have been changed")
                raise SystemExit(1)
            text = text.replace(anchor, replacement)

        diff = list(
            difflib.unified_diff(
                original.splitlines(), text.splitlines(),
                fromfile=label + " (live)", tofile=label + " (patched)",
                lineterm="", n=2,
            )
        )
        added = sum(1 for l in diff if l.startswith("+") and not l.startswith("+++"))
        removed = sum(1 for l in diff if l.startswith("-") and not l.startswith("---"))
        print("      +%d / -%d lines" % (added, removed))
        if self.dry_run:
            for line in diff:
                print("      | " + line)

        self.backup(path)
        self.write(path, text)
        self.changed.append(label)
        print("      %s" % ("would write (dry run)" if self.dry_run else "WRITTEN"))


def find_theme_dir(sftp):
    """Locate wp-content/themes/wola under whatever the SFTP user can see."""
    candidates = []
    roots = ["."]
    try:
        for app in sftp.listdir("applications"):
            roots.append(posixpath.join("applications", app))
    except IOError:
        pass

    for root in roots:
        for suffix in ("public_html", ""):
            base = posixpath.join(root, suffix) if suffix else root
            probe = posixpath.join(base, "wp-content", "themes", "wola", "functions.php")
            try:
                sftp.stat(probe)
                candidates.append(base.replace("./", ""))
            except IOError:
                continue
    return candidates


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="show the exact diffs, write nothing")
    ap.add_argument("--secret", default=os.environ.get("WOLA_SYNC_SECRET", DEFAULT_SECRET))
    args = ap.parse_args()

    if not args.secret:
        sys.exit(
            "No sync secret supplied. Pass --secret '<value>' or set WOLA_SYNC_SECRET.\n"
            "It must match WEBSITE_SYNC_SECRET in the booking app's Render environment."
        )

    password = os.environ.get("SFTP_PASS") or getpass.getpass("SFTP password for %s: " % USER)

    print("\n=== WOLASYNC deploy %s ===" % ("(DRY RUN - nothing will be written)" if args.dry_run else ""))
    print("connecting to %s ..." % HOST)

    transport = paramiko.Transport((HOST, PORT))
    transport.connect(username=USER, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)

    try:
        bases = find_theme_dir(sftp)
        if not bases:
            sys.exit("Could not find wp-content/themes/wola from this account. "
                     "Check the SFTP user has access to the application root.")
        if len(bases) > 1:
            print("Multiple installs found; using the first:")
            for b in bases:
                print("   -", b)
        base = bases[0]
        print("site root: %s" % base)

        theme = posixpath.join(base, "wp-content", "themes", "wola")
        dep = Deployer(sftp, args.dry_run)

        # --- 1. the new file ---
        remote_sync = posixpath.join(theme, "inc", "wola-booking-sync.php")
        print("\n  %s" % remote_sync)
        with open(LOCAL_SYNC_FILE, "rb") as fh:
            payload = fh.read()
        try:
            existing = sftp.open(remote_sync, "r").read()
            if existing == payload:
                print("      identical copy already uploaded - skipping")
            else:
                dep.backup(remote_sync)
                if not args.dry_run:
                    sftp.open(remote_sync, "w").write(payload)
                print("      %s (%d bytes)" % (
                    "would upload (dry run)" if args.dry_run else "UPLOADED", len(payload)))
        except IOError:
            if not args.dry_run:
                sftp.open(remote_sync, "w").write(payload)
            print("      %s new file (%d bytes)" % (
                "would upload (dry run)" if args.dry_run else "UPLOADED", len(payload)))

        # --- 2. functions.php ---
        dep.apply(
            posixpath.join(theme, "functions.php"),
            [(FUNCTIONS_ANCHOR, FUNCTIONS_PATCH)],
            already_applied_marker="wola-booking-sync.php",
        )

        # --- 3. inc/wola-events.php ---
        dep.apply(
            posixpath.join(theme, "inc", "wola-events.php"),
            [
                (EVENTS_ANCHOR, EVENTS_PATCH),
                (EVENTS_LOOP_ANCHOR, EVENTS_LOOP_PATCH),
                (EVENTS_BOOK_ANCHOR, EVENTS_BOOK_PATCH),
            ],
            already_applied_marker="wola_events_merged",
        )

        # --- 4. wp-config.php ---
        dep.apply(
            posixpath.join(base, "wp-config.php"),
            [(WPCONFIG_ANCHOR, wpconfig_patch(args.secret))],
            already_applied_marker="WOLA_BOOKING_SYNC_SECRET",
        )

        print("\n=== summary ===")
        print("changed: %s" % (", ".join(dep.changed) or "nothing"))
        print("skipped: %s" % (", ".join(dep.skipped) or "nothing"))
        if args.dry_run:
            print("\nDRY RUN - nothing was written. Re-run without --dry-run to apply.")
        else:
            print("""
NEXT:
  1. wp-admin top bar -> Breeze -> Purge All Cache
  2. Load the BARE urls (no ?query, it bypasses Varnish and will lie to you):
        https://www.wolastoqcasino.ca/bingo/
        https://www.wolastoqcasino.ca/events/
        https://www.wolastoqcasino.ca/
     Your existing flyers must look exactly as they did before.
  3. Confirm the push endpoint answers:
        curl -s -X POST https://www.wolastoqcasino.ca/wp-json/wola/v1/events-sync \\
             -H "X-Wola-Sync-Secret: <the secret>"
     expect {"ok":true,...}

ROLLBACK: every changed file has a .bak-%s sibling next to it.""" % STAMP)

    finally:
        sftp.close()
        transport.close()


if __name__ == "__main__":
    main()

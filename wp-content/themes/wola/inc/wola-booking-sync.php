<?php
/**
 * Wolastoq Casino — booking-app event sync (WOLASYNC 20260831)
 * ------------------------------------------------------------
 * Pulls the events an admin has explicitly published from the booking app
 * (booking.wolastoqcasino.ca) and hands them to inc/wola-events.php, which
 * merges them with the hand-written registry there.
 *
 * DESIGN RULES — these exist because event flyers have vanished sitewide
 * before, and this file must never be the cause of it happening again:
 *
 *   1. RENDERING NEVER MAKES AN HTTP REQUEST. Templates read a stored option
 *      only. If the booking app is slow, down, or moved, page rendering is
 *      completely unaffected.
 *   2. THE LAST GOOD COPY IS KEPT FOREVER. A failed refresh leaves the stored
 *      events exactly as they were. Events only disappear when the booking app
 *      successfully says they are gone.
 *   3. THE HAND-WRITTEN REGISTRY ALWAYS WINS. If a synced event and a manual
 *      event share a slug, the manual one in inc/wola-events.php is kept.
 *      Nothing the booking app sends can overwrite a hand-tuned flyer.
 *
 * Refreshes happen two ways:
 *   - Push: the booking app POSTs to /wp-json/wola/v1/events-sync the moment
 *     an admin publishes, edits or unpublishes an event. This also purges
 *     Breeze/Varnish, so the flyer is live in seconds.
 *   - Pull: a WP-Cron job every ten minutes, as a safety net if a push is
 *     missed (site down for a deploy, network blip, secret rotated).
 *
 * CONFIGURATION — add to wp-config.php:
 *   define( 'WOLA_BOOKING_FEED_URL', 'https://booking.wolastoqcasino.ca/api/website/events' );
 *   define( 'WOLA_BOOKING_SYNC_SECRET', '<long random string>' );
 * The secret must match WEBSITE_SYNC_SECRET in the booking app's Render env.
 * Without the secret the push endpoint refuses every request; the pull still
 * works, so the site degrades to "up to ten minutes behind", never to broken.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'WOLA_BOOKING_SYNC_OPTION', 'wola_booking_events' );
define( 'WOLA_BOOKING_SYNC_META_OPTION', 'wola_booking_events_meta' );
define( 'WOLA_BOOKING_SYNC_CRON_HOOK', 'wola_booking_sync_refresh' );

/** Feed URL, overridable from wp-config.php. */
function wola_booking_sync_feed_url() {
	if ( defined( 'WOLA_BOOKING_FEED_URL' ) && WOLA_BOOKING_FEED_URL ) {
		return WOLA_BOOKING_FEED_URL;
	}
	return 'https://booking.wolastoqcasino.ca/api/website/events';
}

/**
 * The stored events. Pure option read — no network, no exceptions, safe to
 * call from any template on any request.
 *
 * @return array Event arrays shaped exactly like wola_events_all() entries.
 */
function wola_booking_synced_events() {
	$events = get_option( WOLA_BOOKING_SYNC_OPTION, array() );
	return is_array( $events ) ? $events : array();
}

/** Diagnostics for the admin notice: last attempt, last success, last error. */
function wola_booking_sync_meta() {
	$meta = get_option( WOLA_BOOKING_SYNC_META_OPTION, array() );
	return is_array( $meta ) ? $meta : array();
}

function wola_booking_sync_record_meta( $patch ) {
	update_option( WOLA_BOOKING_SYNC_META_OPTION, array_merge( wola_booking_sync_meta(), $patch ), false );
}

/**
 * Scrub one event from the feed.
 *
 * The theme echoes several of these fields as raw HTML (lead, name_hl, and the
 * detail rows), so everything is filtered here rather than trusted. An event
 * missing anything structural is dropped instead of rendered half-formed.
 *
 * @return array|null Sanitised event, or null if unusable.
 */
function wola_booking_sync_sanitize_event( $raw ) {
	if ( ! is_array( $raw ) ) { return null; }

	$slug = isset( $raw['slug'] ) ? sanitize_title( $raw['slug'] ) : '';
	$img  = isset( $raw['img'] ) ? esc_url_raw( $raw['img'] ) : '';
	$name = isset( $raw['name'] ) ? sanitize_text_field( $raw['name'] ) : '';

	// A flyer, a name, a slug and a date are the minimum for a renderable
	// poster. Anything short of that is a bug upstream — skip it silently
	// rather than print a broken card on the live site.
	if ( ! $slug || ! $img || ! $name ) { return null; }
	if ( empty( $raw['start'] ) || empty( $raw['end'] ) ) { return null; }

	$start = sanitize_text_field( $raw['start'] );
	$end   = sanitize_text_field( $raw['end'] );
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $start ) ) { return null; }
	if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $end ) ) { return null; }

	$rows = array();
	if ( ! empty( $raw['rows'] ) && is_array( $raw['rows'] ) ) {
		foreach ( $raw['rows'] as $row ) {
			if ( ! is_array( $row ) || count( $row ) < 2 ) { continue; }
			$label = wp_kses_post( (string) $row[0] );
			$value = wp_kses_post( (string) $row[1] );
			if ( $label === '' || $value === '' ) { continue; }
			$rows[] = array( $label, $value );
		}
	}

	$book = isset( $raw['book'] ) ? esc_url_raw( $raw['book'] ) : '';
	if ( ! $book ) { $book = 'https://booking.wolastoqcasino.ca'; }

	return array(
		'slug'    => $slug,
		'type'    => 'bingo',
		'source'  => 'booking', // marks it as synced; wola_events_upcoming()
		                        // leaves its booking link alone.
		'name'    => $name,
		'name_hl' => isset( $raw['name_hl'] ) ? wp_kses_post( $raw['name_hl'] ) : $name,
		'start'   => $start,
		'end'     => $end,
		'badge'   => isset( $raw['badge'] ) ? wp_kses_post( $raw['badge'] ) : '',
		'chip_b'  => isset( $raw['chip_b'] ) ? sanitize_text_field( $raw['chip_b'] ) : '',
		'chip_s'  => isset( $raw['chip_s'] ) ? sanitize_text_field( $raw['chip_s'] ) : $name,
		'datefmt' => isset( $raw['datefmt'] ) ? sanitize_text_field( $raw['datefmt'] ) : '',
		'img'     => $img,
		'alt'     => isset( $raw['alt'] ) ? sanitize_text_field( $raw['alt'] ) : $name,
		'blurb'   => isset( $raw['blurb'] ) ? wp_kses_post( $raw['blurb'] ) : '',
		'kicker'  => isset( $raw['kicker'] ) ? wp_kses_post( $raw['kicker'] ) : '',
		'lead'    => isset( $raw['lead'] ) ? wp_kses_post( $raw['lead'] ) : '',
		'rows'    => $rows,
		'link'    => '/events/#we-ev-' . $slug,
		'book'    => $book,
		'prize'   => isset( $raw['prize'] ) ? absint( $raw['prize'] ) : 0,
	);
}

/**
 * Fetch the feed and store it.
 *
 * On any failure the previously stored events are left untouched, so a bad
 * network moment can never blank the flyers on the live site.
 *
 * @return array {ok: bool, count: int, error: string}
 */
function wola_booking_sync_pull() {
	wola_booking_sync_record_meta( array( 'last_attempt' => current_time( 'mysql' ) ) );

	$response = wp_remote_get( wola_booking_sync_feed_url(), array(
		'timeout'   => 10,
		'headers'   => array( 'Accept' => 'application/json' ),
		'sslverify' => true,
	) );

	if ( is_wp_error( $response ) ) {
		$error = $response->get_error_message();
		wola_booking_sync_record_meta( array( 'last_error' => $error ) );
		return array( 'ok' => false, 'count' => 0, 'error' => $error );
	}

	$code = (int) wp_remote_retrieve_response_code( $response );
	if ( $code !== 200 ) {
		$error = 'Booking feed returned HTTP ' . $code;
		wola_booking_sync_record_meta( array( 'last_error' => $error ) );
		return array( 'ok' => false, 'count' => 0, 'error' => $error );
	}

	$payload = json_decode( wp_remote_retrieve_body( $response ), true );
	if ( ! is_array( $payload ) || ! isset( $payload['events'] ) || ! is_array( $payload['events'] ) ) {
		$error = 'Booking feed did not return an events list';
		wola_booking_sync_record_meta( array( 'last_error' => $error ) );
		return array( 'ok' => false, 'count' => 0, 'error' => $error );
	}

	$events = array();
	foreach ( $payload['events'] as $raw ) {
		$event = wola_booking_sync_sanitize_event( $raw );
		if ( $event ) { $events[] = $event; }
	}

	// An empty list is a legitimate answer (nothing published right now), and
	// it only ever clears SYNCED events — the hand-written registry in
	// inc/wola-events.php is a separate array this never touches.
	update_option( WOLA_BOOKING_SYNC_OPTION, $events, false );
	wola_booking_sync_record_meta( array(
		'last_success' => current_time( 'mysql' ),
		'last_count'   => count( $events ),
		'last_error'   => '',
	) );

	return array( 'ok' => true, 'count' => count( $events ), 'error' => '' );
}

/**
 * Purge Breeze and the Cloudways Varnish layer in front of it.
 *
 * Editing content is not enough on this host: the page HTML is cached twice
 * over, and Varnish keeps a separate mobile copy. Without this, a freshly
 * published flyer would not appear until the cache happened to expire.
 */
function wola_booking_sync_purge_caches() {
	// Breeze exposes several purge entry points across versions; fire the ones
	// that exist and ignore the rest.
	do_action( 'breeze_clear_all_cache' );

	if ( class_exists( 'Breeze_PurgeCache' ) ) {
		if ( method_exists( 'Breeze_PurgeCache', 'breeze_cache_flush' ) ) {
			Breeze_PurgeCache::breeze_cache_flush();
		}
	}
	if ( class_exists( 'Breeze_PurgeVarnish' ) ) {
		$varnish = new Breeze_PurgeVarnish();
		if ( method_exists( $varnish, 'purge_cache' ) ) {
			$varnish->purge_cache();
		}
	}
	if ( function_exists( 'wp_cache_flush' ) ) {
		wp_cache_flush();
	}
}

// ---------------------------------------------------------------------------
// Push endpoint — the booking app calls this the moment something changes.
// ---------------------------------------------------------------------------

add_action( 'rest_api_init', function () {
	register_rest_route( 'wola/v1', '/events-sync', array(
		'methods'             => 'POST',
		'callback'            => 'wola_booking_sync_rest_handler',
		'permission_callback' => 'wola_booking_sync_rest_permission',
	) );
} );

/** Shared-secret check. Timing-safe, and closed by default. */
function wola_booking_sync_rest_permission( $request ) {
	if ( ! defined( 'WOLA_BOOKING_SYNC_SECRET' ) || ! WOLA_BOOKING_SYNC_SECRET ) {
		return new WP_Error( 'wola_sync_disabled', 'Booking sync secret is not configured.', array( 'status' => 503 ) );
	}
	$provided = (string) $request->get_header( 'x-wola-sync-secret' );
	if ( ! $provided || ! hash_equals( (string) WOLA_BOOKING_SYNC_SECRET, $provided ) ) {
		return new WP_Error( 'wola_sync_forbidden', 'Invalid sync secret.', array( 'status' => 403 ) );
	}
	return true;
}

function wola_booking_sync_rest_handler( $request ) {
	$result = wola_booking_sync_pull();
	if ( $result['ok'] ) {
		wola_booking_sync_purge_caches();
	}
	return rest_ensure_response( array(
		'ok'      => $result['ok'],
		'events'  => $result['count'],
		'error'   => $result['error'],
		'purged'  => $result['ok'],
		'reason'  => sanitize_text_field( (string) $request->get_param( 'reason' ) ),
	) );
}

// ---------------------------------------------------------------------------
// Pull safety net — every ten minutes, in case a push was missed.
// ---------------------------------------------------------------------------

add_filter( 'cron_schedules', function ( $schedules ) {
	if ( ! isset( $schedules['wola_ten_minutes'] ) ) {
		$schedules['wola_ten_minutes'] = array(
			'interval' => 600,
			'display'  => __( 'Every ten minutes (Wolastoq booking sync)' ),
		);
	}
	return $schedules;
} );

add_action( 'init', function () {
	if ( ! wp_next_scheduled( WOLA_BOOKING_SYNC_CRON_HOOK ) ) {
		wp_schedule_event( time() + 60, 'wola_ten_minutes', WOLA_BOOKING_SYNC_CRON_HOOK );
	}
} );

add_action( WOLA_BOOKING_SYNC_CRON_HOOK, 'wola_booking_sync_pull' );

// ---------------------------------------------------------------------------
// Admin visibility — so a silently failing sync is noticed.
// ---------------------------------------------------------------------------

add_action( 'admin_notices', function () {
	if ( ! current_user_can( 'manage_options' ) ) { return; }
	$meta = wola_booking_sync_meta();
	if ( empty( $meta['last_error'] ) ) { return; }
	$last_ok = ! empty( $meta['last_success'] ) ? $meta['last_success'] : 'never';
	printf(
		'<div class="notice notice-warning"><p><strong>Wolastoq booking sync:</strong> %s<br>Last successful sync: %s. Flyers already on the site are still showing — they are stored locally and are not affected.</p></div>',
		esc_html( $meta['last_error'] ),
		esc_html( $last_ok )
	);
} );

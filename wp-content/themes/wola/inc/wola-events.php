<?php
/**
 * Wolastoq Casino — central event registry (WOLAEVENTS 20260722)
 * ---------------------------------------------------------------
 * ONE place to manage event banners. Each event has an 'end' date;
 * after that date it stops rendering EVERYWHERE automatically
 * (bingo page banners, /events/ sections, homepage cards).
 *
 * TO ADD AN EVENT: copy a block below, update fields, upload flyer
 * to /wp-content/uploads/bingo-redesign/, purge Breeze cache.
 * TO REMOVE EARLY: delete its block (or set 'end' to a past date).
 */

if ( ! function_exists( 'wola_events_all' ) ) {

function wola_events_all() {
	$img  = 'https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/';
	$evt  = 'https://www.wolastoqcasino.ca/wp-content/uploads/events/';
	$book = 'https://booking.wolastoqcasino.ca';

	return array(

	array(
		'slug'=>'acpc', 'type'=>'poker',
		'name'=>'ACPC Summer Series &mdash; $700 Main Event',
		'start'=>'2026-07-22', 'end'=>'2026-07-26',
		'badge'=>'July 22, 23 &amp; 26', 'chip_b'=>'Jul 22&ndash;26', 'chip_s'=>'ACPC $700 Main Event',
		'img'=>$evt.'acpc-summer-series.jpg',
		'alt'=>'ACPC Summer Series $700 Main Event poker championship, July 22, 23 and 26, at Wolastoq Casino',
		'blurb'=>'A belt for each champion &middot; KKPoker qualifiers $20/night &middot; hybrid live + online.',
		'link'=>'/events/#we-acpc', 'book'=>'/poker/', 'prize'=>0,
	),

	array(
		'slug'=>'nb-day', 'type'=>'bingo', 'booking_window_days'=>7,
		'name'=>'NB Day Bingo', 'name_hl'=>'NB Day <span>Bingo</span>',
		'start'=>'2026-08-02', 'end'=>'2026-08-02',
		'badge'=>'Sunday &middot; August 2', 'chip_b'=>'Aug 2', 'chip_s'=>'NB Day Bingo',
		'datefmt'=>'Sunday, August 2, 2026',
		'img'=>$img.'nb-day-bingo-aug2.jpg',
		'alt'=>'NB Day Bingo at Wolastoq Casino, Sunday August 2 2026 — $650 regular games, doors open 3:00 PM. Reserve your seat and cards online. Bingo passes not accepted on this date.',
		'blurb'=>'$650 regular games &middot; doors 3:00 PM &middot; celebrate New Brunswick Day at the hall.',
		'kicker'=>'Celebrate New Brunswick Day',
		'lead'=>'Celebrate New Brunswick Day the Wolastoq way &mdash; a full session with <strong>$650 regular games</strong>. Reserve your seat and purchase your cards online before you arrive.',
		'rows'=>array(
			array('Regular Games','$650'),
			array('Doors Open','3:00 PM'),
			array('Book Online','Reserve your seat and cards at booking.wolastoqcasino.ca'),
			array('Please Note','Bingo passes will not be accepted on this date'),
		),
		'link'=>'/events/#we-ev-nb-day', 'book'=>$book, 'prize'=>650,
	),

	array(
		'slug'=>'bigger-bank', 'type'=>'bingo',
		'name'=>'Bigger Bank Bingo', 'name_hl'=>'Bigger Bank <span>Bingo</span>',
		'start'=>'2026-08-23', 'end'=>'2026-08-23',
		'badge'=>'Sunday &middot; August 23', 'chip_b'=>'Aug 23', 'chip_s'=>'Bigger Bank Bingo',
		'datefmt'=>'Sunday, August 23, 2026',
		'img'=>$img.'bigger-bank-bingo-aug23-v3.jpg',
		'alt'=>'Bigger Bank Bingo at Wolastoq Casino, Sunday August 23 2026 — $2,000 regular games, $2,999 specials, $15,000 full card jackpot. $150 ticket includes 9 UP book, early bird and meal ticket. PHD $75. Tickets online only at booking.wolastoqcasino.ca until 10:00 AM August 23. Doors 12:00 PM, games 2:00 PM.',
		'blurb'=>'$2,000 regular games &middot; $2,999 specials &middot; <strong>$15,000 full card jackpot</strong> &middot; tickets online only.',
		'kicker'=>'Play Big, Win Bigger',
		'lead'=>'Our biggest bingo payday of the summer &mdash; <strong>$2,000 regular games</strong>, <strong>$2,999 specials</strong> and a <strong>$15,000 full card jackpot</strong>. Tickets and PHD are <strong>available online only</strong>.',
		'rows'=>array(
			array('Ticket','$150 &mdash; 9 UP Book (Regular &amp; Specials), 1 Early Bird &amp; 1 Meal Ticket'),
			array('PHD','$75 &mdash; 50 Face Regular &amp; Specials <em>(online ticket purchase only)</em>'),
			array('Online Sales','Until 10:00 AM, August 23'),
			array('Doors &amp; Meal','12:00 PM &middot; Games begin 2:00 PM'),
			array('Walk-Ins','If available, at 12:00 PM'),
		),
		'link'=>'/events/#we-ev-bigger-bank', 'book'=>$book, 'prize'=>15000,
	),

	array(
		'slug'=>'labor-day', 'type'=>'bingo', 'booking_window_days'=>7,
		'name'=>'Labor Day Bingo', 'name_hl'=>'Labor Day <span>Bingo</span>',
		'start'=>'2026-09-07', 'end'=>'2026-09-07',
		'badge'=>'Sunday &middot; September 7', 'chip_b'=>'Sep 7', 'chip_s'=>'Labor Day Bingo',
		'datefmt'=>'Sunday, September 7, 2026',
		'img'=>$img.'labor-day-bingo-sep7.jpg',
		'alt'=>'Labor Day Bingo at Wolastoq Casino, Sunday September 7 2026 — $650 regular games. Doors 3:00 PM, MP early birds 6:00 PM, regular games 6:30 PM. Reserve seats and cards online. Bingo passes not accepted on this date.',
		'blurb'=>'$650 regular games &middot; early birds 6:00 PM &middot; games 6:30 PM.',
		'kicker'=>'Thank You for Your Hard Work',
		'lead'=>'Take the long weekend to play &mdash; Labor Day Bingo brings <strong>$650 regular games</strong> and a full evening session. Reserve your seat and cards online.',
		'rows'=>array(
			array('Regular Games','$650'),
			array('Doors Open','3:00 PM'),
			array('MP Early Birds','6:00 PM'),
			array('Regular Games Begin','6:30 PM'),
			array('Please Note','Bingo passes will not be accepted on this date'),
		),
		'link'=>'/events/#we-ev-labor-day', 'book'=>$book, 'prize'=>650,
	),

	array(
		'slug'=>'kklive', 'type'=>'poker',
		'name'=>'KK Live Maritimes &mdash; Live Day 2 Finale',
		'start'=>'2026-06-21', 'end'=>'2026-09-20',
		'badge'=>'Series &middot; Finale Sep 20', 'chip_b'=>'Sep 20', 'chip_s'=>'KK Live Finale',
		'img'=>'https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/poker.png',
		'alt'=>'KK Live Maritimes poker series at the Wolastoq Poker Room — satellites and online flights leading to the Live Day 2 finale September 20',
		'blurb'=>'Satellites &amp; online flights all summer &mdash; Live Day 2 finale September 20.',
		'link'=>'/events/#we-kklive', 'book'=>'/poker/', 'prize'=>0,
	),

	array(
		'slug'=>'thanksgiving', 'type'=>'bingo', 'booking_window_days'=>7,
		'name'=>'Thanksgiving Bingo', 'name_hl'=>'Thanksgiving <span>Bingo</span>',
		'start'=>'2026-10-13', 'end'=>'2026-10-13',
		'badge'=>'Tuesday &middot; October 13', 'chip_b'=>'Oct 13', 'chip_s'=>'Thanksgiving Bingo',
		'datefmt'=>'Tuesday, October 13, 2026',
		'img'=>$img.'thanksgiving-bingo-oct13.jpg',
		'alt'=>'Thanksgiving Bingo at Wolastoq Casino, Tuesday October 13 2026 — $650 regular games. Doors 3:00 PM, MP early birds 6:00 PM, regular games 6:30 PM. Reserve seats and cards online. Bingo passes not accepted on this date.',
		'blurb'=>'$650 regular games &middot; early birds 6:00 PM &middot; games 6:30 PM.',
		'kicker'=>'Happy Thanksgiving',
		'lead'=>'Gather the family for a Thanksgiving tradition with a twist &mdash; <strong>$650 regular games</strong> and a full evening of bingo. Reserve your seat and cards online.',
		'rows'=>array(
			array('Regular Games','$650'),
			array('Doors Open','3:00 PM'),
			array('MP Early Birds','6:00 PM'),
			array('Regular Games Begin','6:30 PM'),
			array('Please Note','Bingo passes will not be accepted on this date'),
		),
		'link'=>'/events/#we-ev-thanksgiving', 'book'=>$book, 'prize'=>650,
	),

	array(
		'slug'=>'anniversary-30', 'type'=>'bingo', 'booking_title'=>'Anniversary Bingo',
		'name'=>'30th Bingo Anniversary', 'name_hl'=>'30th Bingo <span>Anniversary</span>',
		'start'=>'2026-10-17', 'end'=>'2026-10-17',
		'badge'=>'Saturday &middot; October 17', 'chip_b'=>'Oct 17', 'chip_s'=>'30th Bingo Anniversary',
		'datefmt'=>'Saturday, October 17, 2026',
		'img'=>$img.'bingo-30th-anniversary-oct17-v2.jpg',
		'alt'=>'Wolastoq Casino 30th Bingo Anniversary, Saturday October 17 2026 — $75 ticket includes 9UP, 1 MP early birds, toonie and meal. PHD number 6 for $60. Regular games $1,500, $3,000 anniversary special, $5,000 jackpot to go. Tickets online only until 10:00 AM October 17. Doors 12:00 PM, games 2:00 PM. Bingo passes not accepted.',
		'blurb'=>'$1,500 regular games &middot; $3,000 anniversary special &middot; $5,000 jackpot to go &middot; online only.',
		'kicker'=>'Join the Celebration &mdash; 30 Years of Bingo',
		'lead'=>'Three decades of dabbers, daubs and big wins &mdash; celebrate with <strong>$1,500 regular games</strong>, a <strong>$3,000 anniversary special</strong> and a <strong>$5,000 jackpot to go</strong>. Tickets are <strong>available online only</strong>.',
		'rows'=>array(
			array('Ticket','$75 &mdash; 9UP, 1 MP Early Birds, Toonie &amp; Meal'),
			array('PHD','#6 for $60'),
			array('Online Sales','Until 10:00 AM, October 17'),
			array('Doors &amp; Meal','12:00 PM &middot; Games begin 2:00 PM &middot; Walk-in sales at 12:00 PM'),
			array('Please Note','Bingo passes will not be accepted on this date'),
		),
		'link'=>'/events/#we-ev-anniversary-30', 'book'=>$book, 'prize'=>5000,
	),

	array(
		'slug'=>'halloween', 'type'=>'bingo', 'booking_window_days'=>7,
		'name'=>'Halloween Bingo', 'name_hl'=>'Halloween <span>Bingo</span>',
		'start'=>'2026-10-30', 'end'=>'2026-10-30',
		'badge'=>'Friday &middot; October 30', 'chip_b'=>'Oct 30', 'chip_s'=>'Halloween Bingo',
		'datefmt'=>'Friday, October 30, 2026',
		'img'=>$img.'halloween-bingo-oct30.jpg',
		'alt'=>'Halloween Bingo at Wolastoq Casino, Friday October 30 2026 — $700 regular games, costume contest with prizes for 1st, 2nd and 3rd. Doors 2:00 PM, MP early birds 5:00 PM, regular games 5:30 PM. Reserve seats and cards online. Bingo passes not accepted.',
		'blurb'=>'$700 regular games &middot; costume contest &middot; games 5:30 PM.',
		'kicker'=>'Spooky Season at the Hall',
		'lead'=>'Dress to impress &mdash; Halloween Bingo brings <strong>$700 regular games</strong> and a <strong>costume contest</strong> with prizes for 1st, 2nd and 3rd. Reserve your seat and cards online.',
		'rows'=>array(
			array('Regular Games','$700'),
			array('Doors Open','2:00 PM'),
			array('MP Early Birds','5:00 PM'),
			array('Regular Games Begin','5:30 PM'),
			array('Costume Contest','Prizes for 1st, 2nd &amp; 3rd place'),
			array('Please Note','Bingo passes will not be accepted on this date'),
		),
		'link'=>'/events/#we-ev-halloween', 'book'=>$book, 'prize'=>700,
	),

	);
}

/** Holiday rotation bingos open for booking only inside their configured rolling window. */
function wola_event_booking_opens_on( $event ) {
	$days = isset( $event['booking_window_days'] ) ? (int) $event['booking_window_days'] : 0;
	if ( $days < 1 || empty( $event['start'] ) ) { return ''; }
	$tz = function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'America/Moncton' );
	$opens = new DateTime( $event['start'] . ' 00:00:00', $tz );
	$opens->modify( '-' . $days . ' days' );
	return $opens->format( 'Y-m-d' );
}

function wola_event_booking_is_open( $event ) {
	$opens_on = wola_event_booking_opens_on( $event );
	if ( ! $opens_on ) { return true; }
	$tz = function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'America/Moncton' );
	$today = ( new DateTime( 'now', $tz ) )->format( 'Y-m-d' );
	return $today >= $opens_on;
}

function wola_event_booking_opens_label( $event ) {
	$opens_on = wola_event_booking_opens_on( $event );
	if ( ! $opens_on ) { return ''; }
	$tz = function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'America/Moncton' );
	return ( new DateTime( $opens_on . ' 00:00:00', $tz ) )->format( 'F j, Y' );
}

/**
 * The hand-written registry above PLUS any events published from the booking
 * app (see inc/wola-booking-sync.php).
 *
 * The hand-written entries always win: if a synced event carries a slug that
 * already exists above, the synced copy is discarded. Nothing the booking app
 * sends can overwrite or remove a flyer maintained by hand in this file.
 */
function wola_events_merged() {
	$events = wola_events_all();

	if ( ! function_exists( 'wola_booking_synced_events' ) ) {
		return $events; // sync file not loaded — behave exactly as before
	}

	$existing = array();
	foreach ( $events as $e ) {
		if ( ! empty( $e['slug'] ) ) { $existing[ $e['slug'] ] = true; }
	}

	foreach ( wola_booking_synced_events() as $synced ) {
		if ( empty( $synced['slug'] ) || isset( $existing[ $synced['slug'] ] ) ) { continue; }
		$existing[ $synced['slug'] ] = true;
		$events[] = $synced;
	}

	return $events;
}

/** Events whose end date hasn't passed, sorted by end date. $type: 'bingo'|'poker'|null */
function wola_events_upcoming( $type = null ) {
	$tz    = function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'America/Moncton' );
	$today = ( new DateTime( 'now', $tz ) )->format( 'Y-m-d' );
	$out   = array();
	foreach ( wola_events_merged() as $e ) {
		if ( $e['end'] < $today ) { continue; }
		if ( $type && $e['type'] !== $type ) { continue; }
		$is_synced = ( ! empty( $e['source'] ) && $e['source'] === 'booking' );
		if ( ! $is_synced && $e['type'] === 'bingo' && ! empty( $e['start'] ) && ! empty( $e['name'] ) ) {
			$booking_title = ! empty( $e['booking_title'] ) ? $e['booking_title'] : $e['name'];
			$event_title = html_entity_decode( wp_strip_all_tags( $booking_title ), ENT_QUOTES, 'UTF-8' );
			$e['book'] = add_query_arg( array(
				'sessionDate' => $e['start'],
				'eventTitle'  => $event_title,
			), $e['book'] );
		}
		$out[] = $e;
	}
	usort( $out, function ( $a, $b ) { return strcmp( $a['end'], $b['end'] ); } );
	return $out;
}

/** Is a specific event still live (not past its end date)? */
function wola_event_is_live( $slug ) {
	foreach ( wola_events_upcoming() as $e ) {
		if ( $e['slug'] === $slug ) { return true; }
	}
	return false;
}

/** Biggest advertised bingo prize among upcoming events, e.g. "$15,000" */
function wola_events_top_prize() {
	$max = 0;
	foreach ( wola_events_upcoming( 'bingo' ) as $e ) {
		if ( ! empty( $e['prize'] ) && $e['prize'] > $max ) { $max = $e['prize']; }
	}
	return $max > 0 ? '$' . number_format( $max ) : '';
}

}

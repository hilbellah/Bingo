<?php
/**
 * Wolastoq Casino — Events (beautified, poster edition) — PREVIEW
 * Served at /events-preview/ via template_redirect. Scoped to #wola-events.
 */
require_once get_stylesheet_directory() . '/inc/wola-events.php'; // WOLAEVENTS 20260731 restored — DO NOT REMOVE: auto-expiring bingo flyers
get_header();
$cd  = 'https://www.wolastoqcasino.ca/wp-content/uploads/';
$evt = $cd . 'events/';
$bng = $cd . 'bingo-redesign/';
$flr = $cd . 'casino-2026/floor/';
$rew = $cd . 'rewards/';
?>
<div id="wola-events">

  <!-- HERO -->
  <section class="we-hero">
    <div class="we-hero-bg" style="background-image:url('<?php echo $bng; ?>poker.png');"></div>
    <div class="we-hero-veil"></div>
    <canvas class="we-fx" data-wefx data-intensity="2" data-interval="200" aria-hidden="true"></canvas>
    <div class="we-hero-inner">
      <p class="we-eyebrow">&#9733; Upcoming Events &middot; Wolastoq Casino</p>
      <h1 class="we-title">A Summer of Events<br><span>at Wolastoq Casino</span></h1>
      <p class="we-tag">This summer Wolastoq Casino sponsors the <strong>FredRod Show &rsquo;n Shine</strong> and hosts its Sock&nbsp;Hop after party on <strong>August&nbsp;7&ndash;9</strong> &mdash; while the Wolastoq Poker Room runs the <strong>KK Live Maritimes</strong> series all the way to the September&nbsp;20 finale.</p>
      <div class="we-hero-cta">
        <a class="we-btn we-btn-gold" href="#we-fredrod">See the Events</a>
        <a class="we-btn we-btn-ghost" href="tel:5064627689">Poker Room: (506) 462-7689</a>
      </div>
    </div>
    <div class="we-hero-stats">
      <div><b>Aug 7&ndash;9</b><span>FredRod Sock Hop</span></div>
      <div><b>Aug&ndash;Sep</b><span>KK Live Maritimes</span></div>
      <div><b>Sep 20</b><span>Live Day 2 Finale</span></div>
    </div>
  </section>

  <!-- SEO INTRO -->
  <section class="we-intro">
    <div class="we-wrap we-reveal">
      <p class="we-kicker">Live Events in Fredericton</p>
      <h2 class="we-h2">What&rsquo;s On at Wolastoq Casino</h2>
      <p class="we-lead">There&rsquo;s always something happening at Wolastoq Casino. This summer we&rsquo;re proud to sponsor the <strong>FredRod Show &rsquo;n Shine 2026</strong> and host its <strong>Sock Hop themed after party</strong> with Eddie Chase &amp; Graffiti Four on <strong>August&nbsp;7&ndash;9</strong>. Meanwhile the <strong>Wolastoq Poker Room</strong> runs live poker seven days a week, headlined by the <strong>KK Live Maritimes</strong> series &mdash; satellites and online Day&nbsp;1 flights building toward the <strong>Live Day&nbsp;2 finale on September&nbsp;20</strong>. Everything you need &mdash; schedules, buy-ins and how to enter &mdash; is below.</p>
    </div>
  </section>

  <!-- FREDROD SHOW 'N SHINE + SOCK HOP AFTER PARTY -->
  <section class="we-poster" id="we-fredrod">
    <div class="we-wrap we-reveal">
      <div class="we-poster-grid">
        <div class="we-poster-img">
          <img loading="lazy" src="<?php echo $evt; ?>fredrod-sock-hop.jpg" alt="Wolastoq Casino sponsors FredRod Show 'n Shine 2026 and hosts the Sock Hop themed after party with Eddie Chase and Graffiti Four, August 7 to 9 at Wolastoq Casino in Fredericton">
        </div>
        <div class="we-poster-text">
          <span class="we-badge we-badge-gold">August 7&ndash;9</span>
          <p class="we-kicker">Wolastoq Casino Proudly Sponsors</p>
          <h2 class="we-h2">FredRod Show &rsquo;n Shine 2026 &mdash; Sock Hop After Party</h2>
          <p class="we-lead">Wolastoq Casino is proud to sponsor the <strong>FredRod Show &rsquo;n Shine 2026</strong> and host the official <strong>Sock&nbsp;Hop themed after party</strong> &mdash; three nights of classic cars, retro vibes and live rock &rsquo;n&rsquo; roll from <strong>Eddie Chase &amp; Graffiti Four</strong>.</p>
          <ul class="we-detail">
            <li><span>Dates</span>August 7&ndash;9, 2026</li>
            <li><span>Live Music</span>Eddie Chase &amp; Graffiti Four</li>
            <li><span>Where</span>Wolastoq Casino, Fredericton</li>
            <li><span>Tickets</span>CA$25 + tax</li>
            <li><span>Doors</span>8:00 PM</li>
            <li><span>Band Starts</span>9:00 PM</li>
          </ul>
          <div class="we-hero-cta">
            <a class="we-btn we-btn-ghost" href="tel:5064627689">Call (506) 462-7689</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- BINGO EVENTS (WOLAEVENTS restored 2026-07-31 — auto-expiring, date-sorted; DO NOT REMOVE.
       Managed in inc/wola-events.php; scheduled through October 2026.) -->
  <?php $wi = 0; foreach ( wola_events_upcoming( 'bingo', 'events' ) as $wev ) : $walt = ( $wi % 2 === 0 ); ?>
  <section class="we-poster<?php echo $walt ? ' we-alt' : ''; ?>" id="we-ev-<?php echo $wev['slug']; ?>">
    <div class="we-wrap we-reveal">
      <div class="we-poster-grid<?php echo $walt ? ' we-rev' : ''; ?>">
        <div class="we-poster-img">
          <img loading="lazy" src="<?php echo $wev['img']; ?>" alt="<?php echo esc_attr( $wev['alt'] ); ?>">
        </div>
        <div class="we-poster-text">
          <span class="we-badge <?php echo $walt ? 'we-badge-pink' : 'we-badge-gold'; ?>"><?php echo $wev['badge']; ?></span>
          <p class="we-kicker"><?php echo $wev['kicker']; ?></p>
          <h2 class="we-h2"><?php echo $wev['name']; ?></h2>
          <p class="we-lead"><?php echo $wev['lead']; ?></p>
          <ul class="we-detail">
            <?php foreach ( $wev['rows'] as $r ) { echo '<li><span>' . $r[0] . '</span>' . $r[1] . '</li>'; } ?>
          </ul>
          <div class="we-hero-cta">
            <a class="we-btn we-btn-gold" href="<?php echo $wev['book']; ?>">Book Online</a>
            <a class="we-btn we-btn-ghost" href="/bingo/">About Wolastoq Bingo</a>
          </div>
        </div>
      </div>
    </div>
  </section>
  <?php $wi++; endforeach; ?>

  <!-- KK LIVE MARITIMES SCHEDULE (redesigned) -->
  <section class="we-event" id="we-kklive">
    <div class="we-wrap we-reveal">
      <div class="we-event-head we-center">
        <span class="we-badge we-badge-gold">Series &middot; Aug&ndash;Sep 2026</span>
        <p class="we-kicker we-kicker-c">Hosted by the Wolastoq Poker Room</p>
        <h2 class="we-h2 we-h2-c">The KK Live Maritimes Schedule</h2>
        <p class="we-lead" style="max-width:720px;margin-left:auto;margin-right:auto;text-align:center">Satellites and feeders lead into the C$350 events and online Day&nbsp;1 flights, all building toward the <strong>Live Day&nbsp;2 finale on September&nbsp;20</strong>. <em class="we-gold">Play Local. Win Big. The Maritimes Are All In.</em></p>
      </div>
      <div class="we-sgrid">
        <div class="we-sgroup">
          <h4><span class="we-snum">01</span> Satellites &amp; Feeders</h4>
          <div class="we-sitem"><b>SAT$15 &times;1 Flip</b><span class="dt">Weekly through Sep 12 &middot; 19:15</span><em>$1.50 &middot; SAT$15 &times;1</em></div>
        </div>
        <div class="we-sgroup">
          <h4><span class="we-snum">02</span> C$350 Events</h4>
          <div class="we-sitem"><b>KKLive Marit C$350</b><span class="dt">Aug 9, 24 &middot; Sep 7, 14 &middot; 16:30</span><em>$15 &middot; $250 KKLive ticket</em></div>
          <div class="we-sitem"><b>Marit C$350 &times;1 Flip</b><span class="dt">Aug 9, 23 &middot; Sep 6, 13 &middot; 18:45</span><em>$30 &middot; $250 KKLive ticket</em></div>
        </div>
        <div class="we-sgroup">
          <h4><span class="we-snum">03</span> Online Day 1 Flights</h4>
          <div class="we-sitem"><b>Online Day 1C</b><span class="dt">Aug 9 &middot; 19:00</span><em>$250 &middot; Advance to Live Day 2</em></div>
          <div class="we-sitem"><b>Online Day 1D&ndash;1F</b><span class="dt">Aug 23, Sep 6, Sep 13 &middot; 19:00</span><em>$250 &middot; Advance to Live Day 2</em></div>
        </div>
        <div class="we-sgroup we-sfinale">
          <h4><span class="we-snum">04</span> Live Days &amp; Finale</h4>
          <div class="we-sitem"><b>Live Day 1G / 1H / 1I</b><span class="dt">Sep 18 (18:00) &middot; Sep 19 (10:00 &amp; 18:00)</span><em>$250 (CAD$350) &middot; Advance to Live Day 2</em></div>
          <div class="we-sitem we-slast"><b>&#9733; Live Day 2 &mdash; Finale</b><span class="dt">Sep 20 &middot; 11:00</span><em>The main event finish</em></div>
        </div>
      </div>
      <p class="we-note we-center">Schedule and buy-ins subject to confirmation &mdash; call the Poker Room at <a href="tel:5064627689">(506) 462-7689</a> for the latest details and to reserve your seat.</p>
    </div>
  </section>

  <!-- POKER ROOM INFO -->
  <section class="we-info">
    <div class="we-wrap we-reveal">
      <p class="we-kicker we-kicker-c">Good to Know</p>
      <h2 class="we-h2 we-h2-c">The Wolastoq Poker Room</h2>
      <div class="we-info-grid">
        <div class="we-info-card">
          <h3>Hours of Operation</h3>
          <ul>
            <li><span>Wed &ndash; Sat</span>6:00 PM &ndash; 2:00 AM <em>(phones open 5:00 PM)</em></li>
            <li><span>Sunday</span>5:00 PM &ndash; 2:00 AM <em>(phones open 4:00 PM)</em></li>
            <li><span>Reservations</span><a href="tel:5064627689">506-462-7689</a></li>
          </ul>
        </div>
        <div class="we-info-card">
          <h3>Cash Game Details</h3>
          <ul>
            <li><span>Game</span>$1 / $3 Texas Hold&rsquo;em</li>
            <li><span>Omaha</span>1 hand of Omaha per orbit</li>
            <li><span>Bomb Pots</span>Double board bomb pots every hour</li>
            <li><span>Buy-In</span>Min $60 &middot; Max $300 &mdash; match the biggest stack anytime after your first buy-in</li>
          </ul>
        </div>
      </div>
      <p class="we-lead" style="text-align:center;max-width:780px;margin:26px auto 0">From daily cash games to major tournament series, the Wolastoq Poker Room is where New Brunswick&rsquo;s poker community comes to play. Pull up a seat, meet the regulars, and see why Fredericton&rsquo;s best poker action happens at Wolastoq Casino.</p>
    </div>
  </section>

  <!-- POKER 101 / KNOWLEDGE -->
  <section class="we-know">
    <div class="we-wrap we-reveal">
      <p class="we-kicker we-kicker-c">Poker at Wolastoq, Explained</p>
      <h2 class="we-h2 we-h2-c">New to Tournament Poker?</h2>
      <p class="we-lead" style="text-align:center;max-width:760px;margin:0 auto 30px">Whether you&rsquo;ve never sat at the felt or you&rsquo;re a weekend regular, here&rsquo;s a quick guide to how the games at the Wolastoq Poker Room actually work.</p>
      <div class="we-know-grid">
        <div class="we-know-card"><h3>Tournaments vs. Cash Games</h3><p>In a <strong>tournament</strong>, everyone buys in for the same amount, gets the same starting chips, and plays until one player holds them all &mdash; you can never lose more than your buy-in. A <strong>cash game</strong> like our $1/$3 Texas Hold&rsquo;em runs continuously, and your chips are real money you can cash out at any time.</p></div>
        <div class="we-know-card"><h3>Buy-Ins, Rebuys &amp; Add-Ons</h3><p>Your <strong>buy-in</strong> is the entry fee. Early on, many events allow <strong>rebuys</strong> (buy back in if you bust) and a one-time <strong>add-on</strong> at the first break. The Monthly Tournament, for example, is a CA$150 buy-in plus a CA$100 add-on with unlimited rebuys through Level&nbsp;8.</p></div>
        <div class="we-know-card"><h3>Satellites &amp; Qualifiers</h3><p>A <strong>satellite</strong> is a small tournament whose prize is a seat in a bigger one &mdash; the cheapest way into a major event. KK Live runs <strong>$20 KKPoker qualifiers</strong> that send winners straight to Live Day&nbsp;2 of the Maritimes finale.</p></div>
        <div class="we-know-card"><h3>Blinds &amp; the Structure</h3><p>Two players post forced bets called <strong>blinds</strong> that rise on a timer (every 20 minutes in our Monthly event). A steady structure plus a deep 25,000 stack means more play, more decisions, and more room for skill to matter.</p></div>
        <div class="we-know-card"><h3>Texas Hold&rsquo;em Basics</h3><p>You&rsquo;re dealt two private cards, then five community cards appear across three rounds &mdash; the flop, the turn and the river. Make the best five-card hand from any combination, bet on each round, and win the pot.</p></div>
        <div class="we-know-card"><h3>Hybrid Live + Online</h3><p>Modern series like KK Live let you fire <strong>online Day&nbsp;1 flights</strong> from anywhere, then bring your surviving stack to the <strong>live final day</strong> at Wolastoq &mdash; the best of both formats.</p></div>
      </div>
    </div>
  </section>

  <!-- FAQ -->
  <section class="we-faq">
    <div class="we-wrap we-reveal">
      <p class="we-kicker we-kicker-c">Questions</p>
      <h2 class="we-h2 we-h2-c">Wolastoq Events &mdash; FAQ</h2>
      <div class="we-faq-list">
        <details><summary>What is the FredRod Sock Hop After Party?</summary><div>Wolastoq Casino proudly sponsors the FredRod Show &rsquo;n Shine 2026 and hosts its Sock&nbsp;Hop themed after party on August&nbsp;7&ndash;9, with live music from Eddie Chase &amp; Graffiti Four. Tickets are CA$25 + tax; doors open at 8:00&nbsp;PM and the band starts at 9:00&nbsp;PM.</div></details>
        <details><summary>Where is the Wolastoq Poker Room?</summary><div>The Wolastoq Poker Room is inside Wolastoq Casino at 185 Gabriel Drive, Fredericton, New Brunswick, and is open seven days a week.</div></details>
        <details><summary>What is the KK Live Maritimes series?</summary><div>A summer-long tournament series hosted by the Wolastoq Poker Room, with satellites, C$350 events and online Day&nbsp;1 flights leading to the Live Day&nbsp;2 finale on September&nbsp;20.</div></details>
        <details><summary>Do I need to reserve a seat?</summary><div>Reservations are recommended for tournaments &mdash; call (506)&nbsp;462-7689. Our $1/$3 Texas Hold&rsquo;em cash games are walk-in whenever the room is open.</div></details>
        <details><summary>What are the Poker Room hours and age limit?</summary><div>Wednesday to Saturday 6:00&nbsp;PM &ndash; 2:00&nbsp;AM (phones open 5:00&nbsp;PM) and Sunday 5:00&nbsp;PM &ndash; 2:00&nbsp;AM (phones open 4:00&nbsp;PM). You must be 19+.</div></details>
      </div>
    </div>
  </section>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
   {"@type":"Question","name":"Where is the Wolastoq Poker Room?","acceptedAnswer":{"@type":"Answer","text":"The Wolastoq Poker Room is inside Wolastoq Casino at 185 Gabriel Drive, Fredericton, New Brunswick, and is open seven days a week."}},
   {"@type":"Question","name":"What is the FredRod Sock Hop After Party?","acceptedAnswer":{"@type":"Answer","text":"Wolastoq Casino proudly sponsors the FredRod Show 'n Shine 2026 and hosts its Sock Hop themed after party on August 7-9, with live music from Eddie Chase & Graffiti Four. Tickets are CA$25 plus tax; doors open at 8:00 PM and the band starts at 9:00 PM."}},
   {"@type":"Question","name":"What is the KK Live Maritimes series?","acceptedAnswer":{"@type":"Answer","text":"A summer-long tournament series hosted by the Wolastoq Poker Room, with satellites, C$350 events and online Day 1 flights leading to the Live Day 2 finale on September 20."}},
   {"@type":"Question","name":"Do I need to reserve a seat?","acceptedAnswer":{"@type":"Answer","text":"Reservations are recommended for tournaments; call (506) 462-7689. The $1/$3 Texas Hold'em cash games are walk-in whenever the room is open."}},
   {"@type":"Question","name":"What are the Poker Room hours and age limit?","acceptedAnswer":{"@type":"Answer","text":"Wednesday to Saturday 6:00 PM to 2:00 AM (phones open 5:00 PM) and Sunday 5:00 PM to 2:00 AM (phones open 4:00 PM). You must be 19 or older."}}
  ]}
  </script>

  <!-- CROSS-LINKS / VISIT -->
  <section class="we-more">
    <div class="we-wrap we-reveal">
      <p class="we-kicker we-kicker-c">More at Wolastoq</p>
      <h2 class="we-h2 we-h2-c">Explore the Rest of the Casino</h2>
      <p class="we-lead" style="text-align:center;max-width:640px;margin:0 auto 30px">Two floors of gaming, dining and entertainment &mdash; make a full night of your visit.</p>
      <div class="we-explore-grid">
        <a class="we-tile" href="/poker/"><img loading="lazy" src="<?php echo $bng; ?>poker.png" alt="Poker Room"><span class="we-tile-body"><b>Poker Room</b><i>Take a seat &rarr;</i></span></a>
        <a class="we-tile" href="/classic-slots/"><img loading="lazy" src="<?php echo $flr; ?>IMG_0712.jpg" alt="Slots"><span class="we-tile-body"><b>Slots</b><i>Play now &rarr;</i></span></a>
        <a class="we-tile" href="/bingo/"><img loading="lazy" src="<?php echo $bng; ?>wolastoq-bingo-official.jpg" alt="Bingo"><span class="we-tile-body"><b>Bingo</b><i>Plan your night &rarr;</i></span></a>
        <a class="we-tile" href="/the-pine-tree-bar-and-grill/"><img loading="lazy" src="<?php echo $rew; ?>pine-tree.jpg" alt="Pine Tree Bar and Grill"><span class="we-tile-body"><b>Pine Tree Bar &amp; Grill</b><i>Eat &amp; drink &rarr;</i></span></a>
      </div>
      <div class="we-more-btns">
        <a class="we-btn we-btn-ghost" href="/promotions/">Promotions</a>
        <a class="we-btn we-btn-ghost" href="/rewards/">Player Rewards</a>
        <a class="we-btn we-btn-ghost" href="/about-us/">About Wolastoq</a>
        <a class="we-btn we-btn-ghost" href="/contact-us/">Contact Us</a>
      </div>
      <p class="we-visit">185 Gabriel Drive, Fredericton, NB &middot; Open 7 Days, 10 AM &ndash; 2 AM &middot; <a href="tel:18889924646">888-992-4646</a>
        &nbsp;&nbsp;<a class="we-btn we-btn-gold" href="https://www.google.com/maps/dir/?api=1&amp;destination=185+Gabriel+Drive,+Fredericton,+NB+E3A+5V9" target="_blank" rel="noopener">Get Directions</a></p>
    </div>
  </section>

</div>

<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&display=swap">
<style id="wola-events-css">
#wola-events{--pd:#0d0618;--pd2:#140826;--mag:#BC0FD4;--pink:#ff6be0;--gold:#FFD23B;--tx:#efe9fb;--mut:#b6a9d4;background:var(--pd);color:var(--tx);font-family:"Poppins",sans-serif;overflow-x:hidden;}
#wola-events a{text-decoration:none;}
#wola-events .we-wrap{max-width:1060px;margin:0 auto;padding:0 22px;}
#wola-events .we-kicker{color:var(--pink);font-weight:700;letter-spacing:2.5px;text-transform:uppercase;font-size:12.5px;margin:0 0 10px;}
#wola-events .we-kicker-c{text-align:center;}
#wola-events .we-h2{font-size:clamp(26px,3.6vw,40px);font-weight:800;color:#fff;margin:0 0 16px;line-height:1.08;}
#wola-events .we-h2-c{text-align:center;}
#wola-events .we-center{text-align:center;}
#wola-events .we-lead{color:var(--mut);line-height:1.75;font-size:16px;margin:0 0 16px;}
#wola-events .we-lead strong{color:#fff;} #wola-events .we-gold,#wola-events .we-lead em.we-gold{color:var(--gold);font-style:normal;font-weight:600;}
#wola-events .we-btn{display:inline-block;padding:13px 26px;border-radius:50px;font-weight:700;font-size:14.5px;transition:transform .25s,box-shadow .25s,background .25s;}
#wola-events .we-btn-gold{background:linear-gradient(120deg,#FFD23B,#ffb703);color:#2a1400;box-shadow:0 10px 26px rgba(255,183,3,.3);}
#wola-events .we-btn-gold:hover{transform:translateY(-3px);box-shadow:0 16px 38px rgba(255,183,3,.5);}
#wola-events .we-btn-ghost{border:2px solid rgba(255,107,224,.55);color:#fff;}
#wola-events .we-btn-ghost:hover{transform:translateY(-3px);background:rgba(188,15,212,.18);}

/* hero */
#wola-events .we-hero{position:relative;min-height:66vh;display:flex;flex-direction:column;justify-content:center;overflow:hidden;}
#wola-events .we-hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.05);animation:weKen 22s ease-in-out infinite alternate;}
@keyframes weKen{to{transform:scale(1.15)}}
#wola-events .we-hero-veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,4,20,.92),rgba(12,6,24,.7) 55%,rgba(20,8,40,.5)),linear-gradient(0deg,var(--pd) 2%,transparent 40%);}
#wola-events .we-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;}
#wola-events .we-hero-inner{position:relative;z-index:2;max-width:1060px;width:100%;margin:0 auto;padding:56px 22px 20px;}
#wola-events .we-eyebrow{color:var(--gold);letter-spacing:3px;text-transform:uppercase;font-weight:700;font-size:13px;margin:0 0 12px;}
#wola-events .we-title{font-family:'Anton','Poppins',sans-serif;font-weight:400;text-transform:uppercase;font-size:clamp(42px,7vw,84px);line-height:.94;margin:0 0 18px;color:#fff;letter-spacing:1.5px;text-shadow:0 3px 26px rgba(0,0,0,.55),0 0 40px rgba(255,107,224,.25);}
#wola-events .we-title span{display:block;background:linear-gradient(90deg,#ff6be0,#ffd23b,#ffb703,#ff6be0);background-size:240% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-shadow:none;animation:weShine 5s linear infinite;filter:drop-shadow(0 2px 14px rgba(255,183,3,.35));}
@keyframes weShine{to{background-position:220% center}}
#wola-events .we-tag{max-width:600px;font-size:clamp(15px,1.6vw,18px);line-height:1.6;color:#e7dcff;margin:0 0 26px;}
#wola-events .we-hero-cta{display:flex;gap:13px;flex-wrap:wrap;}
#wola-events .we-hero-stats{position:relative;z-index:2;max-width:1060px;width:100%;margin:0 auto;padding:0 22px 42px;display:flex;gap:14px;flex-wrap:wrap;}
#wola-events .we-hero-stats div{flex:1 1 180px;background:linear-gradient(160deg,rgba(45,15,70,.55),rgba(15,8,26,.7));border:1px solid rgba(255,210,59,.28);border-radius:14px;padding:14px 18px;}
#wola-events .we-hero-stats b{display:block;color:var(--gold);font-size:19px;font-weight:800;} #wola-events .we-hero-stats span{color:var(--mut);font-size:12.5px;letter-spacing:.4px;}

/* intro */
#wola-events .we-intro{padding:64px 0 20px;text-align:center;}
#wola-events .we-intro .we-lead{max-width:820px;margin:0 auto;font-size:16.5px;}

/* poster features */
#wola-events .we-poster{padding:56px 0;}
#wola-events .we-alt{background:linear-gradient(180deg,var(--pd),var(--pd2));}
#wola-events .we-poster-grid{display:grid;grid-template-columns:0.82fr 1fr;gap:50px;align-items:center;}
#wola-events .we-poster-grid.we-rev .we-poster-img{order:2;}
#wola-events .we-poster-img{position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(255,210,59,.3);box-shadow:0 30px 70px rgba(0,0,0,.6),0 0 40px rgba(188,15,212,.25);}
#wola-events .we-poster-img img{width:100%;display:block;}
#wola-events .we-badge{display:inline-block;padding:6px 15px;border-radius:30px;font-size:11.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;margin-bottom:12px;}
#wola-events .we-badge-gold{background:linear-gradient(120deg,#FFD23B,#ffb703);color:#2a1400;}
#wola-events .we-badge-pink{background:linear-gradient(120deg,#ff6be0,#BC0FD4);color:#fff;}
#wola-events .we-detail{list-style:none;padding:0;margin:6px 0 22px;}
#wola-events .we-detail li{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.08);color:#e7dcff;font-size:15px;}
#wola-events .we-detail li span{display:inline-block;min-width:120px;color:var(--pink);font-size:11.5px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;}
#wola-events .we-detail a{color:var(--gold);}
#wola-events .we-chips{display:flex;flex-wrap:wrap;gap:9px;margin:6px 0 22px;}
#wola-events .we-chips span{background:rgba(188,15,212,.14);border:1px solid rgba(255,107,224,.32);color:#f0d9ff;font-size:12.5px;font-weight:600;padding:7px 14px;border-radius:30px;}

/* schedule redesigned */
#wola-events .we-event{padding:60px 0;}
#wola-events .we-event-head{max-width:820px;margin:0 auto;}
#wola-events .we-event-head .we-badge{background:linear-gradient(120deg,#FFD23B,#ffb703);color:#2a1400;}
#wola-events .we-sgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:34px;}
#wola-events .we-sgroup{background:linear-gradient(160deg,rgba(32,13,58,.6),rgba(15,8,26,.85));border:1px solid rgba(255,107,224,.22);border-radius:18px;padding:24px 24px 12px;transition:transform .3s,border-color .3s,box-shadow .3s;}
#wola-events .we-sgroup:hover{transform:translateY(-4px);border-color:rgba(255,210,59,.4);box-shadow:0 18px 44px rgba(0,0,0,.45);}
#wola-events .we-sgroup h4{display:flex;align-items:center;gap:10px;color:#fff;font-size:16px;font-weight:800;margin:0 0 12px;}
#wola-events .we-snum{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(120deg,#ff6be0,#BC0FD4);color:#fff;font-size:13px;font-weight:800;}
#wola-events .we-sitem{padding:12px 0;border-top:1px solid rgba(255,255,255,.08);}
#wola-events .we-sitem b{display:block;color:#fff;font-size:14.5px;font-weight:700;}
#wola-events .we-sitem .dt{display:block;color:var(--mut);font-size:12.5px;margin:2px 0 3px;}
#wola-events .we-sitem em{color:var(--gold);font-style:normal;font-size:12.5px;font-weight:600;}
#wola-events .we-sfinale{border-color:rgba(255,210,59,.5);box-shadow:0 0 34px rgba(255,210,59,.12);}
#wola-events .we-sfinale .we-snum{background:linear-gradient(120deg,#FFD23B,#ffb703);color:#2a1400;}
#wola-events .we-slast b{color:var(--gold);}
#wola-events .we-note{margin-top:18px;font-size:13px;color:var(--mut);} #wola-events .we-note a{color:var(--gold);}

/* info */
#wola-events .we-info{padding:56px 0;}
#wola-events .we-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:30px;}
#wola-events .we-info-card{background:linear-gradient(160deg,rgba(45,15,70,.5),rgba(15,8,26,.8));border:1px solid rgba(255,107,224,.25);border-radius:18px;padding:28px;}
#wola-events .we-info-card h3{color:var(--gold);font-size:19px;margin:0 0 14px;font-weight:800;}
#wola-events .we-info-card ul{list-style:none;padding:0;margin:0;}
#wola-events .we-info-card li{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.08);color:#e7dcff;font-size:15px;line-height:1.5;}
#wola-events .we-info-card li span{display:block;color:var(--pink);font-size:11.5px;letter-spacing:1.3px;text-transform:uppercase;font-weight:700;margin-bottom:3px;}
#wola-events .we-info-card li em{font-style:normal;color:var(--mut);} #wola-events .we-info-card a{color:var(--gold);}

/* more */
#wola-events .we-more{padding:56px 0 90px;text-align:center;}
#wola-events .we-more-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:28px 0;}
#wola-events .we-visit{color:var(--mut);font-size:15px;margin-top:10px;} #wola-events .we-visit a{color:var(--gold);}

/* poker 101 */
#wola-events .we-know{padding:60px 0;}
#wola-events .we-know-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:6px;}
#wola-events .we-know-card{background:linear-gradient(160deg,rgba(32,13,58,.55),rgba(15,8,26,.8));border:1px solid rgba(255,107,224,.2);border-radius:16px;padding:24px;transition:transform .3s,border-color .3s;}
#wola-events .we-know-card:hover{transform:translateY(-4px);border-color:rgba(255,210,59,.4);}
#wola-events .we-know-card h3{color:var(--gold);font-size:16.5px;font-weight:800;margin:0 0 10px;}
#wola-events .we-know-card p{color:var(--mut);font-size:14px;line-height:1.65;margin:0;}
#wola-events .we-know-card strong{color:#fff;}
/* explore tiles */
#wola-events .we-explore-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px;}
#wola-events .we-tile{position:relative;height:200px;border-radius:16px;overflow:hidden;display:block;text-decoration:none;border:1px solid rgba(255,210,59,.18);transition:transform .3s,border-color .3s,box-shadow .3s;}
#wola-events .we-tile:hover{transform:translateY(-6px);border-color:var(--gold);box-shadow:0 22px 50px rgba(188,15,212,.32);}
#wola-events .we-tile img{width:100%;height:100%;object-fit:cover;filter:brightness(.62);transition:transform .5s;}
#wola-events .we-tile:hover img{transform:scale(1.08);}
#wola-events .we-tile::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 30%,rgba(9,4,17,.9));}
#wola-events .we-tile-body{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:18px 20px;}
#wola-events .we-tile-body b{display:block;color:#fff;font-size:18px;font-weight:800;}
#wola-events .we-tile-body i{color:var(--gold);font-style:normal;font-weight:600;font-size:13px;}

/* faq */
#wola-events .we-faq{padding:56px 0;background:linear-gradient(180deg,var(--pd2),var(--pd));}
#wola-events .we-faq-list{max-width:820px;margin:32px auto 0;}
#wola-events .we-faq details{background:linear-gradient(160deg,rgba(32,13,58,.55),rgba(15,8,26,.8));border:1px solid rgba(255,107,224,.2);border-radius:14px;margin-bottom:12px;overflow:hidden;transition:border-color .3s;}
#wola-events .we-faq details[open]{border-color:rgba(255,210,59,.4);}
#wola-events .we-faq summary{list-style:none;cursor:pointer;padding:18px 22px;color:#fff;font-weight:700;font-size:16px;display:flex;justify-content:space-between;align-items:center;gap:14px;}
#wola-events .we-faq summary::-webkit-details-marker{display:none;}
#wola-events .we-faq summary::after{content:"+";color:var(--gold);font-size:22px;font-weight:800;transition:transform .3s;line-height:1;}
#wola-events .we-faq details[open] summary::after{transform:rotate(45deg);}
#wola-events .we-faq details div{padding:0 22px 20px;color:var(--mut);font-size:14.5px;line-height:1.7;}

/* reveal */
#wola-events .we-reveal{opacity:0;transform:translateY(28px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1);}
#wola-events .we-reveal.in{opacity:1;transform:none;}

@media(max-width:820px){
  #wola-events .we-hero{min-height:58vh;}
  #wola-events .we-poster-grid{grid-template-columns:1fr;gap:26px;max-width:460px;margin:0 auto;}
  #wola-events .we-poster-grid.we-rev .we-poster-img{order:0;}
  #wola-events .we-info-grid{grid-template-columns:1fr;}
  #wola-events .we-sgrid{grid-template-columns:1fr;}
  #wola-events .we-know-grid{grid-template-columns:1fr;}
  #wola-events .we-explore-grid{grid-template-columns:1fr 1fr;}
  #wola-events .we-detail li span{display:block;min-width:0;margin-bottom:2px;}
}
@media(prefers-reduced-motion:reduce){
  #wola-events *{animation:none!important;}
  #wola-events .we-reveal{opacity:1!important;transform:none!important;}
  #wola-events .we-hero-bg{transform:none;} #wola-events .we-fx{display:none;}
}
</style>
<script>
/* scroll reveal */
(function(){
  var els=document.querySelectorAll('#wola-events .we-reveal');
  if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in');});return;}
  var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}});},{threshold:.1,rootMargin:'0px 0px -6% 0px'});
  els.forEach(function(e){io.observe(e);});
})();
/* casino RAIN FX — falling playing cards + poker chips */
(function(){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce)return;
  var SUITS=[['♠','#1a1420'],['♥','#d61f2f'],['♦','#d61f2f'],['♣','#1a1420']];
  var RANKS=['A','K','Q','J','10'];
  var CHIPS=[['#ff7a8a','#b0202f'],['#6ea8ff','#123a70'],['#66d38a','#0d5a2e'],['#ffe08a','#8a6410'],['#c9c9d2','#26262e']];
  function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function Fx(canvas){
    var ctx=canvas.getContext('2d'), dpr=Math.min(window.devicePixelRatio||1,2);
    var W=0,H=0,ps=[],running=false,raf=null,last=0,acc=0;
    var interval=parseFloat(canvas.getAttribute('data-interval'))||220;
    var intensity=parseFloat(canvas.getAttribute('data-intensity'))||1;
    function resize(){W=canvas.clientWidth;H=canvas.clientHeight;canvas.width=Math.max(1,W*dpr);canvas.height=Math.max(1,H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
    function spawn(prefill){
      var isChip=Math.random()<0.4;
      var s=isChip?(20+Math.random()*16):(24+Math.random()*18);
      var p={x:Math.random()*W, y:prefill?Math.random()*H:(-40-Math.random()*40), vx:(Math.random()-0.5)*0.5, vy:(0.8+Math.random()*1.4), rot:Math.random()*6.28, vr:(Math.random()-0.5)*0.05, size:s, chip:isChip};
      if(isChip){var c=CHIPS[(Math.random()*CHIPS.length)|0];p.c1=c[0];p.c2=c[1];}
      else{var su=SUITS[(Math.random()*SUITS.length)|0];p.suit=su[0];p.col=su[1];p.rank=RANKS[(Math.random()*RANKS.length)|0];}
      ps.push(p);
    }
    function drawCard(p){
      var w=p.size,h=p.size*1.42;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);
      ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=6;ctx.shadowOffsetY=2;
      ctx.fillStyle='#fdfdff'; rr(ctx,-w/2,-h/2,w,h,w*0.14); ctx.fill();
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.fillStyle=p.col;
      ctx.font='700 '+(w*0.5)+'px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.suit,0,h*0.05);
      ctx.font='800 '+(w*0.3)+'px Arial,sans-serif';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(p.rank,-w/2+w*0.13,-h/2+h*0.07);
      ctx.restore();
    }
    function drawChip(p){
      var r=p.size*0.5;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);
      ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=6;ctx.shadowOffsetY=2;
      ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fillStyle=p.c2;ctx.fill();
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.lineWidth=r*0.3;ctx.strokeStyle='#fff';ctx.setLineDash([r*0.55,r*0.42]);
      ctx.beginPath();ctx.arc(0,0,r*0.8,0,7);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(0,0,r*0.46,0,7);ctx.fillStyle=p.c1;ctx.fill();
      ctx.restore();
    }
    function frame(t){ if(!running)return;raf=requestAnimationFrame(frame);var dt=t-last;last=t;acc+=dt;
      if(acc>interval){acc=0;spawn(false);if(intensity>=2)spawn(false);}
      ctx.clearRect(0,0,W,H);ctx.globalAlpha=0.92;
      for(var i=ps.length-1;i>=0;i--){var p=ps[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.004;p.rot+=p.vr;
        if(p.y>H+50){ps.splice(i,1);continue;}
        if(p.chip)drawChip(p);else drawCard(p);}
      ctx.globalAlpha=1;
    }
    function start(){if(running)return;resize();running=true;last=performance.now();acc=interval;for(var k=0;k<16;k++)spawn(true);raf=requestAnimationFrame(frame);}
    function stop(){running=false;if(raf)cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);}
    window.addEventListener('resize',function(){if(running)resize();});
    return {start:start,stop:stop,el:canvas};
  }
  var fxs=[].map.call(document.querySelectorAll('#wola-events canvas[data-wefx]'),function(c){return Fx(c);});
  if('IntersectionObserver' in window){var fio=new IntersectionObserver(function(es){es.forEach(function(e){var f=null;for(var k=0;k<fxs.length;k++){if(fxs[k].el===e.target){f=fxs[k];break;}}if(!f)return;if(e.isIntersecting)f.start();else f.stop();});},{threshold:0.02});fxs.forEach(function(f){fio.observe(f.el);});}else{fxs.forEach(function(f){f.start();});}
})();
</script>
<?php get_footer(); ?>

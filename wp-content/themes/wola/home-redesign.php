<?php
/**
 * Wolastoq Casino — Home (redesign)
 * Forced for the front page via template_include in functions.php.
 * Self-contained, scoped to #wola-home. Original home.php left untouched as fallback.
 */
require_once get_stylesheet_directory() . '/inc/wola-events.php'; // WOLAEVENTS 20260731 restored — DO NOT REMOVE: auto-expiring bingo flyers
get_header();

$cd     = 'https://www.wolastoqcasino.ca/wp-content/uploads/';
$people = $cd . 'casino-2026/people/';
$floor  = $cd . 'casino-2026/floor/';
$rew    = $cd . 'rewards/';
$bng    = $cd . 'bingo-redesign/';
$evt    = $cd . 'events/';
?>
<div id="wola-home">

  <!-- ============ HERO ============ -->
  <section class="wh-hero">
    <div class="wh-hero-bg" style="background-image:url('<?php echo $floor; ?>IMG_0704.jpg');"></div>
    <div class="wh-hero-veil"></div>
    <span class="wh-orb wh-orb-1"></span>
    <span class="wh-orb wh-orb-2"></span>
    <span class="wh-orb wh-orb-3"></span>
    <div class="wh-casino-fx" aria-hidden="true">
      <span class="wh-ball" style="left:59%;top:14%;--c:#e23b4e;animation-delay:0s;animation-duration:7.2s"><i>B<br>7</i></span>
      <span class="wh-ball" style="left:80%;top:26%;--c:#2f7be0;animation-delay:.9s;animation-duration:8.6s"><i>I<br>19</i></span>
      <span class="wh-ball wh-ball-sm wh-ball-hide-m" style="left:66%;top:50%;--c:#27a35a;animation-delay:1.6s;animation-duration:7.8s"><i>N<br>42</i></span>
      <span class="wh-ball" style="left:88%;top:56%;--c:#f0a500;animation-delay:.4s;animation-duration:9.2s"><i>G<br>56</i></span>
      <span class="wh-ball wh-ball-sm" style="left:73%;top:74%;--c:#9b3bd6;animation-delay:2.1s;animation-duration:8.2s"><i>O<br>71</i></span>
      <span class="wh-pc wh-ball-hide-m" style="left:83%;top:13%;--rot:-9deg;animation-delay:.5s"><b class="wh-pc-c wh-red">A<br>&hearts;</b><i class="wh-pc-m wh-red">&hearts;</i></span>
      <span class="wh-pc wh-ball-hide-m" style="left:94%;top:38%;--rot:8deg;animation-delay:1.5s"><b class="wh-pc-c">K<br>&spades;</b><i class="wh-pc-m">&spades;</i></span>
      <span class="wh-pc wh-ball-hide-m" style="left:79%;top:82%;--rot:-5deg;animation-delay:.9s"><b class="wh-pc-c wh-red">Q<br>&diams;</b><i class="wh-pc-m wh-red">&diams;</i></span>
      <span class="wh-roulette wh-ball-hide-m" style="left:1%;top:55%"><span class="wh-roul-wheel"></span><span class="wh-roul-ball"></span></span>
      <span class="wh-chip wh-ball-hide-m" style="left:15%;top:76%;--ca:#ff5a6b;--cb:#8c1420;animation-delay:.6s"></span>
      <span class="wh-chip wh-ball-hide-m" style="left:6%;top:87%;--ca:#3f8be0;--cb:#123a70;animation-delay:1.5s"></span>
    </div>
    <div class="wh-hero-inner">
      <p class="wh-eyebrow">Wolastoq Casino &middot; Fredericton, NB</p>
      <h1 class="wh-hero-title">
        <span class="wh-line">Vegas Thrills,</span>
        <span class="wh-line wh-grad">Local Convenience</span>
      </h1>
      <p class="wh-hero-sub">New Brunswick's ultimate destination for slots, electronic table games, bingo, live entertainment and great food &mdash; two floors of excitement, open seven days a week.</p>
      <div class="wh-hero-cta">
        <a class="wh-btn wh-btn-gold" href="#wh-offerings">Explore the Casino</a>
        <a class="wh-btn wh-btn-ghost" href="/rewards/">Join Player Rewards</a>
      </div>
    </div>
    <a href="#wh-intro" class="wh-scroll" aria-label="Scroll down"><span></span></a>
  </section>

  <!-- ============ QUICK FACTS BAR ============ -->
  <div class="wh-facts">
    <div class="wh-facts-in">
      <div class="wh-fact"><strong>10AM&ndash;2AM</strong><span>Open Daily</span></div>
      <div class="wh-fact"><strong>2 Floors</strong><span>of Gaming</span></div>
      <div class="wh-fact"><strong>200+</strong><span>Slot Machines</span></div>
      <div class="wh-fact"><strong>Free</strong><span>Downtown Shuttle</span></div>
      <div class="wh-fact"><strong>19+</strong><span>Welcome</span></div>
    </div>
  </div>

  <!-- ============ UPCOMING EVENT (EVENTFIX 20260702) ============ -->
  <?php
  // Featured event data — same ACF keys + fallbacks as archive-events.php.
  // If the fe_* ACF fields are ever created, both pages update together;
  // until then these defaults render. KEEP IN SYNC with archive-events.php.
  if ( ! function_exists( 'wh_fe' ) ) {
    function wh_fe( $key, $default = '' ) {
      if ( function_exists( 'get_field' ) ) {
        $v = get_field( $key );
        if ( $v !== null && $v !== '' && $v !== false ) { return $v; }
      }
      return $default;
    }
  }
  $wh_ev = array(
    'title'     => wh_fe( 'fe_title', 'KK Live Maritimes &mdash; Wolastoq Poker Room' ),
    'date'      => wh_fe( 'fe_date', 'Select Dates &middot; Jul&ndash;Sep 2026' ),
    'time'      => wh_fe( 'fe_time', 'Buy-ins from $15' ),
    'admission' => wh_fe( 'fe_admission', '19+' ),
    'desc'      => wh_fe( 'fe_desc', 'The Maritimes&rsquo; biggest poker series has landed at the Wolastoq Poker Room. Satellites, C$350 events and online Day&nbsp;1 flights all lead to the Live Day&nbsp;2 finale on September&nbsp;20. Play local, win big.' ),
    'image'     => wh_fe( 'fe_image', 'https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/poker.png' ),
    'act1_name' => wh_fe( 'fe_act1_name', 'Marit C$350' ),
    'act1_time' => wh_fe( 'fe_act1_time', 'Jul 12' ),
    'act2_name' => wh_fe( 'fe_act2_name', 'Live Day 2 Finale' ),
    'act2_time' => wh_fe( 'fe_act2_time', 'Sep 20' ),
  );
  ?>
  <section class="wh-event" aria-label="Upcoming events at Wolastoq Casino">
    <canvas class="wh-fx wh-fx-full" data-whfx data-intensity="2" data-interval="240" aria-hidden="true"></canvas>
    <div class="wh-wrap wh-reveal wh-event-head">
      <p class="wh-kicker wh-kicker-c">&#9733; On Now at Wolastoq Casino</p>
      <h2 class="wh-event-h2">Upcoming <span>Events</span></h2>
      <p class="wh-event-sub">From our Sock&nbsp;Hop after party for the FredRod Show&nbsp;&rsquo;n&nbsp;Shine to the KK&nbsp;Live Maritimes poker series and weekly Bingo nights &mdash; there&rsquo;s always something happening at Wolastoq Casino.</p>
    </div>
    <div class="wh-wrap">
      <div class="wh-ev2-grid wh-reveal">
        <a class="wh-ev2" href="/events/">
          <img class="wh-ev2-img" loading="lazy" src="<?php echo $evt; ?>fredrod-sock-hop.jpg" alt="FredRod Show 'n Shine 2026 Sock Hop after party with Eddie Chase and Graffiti Four, August 7 to 9 at Wolastoq Casino">
          <span class="wh-ev2-body">
            <span class="wh-ev2-badge">Aug 7&ndash;9</span>
            <h3>FredRod Sock Hop After Party</h3>
            <p>Wolastoq proudly sponsors the FredRod Show&nbsp;&rsquo;n&nbsp;Shine &middot; live music by Eddie&nbsp;Chase &amp; Graffiti&nbsp;Four &middot; doors 8&nbsp;PM.</p>
            <span class="wh-ev2-go">See details <b>&rarr;</b></span>
          </span>
        </a>
        <a class="wh-ev2" href="/events/">
          <img class="wh-ev2-img" loading="lazy" src="<?php echo $bng; ?>poker.png" alt="KK Live Maritimes poker series at the Wolastoq Poker Room, running through the September 20 finale">
          <span class="wh-ev2-body">
            <span class="wh-ev2-badge">Aug&ndash;Sep</span>
            <h3>KK Live Maritimes Series</h3>
            <p>Satellites, C$350 events &amp; online Day&nbsp;1 flights &middot; building to the Live Day&nbsp;2 finale on Sept&nbsp;20.</p>
            <span class="wh-ev2-go">See details <b>&rarr;</b></span>
          </span>
        </a>
        <?php /* WOLAEVENTS restored 2026-07-31: next upcoming bingo event, auto-expiring — DO NOT REMOVE */
        foreach ( array_slice( wola_events_upcoming( 'bingo', 'home' ), 0, 1 ) as $wev ) : ?>
        <a class="wh-ev2" href="/events/#we-ev-<?php echo $wev['slug']; ?>">
          <img class="wh-ev2-img" loading="lazy" src="<?php echo $wev['img']; ?>" alt="<?php echo esc_attr( $wev['alt'] ); ?>">
          <span class="wh-ev2-body">
            <span class="wh-ev2-badge"><?php echo $wev['badge']; ?></span>
            <h3><?php echo $wev['name']; ?></h3>
            <p><?php echo $wev['blurb']; ?></p>
            <span class="wh-ev2-go">See details <b>&rarr;</b></span>
          </span>
        </a>
        <?php endforeach; ?>
      </div>
      <div class="wh-ev2-cta wh-reveal">
        <a class="wh-btn wh-btn-gold" href="/events/">All Events &amp; Schedule</a>
        <a class="wh-btn wh-btn-ghost" href="tel:5064627689">Poker Room: (506) 462-7689</a>
      </div>
    </div>
  </section>
  <style id="wh-ev2-css">
  #wola-home .wh-event{position:relative;overflow:hidden;}
  #wola-home .wh-fx-full{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;}
  #wola-home .wh-event .wh-event-head,#wola-home .wh-event .wh-wrap{position:relative;z-index:1;}
  #wola-home .wh-ev2-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;max-width:1160px;margin:0 auto;}
  #wola-home .wh-ev2{display:block;background:linear-gradient(160deg,rgba(32,13,58,.72),rgba(15,8,26,.9));border:1px solid rgba(255,107,224,.24);border-radius:20px;overflow:hidden;transition:transform .3s,border-color .3s,box-shadow .3s;text-decoration:none;}
  #wola-home .wh-ev2:hover{transform:translateY(-6px);border-color:var(--gold);box-shadow:0 26px 60px rgba(188,15,212,.4);}
  #wola-home .wh-ev2-img{width:100%;display:block;aspect-ratio:4/5;object-fit:cover;background:#1a0f2e;}
  #wola-home .wh-ev2-body{display:block;padding:20px 24px 24px;}
  #wola-home .wh-ev2-badge{display:inline-block;background:linear-gradient(120deg,#FFD23B,#ffb703);color:#2a1400;font-weight:800;font-size:11px;letter-spacing:.5px;text-transform:uppercase;padding:5px 13px;border-radius:30px;margin-bottom:10px;}
  #wola-home .wh-ev2-badge-pink{background:linear-gradient(120deg,#ff6be0,#BC0FD4);color:#fff;}
  #wola-home .wh-ev2-body h3{color:#fff;font-size:20px;font-weight:800;margin:0 0 8px;line-height:1.15;}
  #wola-home .wh-ev2-body p{color:var(--mut);font-size:14px;line-height:1.55;margin:0 0 12px;}
  #wola-home .wh-ev2-go{color:var(--gold);font-weight:700;font-size:14px;}
  #wola-home .wh-ev2-go b{display:inline-block;transition:transform .3s;} #wola-home .wh-ev2:hover .wh-ev2-go b{transform:translateX(6px);}
  #wola-home .wh-ev2-cta{text-align:center;margin-top:30px;display:flex;gap:13px;justify-content:center;flex-wrap:wrap;}
  @media(max-width:820px){#wola-home .wh-ev2-grid{grid-template-columns:1fr;max-width:430px;}}
  </style>

  <!-- ============ INTRO ============ -->
  <section id="wh-intro" class="wh-intro">
    <div class="wh-wrap wh-reveal">
      <p class="wh-kicker">Welcome to Wolastoq Casino</p>
      <h2 class="wh-h2">New Brunswick's Premier Gaming &amp; Entertainment Destination</h2>
      <p class="wh-lead">Set in the heart of Fredericton, Wolastoq Casino brings the energy of Las Vegas home. Across two spacious floors you'll find the best slots in New Brunswick, electronic table games, a lively bingo hall, live entertainment, and a full bar and grill &mdash; all wrapped in a bright, welcoming atmosphere with friendly staff and a free shuttle from downtown. Whether you're here for a big night out or a quick spin after dinner, there's always something happening at Wolastoq.</p>
    </div>
  </section>

  <!-- ============ OFFERINGS ============ -->
  <section id="wh-offerings" class="wh-offerings">
    <div class="wh-wrap wh-reveal wh-bento-head">
      <p class="wh-kicker wh-kicker-c">Explore Wolastoq</p>
      <h2 class="wh-h2 wh-h2-c">Everything Under One Roof</h2>
    </div>
    <div class="wh-bento wh-reveal">

      <a class="wh-card wh-c-slots" href="/classic-slots/">
        <span class="wh-card-img" style="background-image:url('<?php echo $floor; ?>IMG_0712.jpg');"></span>
        <span class="wh-tag wh-tag-gold">Best Slots in NB</span>
        <span class="wh-card-body">
          <h3>The Slots</h3>
          <p>Over 200 machines &mdash; Lock It Link, Wheel of Fortune, Buffalo, Deal or No Deal and progressive jackpots climbing every day.</p>
          <span class="wh-card-go">Explore the slots <b>&rarr;</b></span>
        </span>
      </a>

      <a class="wh-card wh-c-tables" href="/blackjack/">
        <span class="wh-card-img" style="background-image:url('<?php echo $floor; ?>IMG_0709.jpg');"></span>
        <span class="wh-tag wh-tag-pink">Live &amp; Electronic</span>
        <span class="wh-card-body">
          <h3>Table Games</h3>
          <p>Blackjack, Roulette &amp; Poker &mdash; plus Ultimate Texas Hold&rsquo;Em and Let It Ride coming soon.</p>
          <span class="wh-card-go">See tables <b>&rarr;</b></span>
        </span>
      </a>

      <a class="wh-card wh-c-bingo" href="/bingo/">
        <span class="wh-card-img" style="background-image:url('<?php echo $bng; ?>wolastoq-bingo-official.jpg');"></span>
        <span class="wh-tag wh-tag-gold">Big Jackpots</span>
        <span class="wh-card-body">
          <h3>Bingo</h3>
          <p>Regular sessions, generous payouts and a room full of energy. Reserve your seat online.</p>
          <span class="wh-card-go">Play bingo <b>&rarr;</b></span>
        </span>
      </a>

      <a class="wh-card wh-c-events" href="/events/">
        <span class="wh-card-img" style="background-image:url('<?php echo $evt; ?>wolastoq-july4th-celebration.jpg');"></span>
        <span class="wh-tag wh-tag-pink">Live Shows</span>
        <span class="wh-card-body">
          <h3>Events</h3>
          <p>Live bands, comedy nights and special celebrations all year long.</p>
          <span class="wh-card-go">What's on <b>&rarr;</b></span>
        </span>
      </a>

      <a class="wh-card wh-c-rewards" href="/rewards/">
        <span class="wh-card-img" style="background-image:url('<?php echo $rew; ?>player-cards.jpg');"></span>
        <span class="wh-tag wh-tag-gold">Free to Join</span>
        <span class="wh-card-body">
          <h3>Player Rewards</h3>
          <p>Earn points as you play and unlock Free Play, dining discounts and VIP perks across Red, Blue &amp; Black tiers.</p>
          <span class="wh-card-go">Discover rewards <b>&rarr;</b></span>
        </span>
      </a>

      <a class="wh-card wh-c-dining" href="/the-pine-tree-bar-and-grill/">
        <span class="wh-card-img" style="background-image:url('<?php echo $rew; ?>pine-tree.jpg');"></span>
        <span class="wh-tag wh-tag-pink">Eat &amp; Drink</span>
        <span class="wh-card-body">
          <h3>The Pine Tree Bar &amp; Grill</h3>
          <p>Hearty plates, cold drinks and a relaxed atmosphere &mdash; with exclusive Players Club pricing.</p>
          <span class="wh-card-go">View the restaurant <b>&rarr;</b></span>
        </span>
      </a>

    </div>
  </section>

  <!-- ============ DETAILED OFFERINGS (SEO) ============ -->
  <div class="wh-wrap wh-reveal" style="text-align:center;padding-top:34px;">
    <p class="wh-kicker wh-kicker-c">A Closer Look</p>
    <h2 class="wh-h2 wh-h2-c">Explore Every Way to Play</h2>
  </div>

  <!-- Slots -->
  <section class="wh-detail wh-reveal" id="slots">
    <div class="wh-detail-in">
      <div class="wh-detail-media">
        <img loading="lazy" decoding="async" src="<?php echo $floor; ?>IMG_0686.jpg" alt="Lock It Link progressive jackpot slot machine at Wolastoq Casino in Fredericton">
        <span class="wh-detail-idx">01</span>
      </div>
      <div class="wh-detail-text">
        <p class="wh-kicker">The Slots</p>
        <h2 class="wh-h2">Slots &mdash; Over 200 of New Brunswick's Newest Machines</h2>
        <p>Wolastoq Casino is home to the largest and most exciting <strong>slot floor in the Fredericton area</strong>, with more than 200 machines spread across two full floors. From classic three-reel favourites to the latest high-definition video slots, you'll find beloved titles like Lock It Link, Wheel of Fortune, Buffalo, Dragon Link and Deal or No Deal &mdash; with new games added regularly.</p>
        <p>Play your way, from penny denominations all the way up to high-limit machines, and chase life-changing <strong>progressive jackpots</strong> that climb with every spin. Cash-free ticket-in/ticket-out play keeps things quick and easy, and with both smoking and non-smoking gaming areas, there's a perfect seat for everyone.</p>
        <div class="wh-chips"><span class="wh-chip2">Penny to High-Limit</span><span class="wh-chip2">Progressive Jackpots</span><span class="wh-chip2">200+ Machines</span><span class="wh-chip2">Two Floors</span></div>
        <a class="wh-btn wh-btn-gold" href="/classic-slots/">Explore the Slots</a>
      </div>
    </div>
  </section>

  <!-- Table Games -->
  <section class="wh-detail wh-detail-alt wh-detail-rev wh-reveal" id="table-games">
    <div class="wh-detail-in">
      <div class="wh-detail-media">
        <img loading="lazy" decoding="async" src="<?php echo $floor; ?>IMG_0710.jpg" alt="Electronic roulette table game at Wolastoq Casino">
        <span class="wh-detail-idx">02</span>
      </div>
      <div class="wh-detail-text">
        <p class="wh-kicker">Table Games</p>
        <h2 class="wh-h2">Table Games &mdash; Blackjack, Roulette &amp; Poker</h2>
        <p>Pull up a seat and test your skill at Wolastoq's <strong>table games</strong>. Go for 21 at Blackjack, place your bets on red or black at Roulette, or read the room over a hand of Poker. Our fast, intuitive electronic table games make it easy for newcomers to jump in, while giving seasoned players the action they love.</p>
        <p>Even more ways to play are on the way &mdash; <strong>Ultimate Texas Hold&rsquo;Em</strong> and <strong>Let It Ride</strong> are coming soon to our floor. Whether you prefer the strategy of blackjack or the thrill of the wheel, our friendly dealers and staff are always happy to help you learn the ropes.</p>
        <div class="wh-chips"><span class="wh-chip2">Blackjack</span><span class="wh-chip2">Roulette</span><span class="wh-chip2">Poker</span><span class="wh-chip2">Ultimate Texas Hold&rsquo;Em &mdash; Soon</span><span class="wh-chip2">Let It Ride &mdash; Soon</span></div>
        <a class="wh-btn wh-btn-gold" href="/blackjack/">See Table Games</a>
      </div>
    </div>
  </section>

  <!-- Bingo -->
  <section class="wh-detail wh-reveal" id="bingo">
    <div class="wh-detail-in">
      <div class="wh-detail-media">
        <img loading="lazy" decoding="async" src="<?php echo $bng; ?>bingo-hall.jpg" alt="Wolastoq Bingo hall in Fredericton, New Brunswick">
        <span class="wh-detail-idx">03</span>
      </div>
      <div class="wh-detail-text">
        <p class="wh-kicker">Wolastoq Bingo</p>
        <h2 class="wh-h2">Bingo &mdash; Fredericton's Favourite Bingo Hall</h2>
        <p>There's nothing like the buzz of a full bingo hall, and <strong>Wolastoq Bingo</strong> delivers it session after session. Enjoy regular daytime and evening games with generous payouts, friendly callers and a welcoming crowd of regulars and first-timers alike.</p>
        <p>Play with traditional paper or fast electronic dabbers, and <strong>reserve your favourite seat online</strong> before you arrive so your lucky chair is always waiting. It's affordable, social and endlessly fun &mdash; the perfect night out with friends and family.</p>
        <div class="wh-chips"><span class="wh-chip2">Daily Sessions</span><span class="wh-chip2">Paper &amp; Electronic</span><span class="wh-chip2">Reserve Your Seat</span><span class="wh-chip2">Big Jackpots</span></div>
        <a class="wh-btn wh-btn-gold" href="/bingo/">Play Bingo</a>
      </div>
    </div>
  </section>

  <!-- Events -->
  <section class="wh-detail wh-detail-alt wh-detail-rev wh-reveal" id="events">
    <div class="wh-detail-in">
      <div class="wh-detail-media">
        <img loading="lazy" decoding="async" src="<?php echo $evt; ?>wolastoq-live-band.jpg" alt="Live band performing at Wolastoq Casino">
        <span class="wh-detail-idx">04</span>
      </div>
      <div class="wh-detail-text">
        <p class="wh-kicker">Events &amp; Entertainment</p>
        <h2 class="wh-h2">Live Entertainment &amp; Special Events</h2>
        <p>The stage at Wolastoq Casino is always alive. From <strong>live bands and comedy nights</strong> to holiday parties and headline acts, our events calendar is packed with reasons to come out. Catch local favourites and touring performers in an intimate, high-energy setting.</p>
        <p>Watch for seasonal celebrations, themed nights and <strong>exclusive member events</strong> throughout the year. It's great live music, cold drinks and a full room &mdash; check the calendar to see what's coming up next.</p>
        <div class="wh-chips"><span class="wh-chip2">Live Bands</span><span class="wh-chip2">Comedy Nights</span><span class="wh-chip2">Holiday Events</span><span class="wh-chip2">Member Exclusives</span></div>
        <a class="wh-btn wh-btn-gold" href="/events/">See What's On</a>
      </div>
    </div>
  </section>

  <!-- Player Rewards -->
  <section class="wh-detail wh-reveal" id="rewards">
    <div class="wh-detail-in">
      <div class="wh-detail-media">
        <img loading="lazy" decoding="async" src="<?php echo $rew; ?>player-cards.jpg" alt="Wolastoq Player Rewards cards — Red, Blue and Black membership tiers">
        <span class="wh-detail-idx">05</span>
      </div>
      <div class="wh-detail-text">
        <p class="wh-kicker">Player Rewards</p>
        <h2 class="wh-h2">Player Rewards &mdash; Earn More Every Visit</h2>
        <p>Our free <strong>Player Rewards program</strong> makes every visit more rewarding. Simply play with your card to earn points on slots and table games, then redeem them for Free Play, dining discounts and exclusive perks. The more you play, the more you unlock.</p>
        <p>Climb three membership tiers &mdash; <strong>Red, Blue and Black</strong> &mdash; each with bigger benefits, from Players Club drink pricing and food discounts at the Pine Tree Bar &amp; Grill to premium VIP privileges. Signing up is quick, easy and completely free at Guest Services.</p>
        <div class="wh-chips"><span class="wh-chip2">Free to Join</span><span class="wh-chip2">Earn Free Play</span><span class="wh-chip2">Dining Discounts</span><span class="wh-chip2">Red / Blue / Black Tiers</span></div>
        <a class="wh-btn wh-btn-gold" href="/rewards/">Discover Player Rewards</a>
      </div>
    </div>
  </section>

  <!-- Dining -->
  <section class="wh-detail wh-detail-alt wh-detail-rev wh-reveal" id="dining">
    <div class="wh-detail-in">
      <div class="wh-detail-media">
        <img loading="lazy" decoding="async" src="<?php echo $rew; ?>pine-tree.jpg" alt="The Pine Tree Bar and Grill dining room at Wolastoq Casino">
        <span class="wh-detail-idx">06</span>
      </div>
      <div class="wh-detail-text">
        <p class="wh-kicker">The Pine Tree Bar &amp; Grill</p>
        <h2 class="wh-h2">The Pine Tree Bar &amp; Grill &mdash; Eat, Drink &amp; Relax</h2>
        <p>Refuel without leaving the action at the <strong>Pine Tree Bar &amp; Grill</strong>, our full-service restaurant and bar. Enjoy hearty, satisfying plates and a great selection of drinks in a warm, relaxed atmosphere &mdash; the perfect spot to celebrate a win or take a break between games.</p>
        <p>Players Rewards members enjoy <strong>exclusive food and drink pricing</strong>, making a great meal even better. Open seven days a week right alongside the casino, we're here whenever hunger strikes.</p>
        <div class="wh-chips"><span class="wh-chip2">Full-Service Bar</span><span class="wh-chip2">Hearty Plates</span><span class="wh-chip2">Players Club Pricing</span><span class="wh-chip2">Open 7 Days</span></div>
        <a class="wh-btn wh-btn-gold" href="/the-pine-tree-bar-and-grill/">View the Restaurant</a>
      </div>
    </div>
  </section>

  <!-- ============ PROMOTIONS STRIP ============ -->
  <section class="wh-promos" style="background-image:url('<?php echo $floor; ?>IMG_0712.jpg');">
    <div class="wh-promos-veil"></div>
    <div class="wh-wrap wh-reveal">
      <p class="wh-kicker wh-kicker-c">Boost Your Play</p>
      <h2 class="wh-h2 wh-h2-c">Free Play, Every Week</h2>
      <div class="wh-promo-grid">
        <div class="wh-promo"><span class="wh-day">Mon</span><strong>Military &amp; Veteran</strong><em>Appreciation &mdash; Free Play</em></div>
        <div class="wh-promo"><span class="wh-day">Tue</span><strong>First Responders</strong><em>Appreciation &mdash; Free Play</em></div>
        <div class="wh-promo"><span class="wh-day">Wed</span><strong>Senior's Day</strong><em>Free Play</em></div>
        <div class="wh-promo"><span class="wh-day">Thu</span><strong>Student's Day</strong><em>Free Play</em></div>
      </div>
      <a class="wh-btn wh-btn-gold" href="/promotions/">See all promotions</a>
    </div>
  </section>

  <!-- ============ VISIT US ============ -->
  <section class="wh-visit">
    <div class="wh-visit-in wh-reveal">
      <div class="wh-visit-info">
        <p class="wh-kicker">Plan Your Visit</p>
        <h2 class="wh-h2">Come See Us in Fredericton</h2>
        <ul class="wh-visit-list">
          <li><span>Address</span>185 Gabriel Drive, Fredericton, NB E3A 5V9</li>
          <li><span>Hours</span>Open 7 Days a Week &middot; 10:00 AM &ndash; 2:00 AM</li>
          <li><span>Phone</span><a href="tel:18889924646">888-992-4646</a> &middot; <a href="tel:15064629300">506-462-9300</a></li>
          <li><span>Getting Here</span>Free shuttle service both ways from downtown Fredericton</li>
        </ul>
        <div class="wh-visit-cta">
          <a class="wh-btn wh-btn-gold" href="https://www.google.com/maps/dir/?api=1&amp;destination=185+Gabriel+Drive,+Fredericton,+NB+E3A+5V9" target="_blank" rel="noopener">Get Directions</a>
          <a class="wh-btn wh-btn-ghost" href="/contact-us/">Contact Us</a>
        </div>
      </div>
      <div class="wh-visit-map">
        <iframe title="Wolastoq Casino location" loading="lazy" src="https://www.google.com/maps?q=185+Gabriel+Drive,+Fredericton,+NB+E3A+5V9&output=embed" style="border:0;width:100%;height:100%;"></iframe>
      </div>
    </div>
  </section>

</div>

<style id="wola-home-css">
#wola-home{--pd:#0d0618;--pd2:#140826;--pd3:#200d3a;--mag:#BC0FD4;--pink:#ff6be0;--gold:#FFD23B;--tx:#efe9fb;--mut:#b6a9d4;background:var(--pd);color:var(--tx);font-family:"Poppins",sans-serif;overflow-x:hidden;}
#wola-home img{display:block;max-width:100%;}
#wola-home a{text-decoration:none;}
#wola-home .wh-wrap{max-width:1080px;margin:0 auto;padding:0 22px;}
#wola-home .wh-kicker{color:var(--pink);font-weight:700;letter-spacing:2.5px;text-transform:uppercase;font-size:13px;margin:0 0 12px;}
#wola-home .wh-kicker-c{text-align:center;}
#wola-home .wh-h2{font-size:clamp(28px,4vw,44px);line-height:1.08;font-weight:800;margin:0 0 20px;color:#fff;}
#wola-home .wh-h2-c{text-align:center;margin-left:auto;margin-right:auto;}
#wola-home .wh-h3{font-size:clamp(24px,3vw,34px);font-weight:800;margin:0 0 16px;color:#fff;line-height:1.12;}
#wola-home .wh-lead{font-size:clamp(16px,1.5vw,18px);line-height:1.75;color:var(--mut);max-width:820px;}

/* buttons */
#wola-home .wh-btn{display:inline-block;padding:15px 30px;border-radius:50px;font-weight:700;letter-spacing:.4px;font-size:15px;transition:transform .25s,box-shadow .25s,background .25s;will-change:transform;}
#wola-home .wh-btn-gold{background:linear-gradient(120deg,#ffd23b,#ffb703);color:#2a1400;box-shadow:0 10px 30px rgba(255,183,3,.32);}
#wola-home .wh-btn-gold:hover{transform:translateY(-3px);box-shadow:0 16px 40px rgba(255,183,3,.5);}
#wola-home .wh-btn-ghost{border:2px solid rgba(255,107,224,.6);color:#fff;}
#wola-home .wh-btn-ghost:hover{transform:translateY(-3px);background:rgba(188,15,212,.18);box-shadow:0 0 30px rgba(255,107,224,.4);}

/* ---- HERO ---- */
#wola-home .wh-hero{position:relative;min-height:88vh;display:flex;align-items:center;overflow:hidden;}
#wola-home .wh-hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;transform:scale(1.05);animation:whKen 22s ease-in-out infinite alternate;}
@keyframes whKen{from{transform:scale(1.05)}to{transform:scale(1.18)}}
#wola-home .wh-hero-veil{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,4,20,.94) 0%,rgba(12,6,24,.78) 42%,rgba(12,6,24,.45) 72%,rgba(20,8,40,.6) 100%),linear-gradient(0deg,var(--pd) 2%,transparent 30%);}
#wola-home .wh-hero-inner{position:relative;max-width:1080px;width:100%;margin:0 auto;padding:0 22px;}
#wola-home .wh-eyebrow{color:var(--gold);letter-spacing:3px;text-transform:uppercase;font-weight:700;font-size:14px;margin:0 0 14px;opacity:0;animation:whUp .8s .1s forwards;}
#wola-home .wh-hero-title{font-family:'Anton',sans-serif;font-size:clamp(44px,7.4vw,88px);font-weight:400;line-height:1;margin:0 0 22px;letter-spacing:.5px;}
#wola-home .wh-hero-title .wh-line{display:block;opacity:0;transform:translateY(24px);animation:whUp .9s forwards;}
#wola-home .wh-hero-title .wh-line:nth-child(1){animation-delay:.22s;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.5);}
#wola-home .wh-hero-title .wh-line:nth-child(2){animation-delay:.38s;}
#wola-home .wh-grad{color:#FFD23B;-webkit-text-fill-color:#FFD23B;background:none;animation:whUp .9s .38s forwards;}
@keyframes whShine{to{background-position:220% center}}
#wola-home .wh-hero-sub{max-width:560px;font-size:clamp(16px,1.6vw,19px);line-height:1.65;color:#e7dcff;margin:0 0 30px;opacity:0;animation:whUp .9s .54s forwards;}
#wola-home .wh-hero-cta{display:flex;gap:14px;flex-wrap:wrap;opacity:0;animation:whUp .9s .68s forwards;}
@keyframes whUp{to{opacity:1;transform:none}}

/* floating orbs */
#wola-home .wh-orb{position:absolute;border-radius:50%;filter:blur(6px);opacity:.5;pointer-events:none;mix-blend-mode:screen;}
#wola-home .wh-orb-1{width:200px;height:200px;right:8%;top:16%;background:radial-gradient(circle,rgba(255,107,224,.7),transparent 65%);animation:whFloat 12s ease-in-out infinite;}
#wola-home .wh-orb-2{width:150px;height:150px;right:26%;bottom:16%;background:radial-gradient(circle,rgba(255,210,59,.55),transparent 65%);animation:whFloat 15s ease-in-out infinite reverse;}
#wola-home .wh-orb-3{width:120px;height:120px;right:44%;top:26%;background:radial-gradient(circle,rgba(120,80,255,.6),transparent 65%);animation:whFloat 18s ease-in-out infinite;}
@keyframes whFloat{0%,100%{transform:translate(0,0)}50%{transform:translate(-24px,-34px)}}

/* scroll cue */
#wola-home .wh-scroll{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:26px;height:42px;border:2px solid rgba(255,255,255,.5);border-radius:14px;}
#wola-home .wh-scroll span{position:absolute;left:50%;top:8px;width:4px;height:8px;background:var(--gold);border-radius:2px;transform:translateX(-50%);animation:whWheel 1.6s infinite;}
@keyframes whWheel{0%{opacity:0;top:8px}30%{opacity:1}70%{opacity:1}100%{opacity:0;top:22px}}

/* ---- FACTS ---- */
#wola-home .wh-facts{background:linear-gradient(90deg,var(--pd3),var(--pd2));border-top:1px solid rgba(255,107,224,.25);border-bottom:1px solid rgba(255,107,224,.25);}
#wola-home .wh-facts-in{max-width:1080px;margin:0 auto;padding:22px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;}
#wola-home .wh-fact{flex:1 1 140px;text-align:center;}
#wola-home .wh-fact strong{display:block;font-size:clamp(20px,2.4vw,26px);color:var(--gold);font-weight:800;}
#wola-home .wh-fact span{color:var(--mut);font-size:13px;letter-spacing:.5px;}

/* ---- INTRO ---- */
#wola-home .wh-intro{padding:90px 0 40px;text-align:center;}
#wola-home .wh-intro .wh-lead{margin:0 auto;}

/* ---- OFFERINGS (bento) ---- */
#wola-home .wh-offerings{padding:64px 0 48px;}
#wola-home .wh-bento-head{margin-bottom:6px;}
#wola-home .wh-bento{max-width:1120px;margin:26px auto 0;padding:0 22px;display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:220px;gap:16px;
  grid-template-areas:"slots slots tables tables" "slots slots bingo events" "rewards rewards dining dining";}
#wola-home .wh-c-slots{grid-area:slots}
#wola-home .wh-c-tables{grid-area:tables}
#wola-home .wh-c-bingo{grid-area:bingo}
#wola-home .wh-c-events{grid-area:events}
#wola-home .wh-c-rewards{grid-area:rewards}
#wola-home .wh-c-dining{grid-area:dining}
#wola-home .wh-card{position:relative;overflow:hidden;border-radius:20px;display:block;isolation:isolate;border:1px solid rgba(255,107,224,.16);box-shadow:0 20px 46px rgba(0,0,0,.45);transition:border-color .35s,box-shadow .35s,transform .35s;}
#wola-home .wh-card-img{position:absolute;inset:0;background-size:cover;background-position:center;z-index:-2;transition:transform .9s cubic-bezier(.2,.7,.2,1);}
#wola-home .wh-card::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(10,4,20,.12),rgba(10,4,20,.4) 48%,rgba(9,4,17,.94));}
#wola-home .wh-card:hover{border-color:var(--gold);box-shadow:0 28px 60px rgba(188,15,212,.42);transform:translateY(-4px);}
#wola-home .wh-card:hover .wh-card-img{transform:scale(1.08);}
#wola-home .wh-tag{position:absolute;top:15px;left:15px;padding:6px 13px;border-radius:30px;font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;z-index:3;}
#wola-home .wh-tag-gold{background:linear-gradient(120deg,#ffd23b,#ffb703);color:#2a1400;}
#wola-home .wh-tag-pink{background:linear-gradient(120deg,#ff6be0,#BC0FD4);color:#fff;}
#wola-home .wh-card-body{position:absolute;left:0;right:0;bottom:0;padding:20px 22px 22px;z-index:2;}
#wola-home .wh-card-body h3{margin:0;color:#fff;font-weight:800;font-size:clamp(20px,2vw,26px);line-height:1.1;}
#wola-home .wh-c-slots .wh-card-body h3{font-size:clamp(26px,3.2vw,40px);}
#wola-home .wh-card-body p{color:#e4d9f7;font-size:14px;line-height:1.55;margin:0;max-height:0;opacity:0;transform:translateY(8px);overflow:hidden;transition:max-height .45s,opacity .4s,transform .45s,margin .4s;}
#wola-home .wh-card:hover .wh-card-body p,#wola-home .wh-card:focus-within .wh-card-body p,#wola-home .wh-c-slots .wh-card-body p{max-height:130px;opacity:1;transform:none;margin-top:8px;}
#wola-home .wh-card-go{display:inline-block;margin-top:12px;color:var(--gold);font-weight:700;font-size:13.5px;letter-spacing:.3px;}
#wola-home .wh-card-go b{display:inline-block;transition:transform .3s;}
#wola-home .wh-card:hover .wh-card-go b{transform:translateX(6px);}

/* ---- DETAILED OFFERINGS ---- */
#wola-home .wh-detail{padding:52px 0;position:relative;}
#wola-home .wh-detail-alt{background:radial-gradient(1100px 460px at 78% 50%,rgba(120,40,180,.13),transparent 70%);}
#wola-home .wh-detail-in{max-width:1120px;margin:0 auto;padding:0 22px;display:grid;grid-template-columns:1.02fr 1fr;gap:54px;align-items:center;}
#wola-home .wh-detail-rev .wh-detail-media{order:2;}
#wola-home .wh-detail-media{position:relative;border-radius:22px;overflow:hidden;border:1px solid rgba(255,107,224,.2);box-shadow:0 30px 70px rgba(0,0,0,.55);}
#wola-home .wh-detail-media img{width:100%;height:430px;object-fit:cover;display:block;transition:transform .9s cubic-bezier(.2,.7,.2,1);}
#wola-home .wh-detail:hover .wh-detail-media img{transform:scale(1.05);}
#wola-home .wh-detail-idx{position:absolute;top:8px;left:18px;font-size:66px;font-weight:900;line-height:1;letter-spacing:-3px;color:transparent;-webkit-text-stroke:1.5px rgba(255,255,255,.3);}
#wola-home .wh-detail-text h2{margin:6px 0 16px;font-size:clamp(24px,2.7vw,34px);}
#wola-home .wh-detail-text p{color:var(--mut);line-height:1.8;font-size:16px;margin:0 0 15px;}
#wola-home .wh-detail-text strong{color:#fff;}
#wola-home .wh-chips{display:flex;flex-wrap:wrap;gap:9px;margin:8px 0 26px;}
#wola-home .wh-chip2{background:rgba(188,15,212,.14);border:1px solid rgba(255,107,224,.32);color:#f0d9ff;font-size:12.5px;font-weight:600;letter-spacing:.2px;padding:7px 14px;border-radius:30px;}

/* ---- PROMOS ---- */
#wola-home .wh-promos{position:relative;padding:90px 0;background-size:cover;background-position:center;background-attachment:fixed;}
#wola-home .wh-promos-veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,6,24,.9),rgba(20,8,40,.92));}
#wola-home .wh-promos .wh-wrap{position:relative;}
#wola-home .wh-promo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:34px 0 34px;}
#wola-home .wh-promo{background:linear-gradient(160deg,rgba(45,15,70,.85),rgba(15,8,26,.9));border:1px solid rgba(255,107,224,.3);border-radius:16px;padding:24px 18px;text-align:center;transition:transform .3s,box-shadow .3s,border-color .3s;}
#wola-home .wh-promo:hover{transform:translateY(-6px);border-color:var(--gold);box-shadow:0 18px 40px rgba(188,15,212,.35);}
#wola-home .wh-day{display:inline-block;background:linear-gradient(120deg,#ff6be0,#BC0FD4);color:#fff;font-weight:800;font-size:12px;letter-spacing:1px;text-transform:uppercase;padding:5px 14px;border-radius:30px;margin-bottom:12px;}
#wola-home .wh-promo strong{display:block;color:#fff;font-size:17px;margin-bottom:4px;}
#wola-home .wh-promo em{color:var(--mut);font-style:normal;font-size:13.5px;}
#wola-home .wh-promos .wh-btn{display:block;width:max-content;margin:0 auto;}

/* ---- REVIEWS ---- */
#wola-home .wh-reviews{padding:90px 0;background:linear-gradient(180deg,var(--pd),var(--pd2));}
#wola-home .wh-review-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:36px;}
#wola-home .wh-review{background:linear-gradient(160deg,rgba(32,13,58,.7),rgba(15,8,26,.8));border:1px solid rgba(255,107,224,.22);border-radius:18px;padding:28px;margin:0;transition:transform .3s,box-shadow .3s;}
#wola-home .wh-review:hover{transform:translateY(-6px);box-shadow:0 20px 44px rgba(0,0,0,.5);}
#wola-home .wh-stars{color:var(--gold);letter-spacing:3px;margin-bottom:12px;}
#wola-home .wh-review p{color:#e7dcff;line-height:1.7;font-size:15.5px;margin:0 0 16px;}
#wola-home .wh-review cite{color:var(--pink);font-style:normal;font-weight:700;}

/* ---- VISIT ---- */
#wola-home .wh-visit{padding:20px 0 100px;}
#wola-home .wh-visit-in{max-width:1080px;margin:0 auto;padding:0 22px;display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center;}
#wola-home .wh-visit-list{list-style:none;padding:0;margin:6px 0 26px;}
#wola-home .wh-visit-list li{padding:14px 0;border-bottom:1px solid rgba(255,255,255,.08);color:#e7dcff;font-size:16px;}
#wola-home .wh-visit-list li span{display:block;color:var(--pink);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;margin-bottom:4px;}
#wola-home .wh-visit-list a{color:var(--gold);}
#wola-home .wh-visit-cta{display:flex;gap:14px;flex-wrap:wrap;}
#wola-home .wh-visit-map{height:400px;border-radius:20px;overflow:hidden;border:1px solid rgba(255,107,224,.28);box-shadow:0 30px 70px rgba(0,0,0,.5);}

/* ---- SCROLL REVEAL ---- */
#wola-home .wh-reveal{opacity:0;transform:translateY(34px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1);}
#wola-home .wh-reveal.in{opacity:1;transform:none;}

/* ---- CASINO FX (bingo balls + suits) ---- */
#wola-home .wh-casino-fx{position:absolute;inset:0;z-index:2;pointer-events:none;}
#wola-home .wh-ball{position:absolute;width:74px;height:74px;border-radius:50%;
  background:radial-gradient(circle at 33% 28%,rgba(255,255,255,.95) 0 5%,var(--c) 26%,rgba(0,0,0,.5) 128%);
  box-shadow:inset -7px -9px 16px rgba(0,0,0,.45),0 12px 26px rgba(0,0,0,.5);
  animation:whBall 8s ease-in-out infinite;will-change:transform;}
#wola-home .wh-ball.wh-ball-sm{width:58px;height:58px;}
#wola-home .wh-ball i{position:absolute;inset:16px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:#141018;font-weight:800;font-size:13px;line-height:.9;font-style:normal;text-align:center;box-shadow:inset 0 1px 2px rgba(0,0,0,.25);}
#wola-home .wh-ball.wh-ball-sm i{inset:13px;font-size:11px;}
@keyframes whBall{0%,100%{transform:translateY(0) rotate(-7deg)}50%{transform:translateY(-28px) rotate(7deg)}}
/* playing cards */
#wola-home .wh-pc{position:absolute;width:66px;height:92px;border-radius:9px;background:linear-gradient(160deg,#fff,#ece9f5);box-shadow:0 12px 26px rgba(0,0,0,.55),inset 0 0 0 1px rgba(0,0,0,.06);color:#15111c;transform:rotate(var(--rot,0deg));animation:whCard 9s ease-in-out infinite;will-change:transform;}
#wola-home .wh-pc .wh-pc-c{position:absolute;top:6px;left:8px;font-size:14px;font-weight:800;line-height:.82;text-align:center;}
#wola-home .wh-pc .wh-pc-m{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:34px;font-style:normal;}
#wola-home .wh-pc .wh-red{color:#d61f2f;}
@keyframes whCard{0%,100%{transform:rotate(var(--rot,0deg)) translateY(0)}50%{transform:rotate(calc(var(--rot,0deg) + 6deg)) translateY(-22px)}}
/* roulette wheel */
#wola-home .wh-roulette{position:absolute;width:132px;height:132px;}
#wola-home .wh-roul-wheel{position:absolute;inset:0;border-radius:50%;background:repeating-conic-gradient(#b0202f 0 18deg,#141018 18deg 36deg);border:7px solid #caa24a;box-shadow:inset 0 0 24px rgba(0,0,0,.75),0 16px 34px rgba(0,0,0,.55);animation:whSpin 9s linear infinite;}
#wola-home .wh-roul-wheel::after{content:"";position:absolute;inset:33%;border-radius:50%;background:radial-gradient(circle at 40% 35%,#e6c36b,#8a6620);border:3px solid #3c2c12;}
#wola-home .wh-roul-ball{position:absolute;top:8px;left:50%;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#c8c8c8);box-shadow:0 2px 6px rgba(0,0,0,.6);transform-origin:6px 58px;animation:whSpin 4.5s linear infinite reverse;}
/* poker chips */
#wola-home .wh-chip{position:absolute;width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 38% 32%,var(--ca,#e23b4e),var(--cb,#8c1420) 72%);border:4px dashed rgba(255,255,255,.9);box-shadow:0 10px 22px rgba(0,0,0,.5),inset 0 0 0 6px rgba(255,255,255,.12);animation:whBall 8.5s ease-in-out infinite;will-change:transform;}
@keyframes whSpin{to{transform:rotate(360deg)}}

/* ---- RESPONSIVE ---- */
@media(max-width:860px){
  #wola-home .wh-bento{grid-template-columns:1fr;grid-template-areas:none;grid-auto-rows:210px;}
  #wola-home .wh-card{grid-area:auto!important;}
  #wola-home .wh-card-body p{max-height:150px;opacity:1;transform:none;margin-top:8px;}
  #wola-home .wh-detail-in{grid-template-columns:1fr;gap:24px;}
  #wola-home .wh-detail-rev .wh-detail-media{order:0;}
  #wola-home .wh-detail-media img{height:280px;}
  #wola-home .wh-promo-grid{grid-template-columns:repeat(2,1fr);}
  #wola-home .wh-review-grid{grid-template-columns:1fr;}
  #wola-home .wh-visit-in{grid-template-columns:1fr;}
  #wola-home .wh-visit-map{height:300px;}
  #wola-home .wh-promos{background-attachment:scroll;}
  #wola-home .wh-hero{min-height:82vh;}
  #wola-home .wh-ball-hide-m{display:none;}
  #wola-home .wh-ball{width:52px;height:52px;}
  #wola-home .wh-ball i{inset:11px;font-size:10px;}
  #wola-home .wh-ball.wh-ball-sm{width:44px;height:44px;}
  #wola-home .wh-suit{font-size:24px;}
}
@media(prefers-reduced-motion:reduce){
  #wola-home *{animation:none!important;}
  #wola-home .wh-reveal{opacity:1!important;transform:none!important;}
  #wola-home .wh-hero-bg{transform:none;}
}

/* ---- UPCOMING EVENT (EVENTFIX 20260702) ---- */
#wola-home .wh-event{padding:70px 0 26px;position:relative;overflow:hidden;}
#wola-home .wh-event .wh-wrap{position:relative;z-index:2;}
#wola-home .wh-event-head{text-align:center;margin-bottom:36px;}
#wola-home .wh-event-h2{font-family:'Anton',sans-serif;font-weight:400;font-size:clamp(38px,5.6vw,66px);line-height:1.05;letter-spacing:1px;color:#fff;margin:0 0 12px;text-transform:uppercase;}
#wola-home .wh-event-h2 span{color:var(--gold);text-shadow:0 0 34px rgba(255,210,59,.45);}
#wola-home .wh-event-sub{color:var(--mut);font-size:clamp(15px,1.5vw,17px);margin:0 auto;max-width:560px;line-height:1.6;}
#wola-home .wh-event-card{display:grid;grid-template-columns:1.02fr 1fr;background:linear-gradient(135deg,var(--pd2) 0%,var(--pd3) 100%);border:1px solid rgba(255,210,59,.35);border-radius:22px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.45),0 0 60px rgba(255,210,59,.07);}
#wola-home .wh-event-media{position:relative;aspect-ratio:3/4;background:radial-gradient(120% 90% at 50% 10%,#2a1150 0%,#160a2b 70%);}
#wola-home .wh-event-media img{width:100%;height:100%;object-fit:contain;position:absolute;inset:0;}
#wola-home .wh-event-badge{position:absolute;left:18px;top:18px;background:linear-gradient(120deg,#ffd23b,#ffb703);color:#2a1400;border-radius:14px;padding:10px 16px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.4);animation:whEvPulse 2.6s ease-in-out infinite;}
#wola-home .wh-event-badge b{display:block;font-size:17px;font-weight:800;line-height:1.15;}
#wola-home .wh-event-badge i{display:block;font-style:normal;font-size:12px;font-weight:700;letter-spacing:.4px;}
@keyframes whEvPulse{0%,100%{box-shadow:0 10px 30px rgba(0,0,0,.4),0 0 0 0 rgba(255,210,59,.45)}50%{box-shadow:0 10px 30px rgba(0,0,0,.4),0 0 0 12px rgba(255,210,59,0)}}
#wola-home .wh-event-body{padding:38px 40px 40px;display:flex;flex-direction:column;justify-content:center;position:relative;}
#wola-home .wh-event-body .wh-fx-panel{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;}
#wola-home .wh-event-body > *:not(canvas){position:relative;z-index:2;}
#wola-home .wh-event-title{font-family:'Anton',sans-serif;font-weight:400;font-size:clamp(28px,3.6vw,44px);line-height:1.08;letter-spacing:.5px;color:#fff;margin:0 0 16px;}
#wola-home .wh-event-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;}
#wola-home .wh-event-chips span{border:1px solid rgba(255,210,59,.5);color:var(--gold);border-radius:50px;padding:6px 14px;font-size:13px;font-weight:700;letter-spacing:.3px;}
#wola-home .wh-event-desc{color:var(--mut);line-height:1.7;font-size:15.5px;margin:0 0 18px;}
#wola-home .wh-event-acts{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 24px;}
#wola-home .wh-event-act{background:rgba(255,255,255,.05);border:1px solid rgba(255,107,224,.35);border-radius:12px;padding:9px 16px;font-size:14px;font-weight:600;color:var(--tx);}
#wola-home .wh-event-act b{color:var(--pink);margin-right:8px;font-weight:800;}
#wola-home .wh-event-cta{display:flex;gap:12px;flex-wrap:wrap;}
@media(max-width:860px){
  #wola-home .wh-event{padding:52px 0 14px;}
  #wola-home .wh-event-card{grid-template-columns:1fr;}
  #wola-home .wh-event-body{padding:26px 22px 30px;}
}
</style>

<script>
(function(){
  var els=document.querySelectorAll('#wola-home .wh-reveal');
  if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in');});return;}
  var io=new IntersectionObserver(function(en){
    en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}});
  },{threshold:.14,rootMargin:'0px 0px -8% 0px'});
  els.forEach(function(e){io.observe(e);});
})();
</script>

<script>
/* casino RAIN FX — small falling cards + poker chips (replaces fireworks) */
(function(){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce)return;
  var SUITS=[['♠','#1a1420'],['♥','#d61f2f'],['♦','#d61f2f'],['♣','#1a1420']];
  var CHIPS=[['#ff7a8a','#b0202f'],['#6ea8ff','#123a70'],['#66d38a','#0d5a2e'],['#ffe08a','#8a6410'],['#c9c9d2','#26262e']];
  function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function Fx(canvas){
    var ctx=canvas.getContext('2d'), dpr=Math.min(window.devicePixelRatio||1,2);
    var W=0,H=0,ps=[],running=false,raf=null,last=0,acc=0;
    var interval=parseFloat(canvas.getAttribute('data-interval'))||260;
    var intensity=parseFloat(canvas.getAttribute('data-intensity'))||1;
    function resize(){W=canvas.clientWidth;H=canvas.clientHeight;canvas.width=Math.max(1,W*dpr);canvas.height=Math.max(1,H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
    function spawn(prefill){
      var isChip=Math.random()<0.4;
      var s=isChip?(11+Math.random()*8):(12+Math.random()*10);
      var p={x:Math.random()*W,y:prefill?Math.random()*H:(-24-Math.random()*30),vx:(Math.random()-0.5)*0.4,vy:(0.7+Math.random()*1.1),rot:Math.random()*6.28,vr:(Math.random()-0.5)*0.05,size:s,chip:isChip};
      if(isChip){var c=CHIPS[(Math.random()*CHIPS.length)|0];p.c1=c[0];p.c2=c[1];}
      else{var su=SUITS[(Math.random()*SUITS.length)|0];p.suit=su[0];p.col=su[1];}
      ps.push(p);
    }
    function drawCard(p){var w=p.size,h=p.size*1.42;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=4;ctx.shadowOffsetY=1;ctx.fillStyle='#fdfdff';rr(ctx,-w/2,-h/2,w,h,w*0.16);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.fillStyle=p.col;ctx.font='700 '+(w*0.56)+'px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.suit,0,h*0.03);ctx.restore();}
    function drawChip(p){var r=p.size*0.5;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.shadowColor='rgba(0,0,0,.5)';ctx.shadowBlur=4;ctx.shadowOffsetY=1;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fillStyle=p.c2;ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.lineWidth=r*0.3;ctx.strokeStyle='#fff';ctx.setLineDash([r*0.55,r*0.42]);ctx.beginPath();ctx.arc(0,0,r*0.8,0,7);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(0,0,r*0.44,0,7);ctx.fillStyle=p.c1;ctx.fill();ctx.restore();}
    function frame(t){if(!running)return;raf=requestAnimationFrame(frame);var dt=t-last;last=t;acc+=dt;if(acc>interval){acc=0;spawn(false);if(intensity>=2)spawn(false);}ctx.clearRect(0,0,W,H);ctx.globalAlpha=0.9;for(var i=ps.length-1;i>=0;i--){var p=ps[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.004;p.rot+=p.vr;if(p.y>H+40){ps.splice(i,1);continue;}if(p.chip)drawChip(p);else drawCard(p);}ctx.globalAlpha=1;}
    function start(){if(running)return;resize();running=true;last=performance.now();acc=interval;for(var k=0;k<14;k++)spawn(true);raf=requestAnimationFrame(frame);}
    function stop(){running=false;if(raf)cancelAnimationFrame(raf);ctx.clearRect(0,0,W,H);}
    window.addEventListener('resize',function(){if(running)resize();});
    return {start:start,stop:stop,el:canvas};
  }
  var fxs=[].map.call(document.querySelectorAll('#wola-home canvas[data-whfx]'),function(c){return Fx(c);});
  if('IntersectionObserver' in window){
    var fio=new IntersectionObserver(function(es){es.forEach(function(e){var f=null;for(var k=0;k<fxs.length;k++){if(fxs[k].el===e.target){f=fxs[k];break;}}if(!f)return;if(e.isIntersecting)f.start();else f.stop();});},{threshold:0.05});
    fxs.forEach(function(f){fio.observe(f.el);});
  } else { fxs.forEach(function(f){f.start();}); }
})();
</script>

<?php get_footer(); ?>

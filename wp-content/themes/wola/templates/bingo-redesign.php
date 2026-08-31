<?php /* Template Name: Bingo Redesign (Claude) */ require_once get_stylesheet_directory() . '/inc/wola-events.php'; // WOLAEVENTS — DO NOT REMOVE: auto-expiring bingo flyers, managed in inc/wola-events.php
get_header(); ?>
<!--
  WOLASTOQ CASINO - BINGO PAGE (REDESIGNED BODY, BLACK CASINO THEME)
  ------------------------------------------------------------
  HOW TO USE:
  This file is standalone and Netlify-ready when uploaded with the page-assets
  folder. For WordPress, paste everything below this comment (the <style>, the
  <div id="wolastoq-bingo">, and the <script>) into a single "Custom HTML" block.
  All CSS is scoped under #wolastoq-bingo so it will not affect your theme.

  THEME: deep black body (#08060D) to match the casino, violet menu accents
  (#BC0FD4 -> #5D029E), gold/yellow highlights (#FFF982), and the original
  hero banner photo is included locally in page-assets.
-->

<style>
/* ============ WOLASTOQ BINGO - SCOPED BLACK THEME ============ */
#wolastoq-bingo *{box-sizing:border-box;margin:0;padding:0}
#wolastoq-bingo{
  --magenta:#BC0FD4;
  --purple:#5D029E;
  --black:#08060D;
  --black-2:#140A1F;
  --night:#050308;
  --yellow:#FFF982;
  --gold:#FFD23B;
  --line:rgba(255,249,130,.2);
  --card:rgba(68,22,92,.42);
  --text:#fffaf2;
  --muted:#d9d0e8;
  font-family:'Poppins','Aptos','Segoe UI',Arial,sans-serif;
  color:var(--text);
  line-height:1.6;
  font-size:17px;
  background:
    radial-gradient(78% 52% at 8% 0%,rgba(188,15,212,.22),transparent 58%),
    radial-gradient(70% 56% at 96% 8%,rgba(255,210,59,.13),transparent 56%),
    linear-gradient(180deg,var(--black),var(--night));
  overflow-x:hidden;
}
#wolastoq-bingo h1,#wolastoq-bingo h2,#wolastoq-bingo h3,#wolastoq-bingo h4{line-height:1.12;font-weight:800;letter-spacing:-.5px;color:#fff}
#wolastoq-bingo p{color:var(--muted)}
#wolastoq-bingo .wb-wrap{max-width:1180px;margin:0 auto;padding:0 24px}
#wolastoq-bingo section{position:relative}
#wolastoq-bingo .wb-eyebrow{
  display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;
  letter-spacing:2px;text-transform:uppercase;color:var(--yellow);
  background:linear-gradient(135deg,rgba(188,15,212,.42),rgba(255,249,130,.13));padding:7px 16px;border-radius:50px;margin-bottom:18px;
  border:1px solid rgba(255,249,130,.38);box-shadow:0 10px 24px rgba(93,2,158,.24), inset 0 1px 0 rgba(255,255,255,.12);
}
#wolastoq-bingo h2.wb-title{font-size:clamp(30px,4.4vw,50px);color:#fff}
#wolastoq-bingo .wb-title .hl{
  background:linear-gradient(180deg,#fff 0%,var(--yellow) 52%,var(--gold) 120%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
}

/* ---- Buttons ---- */
#wolastoq-bingo .wb-btn{
  display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:16px;
  padding:16px 30px;border-radius:50px;text-decoration:none;cursor:pointer;border:none;
  transition:transform .18s ease,box-shadow .18s ease;white-space:nowrap;
}
#wolastoq-bingo .wb-btn-primary{
  background:linear-gradient(135deg,var(--yellow),var(--gold));color:var(--purple);
  border:1px solid rgba(255,249,130,.8);
  box-shadow:0 12px 28px rgba(255,210,59,.42),0 0 0 4px rgba(255,249,130,.08);
}
#wolastoq-bingo .wb-btn-primary:hover{transform:translateY(-3px);box-shadow:0 18px 42px rgba(255,210,59,.58),0 0 0 5px rgba(255,249,130,.11)}
#wolastoq-bingo .wb-btn-ghost{background:rgba(93,2,158,.2);color:#fff;border:2px solid rgba(255,249,130,.38);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
#wolastoq-bingo .wb-btn-ghost:hover{background:rgba(188,15,212,.22);border-color:rgba(255,249,130,.7);transform:translateY(-3px)}
#wolastoq-bingo .wb-btn-purple{
  background:linear-gradient(135deg,var(--magenta),var(--purple));color:#fff;
  border:1px solid rgba(255,249,130,.28);
  box-shadow:0 12px 30px rgba(188,15,212,.38),0 0 0 4px rgba(188,15,212,.08);
}
#wolastoq-bingo .wb-btn-purple:hover{transform:translateY(-3px);box-shadow:0 18px 42px rgba(188,15,212,.5),0 0 0 5px rgba(255,249,130,.08)}
/* shine sweep on primary buttons */
#wolastoq-bingo .wb-btn-primary{position:relative;overflow:hidden}
#wolastoq-bingo .wb-btn-primary::after{content:"";position:absolute;top:0;left:-60%;width:45%;height:100%;
  background:linear-gradient(120deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-20deg);animation:wbShine 4s ease-in-out infinite}

/* ============ MOTION / EFFECTS ============ */
@keyframes wbFloat{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-20px) rotate(4deg)}}
@keyframes wbShine{0%{left:-60%}60%,100%{left:160%}}
@keyframes wbPulse{0%,100%{transform:scale(1);opacity:.75}50%{transform:scale(1.14);opacity:1}}
@keyframes wbTwinkle{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes wbMeter{0%{transform:translateX(-42%)}50%{transform:translateX(42%)}100%{transform:translateX(-42%)}}
#wolastoq-bingo .wb-reveal{opacity:0;transform:translateY(34px);transition:opacity .7s ease,transform .7s ease}
#wolastoq-bingo .wb-reveal.wb-in{opacity:1;transform:none}
#wolastoq-bingo .wb-ball-float{position:absolute;z-index:2;filter:drop-shadow(0 10px 22px rgba(0,0,0,.45));animation:wbFloat 6s ease-in-out infinite}
#wolastoq-bingo .wb-ball-float.b1{top:12%;right:7%;width:96px;animation-delay:0s}
#wolastoq-bingo .wb-ball-float.b2{bottom:16%;right:20%;width:78px;animation-delay:1.2s}
#wolastoq-bingo .wb-ball-float.b3{top:18%;left:4%;width:74px;animation-delay:.7s;opacity:.86}
#wolastoq-bingo .wb-ball-float.b4{bottom:9%;right:9%;width:52px;animation-delay:1.9s;opacity:.9}
#wolastoq-bingo .wb-ball-float.b5{bottom:13%;left:10%;width:62px;animation-delay:2.5s;opacity:.82}
#wolastoq-bingo .wb-ball-float.b6{top:45%;left:2.5%;width:48px;animation-delay:3.1s;opacity:.74}
#wolastoq-bingo .wb-ball-float.b7{top:34%;right:2.8%;width:58px;animation-delay:3.7s;opacity:.78}
@media(max-width:880px){#wolastoq-bingo .wb-ball-float.b2,#wolastoq-bingo .wb-ball-float.b4,#wolastoq-bingo .wb-ball-float.b5,#wolastoq-bingo .wb-ball-float.b6,#wolastoq-bingo .wb-ball-float.b7{display:none}#wolastoq-bingo .wb-ball-float.b1{width:68px;top:72px;right:22px;opacity:.72}#wolastoq-bingo .wb-ball-float.b3{width:54px;top:88px;left:18px;opacity:.62}}
@media(prefers-reduced-motion:reduce){#wolastoq-bingo .wb-ball-float,#wolastoq-bingo .wb-btn-primary::after,#wolastoq-bingo .wb-jp-glow,#wolastoq-bingo .wb-phd-sweep{animation:none}#wolastoq-bingo .wb-reveal{opacity:1;transform:none}}

/* ============ STATS PARALLAX BAND ============ */
#wolastoq-bingo .wb-statsband{position:relative;padding:58px 0;
  background:
    radial-gradient(72% 120% at 50% 0%,rgba(255,249,130,.18),transparent 62%),
    linear-gradient(rgba(11,6,20,.62),rgba(8,6,13,.9)),
    url('https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-home-banner.jpg') center/cover no-repeat fixed}
#wolastoq-bingo .wb-stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;text-align:center;position:relative;z-index:2}
#wolastoq-bingo .wb-stat .n{font-size:clamp(40px,6vw,62px);font-weight:900;line-height:1;
  background:linear-gradient(180deg,#fff,var(--yellow));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
#wolastoq-bingo .wb-stat .l{color:#fff;font-weight:600;letter-spacing:1px;font-size:13.5px;text-transform:uppercase;margin-top:8px;opacity:.92}
#wolastoq-bingo .wb-stat+.wb-stat{border-left:1px solid rgba(255,255,255,.12)}
@media(max-width:600px){#wolastoq-bingo .wb-stats-grid{grid-template-columns:1fr;gap:34px}#wolastoq-bingo .wb-stat+.wb-stat{border-left:none}#wolastoq-bingo .wb-statsband{background-attachment:scroll}}

/* ============ HERO BANNER (kept) ============ */
#wolastoq-bingo .wb-hero{
  position:relative;min-height:520px;display:flex;align-items:center;
  background:
    radial-gradient(58% 76% at 9% 20%,rgba(188,15,212,.46),transparent 62%),
    radial-gradient(34% 48% at 89% 24%,rgba(255,249,130,.22),transparent 64%),
    linear-gradient(90deg,rgba(5,3,8,.9) 0%,rgba(12,5,20,.62) 48%,rgba(12,5,20,.22) 100%),
    url('https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-bingo-official.jpg') center/cover no-repeat;
  padding:76px 0;
}
#wolastoq-bingo .wb-hero-inner{position:relative;z-index:3;max-width:780px}
#wolastoq-bingo .wb-hero h1{
  font-size:clamp(40px,6.1vw,72px);font-weight:900;color:#FCD54C;
  text-shadow:0 4px 30px rgba(0,0,0,.72),0 0 32px rgba(255,210,59,.22);
}
#wolastoq-bingo .wb-hero h1 .white{color:#fff;display:block}
#wolastoq-bingo .wb-hero .wb-sub{font-size:clamp(18px,2.2vw,23px);color:#fff;font-weight:600;margin:16px 0 28px;text-shadow:0 2px 16px rgba(0,0,0,.5)}
#wolastoq-bingo .wb-hero-cta{display:flex;gap:16px;flex-wrap:wrap}
#wolastoq-bingo .wb-hero-trust{display:flex;gap:20px 26px;flex-wrap:wrap;margin-top:30px;padding-top:22px;border-top:1px solid rgba(255,255,255,.18)}
#wolastoq-bingo .wb-hero-trust div{display:flex;align-items:center;gap:9px;color:#fff;font-weight:600;font-size:15px}
#wolastoq-bingo .wb-hero-trust svg{flex:none}

/* ============ SECTION SHELLS ============ */
#wolastoq-bingo .wb-band{padding:76px 0;background:linear-gradient(180deg,var(--black),#0d0715)}
#wolastoq-bingo .wb-band.alt{background:linear-gradient(180deg,var(--black-2),#09050f)}
#wolastoq-bingo .wb-section-head{text-align:center;max-width:700px;margin:0 auto 44px}
#wolastoq-bingo .wb-section-head p{font-size:18px;margin-top:14px}

/* ---- cards ---- */
#wolastoq-bingo .wb-card{
  background:linear-gradient(145deg,rgba(96,30,124,.5),rgba(13,7,22,.78));border:1px solid rgba(255,249,130,.18);border-radius:18px;
  box-shadow:0 18px 46px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.08);
  transition:transform .2s ease,border-color .2s ease,background .2s ease,box-shadow .2s ease;
}
#wolastoq-bingo .wb-card:hover{transform:translateY(-6px);border-color:rgba(255,249,130,.55);background:linear-gradient(145deg,rgba(125,38,154,.58),rgba(15,8,25,.84));box-shadow:0 22px 54px rgba(188,15,212,.28),0 0 0 1px rgba(255,249,130,.1) inset}
#wolastoq-bingo .wb-tile:hover{box-shadow:0 18px 44px rgba(188,15,212,.3)}

/* ============ HOW IT WORKS ============ */
#wolastoq-bingo .wb-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
#wolastoq-bingo .wb-step{padding:34px 28px 28px;position:relative}
#wolastoq-bingo .wb-step-num{
  position:absolute;top:-22px;left:30px;width:46px;height:46px;border-radius:14px;
  background:linear-gradient(135deg,var(--magenta),var(--purple));color:#fff;
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:21px;
  box-shadow:0 10px 24px rgba(188,15,212,.42),0 0 0 4px rgba(255,249,130,.08);
}
#wolastoq-bingo .wb-step-ico{width:56px;height:56px;margin:4px 0 16px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(145deg,rgba(255,249,130,.16),rgba(188,15,212,.18));border:1px solid rgba(255,249,130,.34);border-radius:16px}
#wolastoq-bingo .wb-step h3{font-size:22px;margin-bottom:10px}
#wolastoq-bingo .wb-step p{font-size:15px}

/* ============ PLAN YOUR NIGHT ============ */
#wolastoq-bingo .wb-planner{
  background:
    radial-gradient(80% 90% at 85% 10%,rgba(255,249,130,.22),transparent 58%),
    radial-gradient(72% 80% at 4% 24%,rgba(188,15,212,.2),transparent 60%),
    linear-gradient(180deg,var(--black-2),var(--black));
}
#wolastoq-bingo .wb-planner-grid{display:grid;grid-template-columns:.9fr 1.1fr;gap:28px;align-items:stretch}
#wolastoq-bingo .wb-planner-photo{
  position:relative;overflow:hidden;border-radius:24px;min-height:520px;border:1px solid rgba(255,255,255,.14);
  background:
    linear-gradient(180deg,rgba(11,6,20,.08),rgba(11,6,20,.88)),
    url('https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-bingo-official.jpg') center/cover no-repeat;
  box-shadow:0 26px 70px rgba(0,0,0,.32);
}
#wolastoq-bingo .wb-planner-photo-copy{
  position:absolute;left:22px;bottom:22px;z-index:2;width:min(330px,calc(100% - 44px));border-radius:16px;padding:18px 20px 20px;
  background:linear-gradient(135deg,rgba(13,6,22,.9),rgba(188,15,212,.74));
  border:1px solid rgba(255,249,130,.32);box-shadow:0 18px 42px rgba(0,0,0,.4),0 0 38px rgba(188,15,212,.22);
}
#wolastoq-bingo .wb-planner-photo-copy b{display:block;color:var(--yellow);font-size:13px;letter-spacing:1.6px;text-transform:uppercase;margin-bottom:8px}
#wolastoq-bingo .wb-planner-photo-copy h3{font-size:clamp(24px,3vw,32px);max-width:12ch}
#wolastoq-bingo .wb-planner-copy{display:flex;flex-direction:column;justify-content:center}
#wolastoq-bingo .wb-planner-copy .lead{font-size:18px;color:rgba(255,255,255,.78);margin:14px 0 26px}
#wolastoq-bingo .wb-perk-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
#wolastoq-bingo .wb-perk{
  border-radius:18px;border:1px solid rgba(255,249,130,.16);background:linear-gradient(145deg,rgba(88,26,114,.48),rgba(13,7,22,.68));
  padding:18px 18px 17px;min-height:156px;transition:transform .2s ease,border-color .2s ease,background .2s ease;
}
#wolastoq-bingo .wb-perk:hover{transform:translateY(-5px);border-color:rgba(255,249,130,.5);background:linear-gradient(145deg,rgba(116,33,145,.56),rgba(13,7,22,.74))}
#wolastoq-bingo .wb-perk-icon{
  width:42px;height:42px;border-radius:14px;margin-bottom:14px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(145deg,rgba(255,249,130,.18),rgba(188,15,212,.18));border:1px solid rgba(255,249,130,.34);
}
#wolastoq-bingo .wb-perk h3{font-size:18px;margin-bottom:7px}
#wolastoq-bingo .wb-perk p{font-size:14.2px;line-height:1.45}
#wolastoq-bingo .wb-tonight-strip{
  margin-top:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;
}
#wolastoq-bingo .wb-tonight-item{
  border-radius:14px;background:linear-gradient(145deg,rgba(255,249,130,.14),rgba(188,15,212,.11));border:1px solid rgba(255,249,130,.28);padding:14px 13px;
}
#wolastoq-bingo .wb-tonight-item b{display:block;color:var(--yellow);font-size:18px;line-height:1}
#wolastoq-bingo .wb-tonight-item span{display:block;color:rgba(255,255,255,.78);font-size:12.5px;font-weight:650;margin-top:5px}

/* ============ BOOKING WALKTHROUGH ============ */
#wolastoq-bingo .wb-booking-flow{
  background:
    radial-gradient(90% 90% at 18% 8%,rgba(188,15,212,.38),transparent 56%),
    radial-gradient(65% 85% at 88% 18%,rgba(255,249,130,.14),transparent 58%),
    linear-gradient(180deg,var(--black-2),var(--black));
}
#wolastoq-bingo .wb-flow-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}
#wolastoq-bingo .wb-flow-card{
  overflow:hidden;border-radius:22px;border:1px solid rgba(255,249,130,.2);
  background:linear-gradient(145deg,rgba(96,30,124,.5),rgba(13,7,22,.78));
  box-shadow:0 26px 70px rgba(0,0,0,.38),0 0 0 1px rgba(188,15,212,.12) inset;
}
#wolastoq-bingo .wb-flow-shot{
  position:relative;aspect-ratio:16/9;overflow:hidden;background:#0a1220;border-bottom:1px solid rgba(255,255,255,.1);
}
#wolastoq-bingo .wb-flow-shot img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(1.04) contrast(1.04)}
#wolastoq-bingo .wb-flow-shot.panel img{object-position:right top}
#wolastoq-bingo .wb-flow-body{padding:22px 24px 24px}
#wolastoq-bingo .wb-flow-body h3{font-size:22px;margin-bottom:8px}
#wolastoq-bingo .wb-flow-body p{font-size:15px}

/* ============ CASINO IMAGE STORY ============ */
#wolastoq-bingo .wb-photo-story{
  background:
    radial-gradient(85% 70% at 15% 5%,rgba(188,15,212,.3),transparent 60%),
    linear-gradient(180deg,rgba(8,6,13,.9),rgba(11,6,20,.98)),
    url('https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-home-banner.jpg') center/cover no-repeat;
}
#wolastoq-bingo .wb-photo-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:24px;align-items:stretch}
#wolastoq-bingo .wb-photo-main,#wolastoq-bingo .wb-photo-side{display:grid;gap:24px}
#wolastoq-bingo .wb-photo-main{grid-template-rows:1fr}
#wolastoq-bingo .wb-photo-card{
  overflow:hidden;border-radius:22px;border:1px solid rgba(255,249,130,.2);
  background:linear-gradient(145deg,rgba(96,30,124,.34),rgba(13,7,22,.76));box-shadow:0 26px 70px rgba(0,0,0,.36);
}
#wolastoq-bingo .wb-photo-card img{width:100%;height:100%;min-height:260px;object-fit:cover;display:block;filter:saturate(1.18) contrast(1.06) brightness(.9)}
#wolastoq-bingo .wb-photo-main .wb-photo-card img{min-height:584px}
#wolastoq-bingo .wb-photo-caption{padding:18px 20px 20px}
#wolastoq-bingo .wb-photo-caption h3{font-size:21px;margin-bottom:6px}
#wolastoq-bingo .wb-photo-caption p{font-size:14.5px}

/* ============ JACKPOT ============ */
#wolastoq-bingo .wb-jackpot{
  padding:96px 0;overflow:hidden;
  background:
    radial-gradient(120% 130% at 0% 0%,rgba(188,15,212,.58) 0%,rgba(20,10,31,.88) 55%,var(--black) 100%),
    radial-gradient(60% 70% at 92% 18%,rgba(255,249,130,.18),transparent 60%),
    url('https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-bingo-official.jpg') center/cover no-repeat;
}
#wolastoq-bingo .wb-jackpot::before{content:"";position:absolute;inset:0;background:rgba(5,3,8,.42)}
#wolastoq-bingo .wb-jackpot .wb-wrap{position:relative;z-index:2}
#wolastoq-bingo .wb-jackpot-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:50px;align-items:center}
#wolastoq-bingo .wb-jackpot h2{font-size:clamp(28px,4vw,44px);margin-bottom:18px}
#wolastoq-bingo .wb-jackpot p.lead{color:rgba(255,255,255,.8);font-size:18px;margin-bottom:28px}
#wolastoq-bingo .wb-jp-list{list-style:none;margin-bottom:34px}
#wolastoq-bingo .wb-jp-list li{display:flex;gap:14px;align-items:flex-start;color:#fff;margin-bottom:16px;font-weight:500;font-size:16px}
#wolastoq-bingo .wb-jp-list li svg{flex:none;margin-top:3px}
#wolastoq-bingo .wb-jp-visual{position:relative;display:flex;align-items:center;justify-content:center}
#wolastoq-bingo .wb-jp-card{
  position:relative;background:linear-gradient(160deg,rgba(188,15,212,.36),rgba(7,4,12,.72));
  border:1px solid rgba(255,249,130,.52);border-radius:28px;padding:46px 40px;text-align:center;
  box-shadow:0 30px 70px rgba(0,0,0,.55),0 0 48px rgba(255,210,59,.12);width:100%;
}
#wolastoq-bingo .wb-jp-label{font-size:13px;letter-spacing:3px;font-weight:700;color:var(--yellow);text-transform:uppercase}
#wolastoq-bingo .wb-jp-amount{
  font-size:clamp(56px,9vw,86px);font-weight:900;line-height:1;margin:12px 0 6px;
  background:linear-gradient(180deg,#fff,var(--yellow));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  text-shadow:0 0 40px rgba(255,249,130,.4);
}
#wolastoq-bingo .wb-jp-sub{color:rgba(255,255,255,.75);font-weight:600;letter-spacing:1px;font-size:14px}
#wolastoq-bingo .wb-jp-glow{position:absolute;width:300px;height:300px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,249,130,.35),transparent 65%);filter:blur(20px);z-index:0;animation:wbPulse 3.6s ease-in-out infinite}

/* ============ SCHEDULE & PHDS ============ */
#wolastoq-bingo .wb-play-panel{
  margin-bottom:44px;border-radius:24px;border:1px solid rgba(255,249,130,.2);
  background:
    radial-gradient(80% 90% at 100% 0%,rgba(255,249,130,.12),transparent 58%),
    linear-gradient(145deg,rgba(84,26,110,.46),rgba(11,6,20,.8));
  box-shadow:0 26px 70px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.08);padding:34px;
}
#wolastoq-bingo .wb-info-grid{display:grid;grid-template-columns:.82fr 1.18fr;gap:32px;align-items:stretch}
#wolastoq-bingo .wb-info-visual{
  min-height:190px;border-radius:20px;position:relative;overflow:hidden;border:1px solid rgba(255,249,130,.32);
  background:
    linear-gradient(145deg,rgba(11,6,20,.34),rgba(11,6,20,.85)),
    url('https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-bingo-official.jpg') center/cover no-repeat;
}
#wolastoq-bingo .wb-info-visual::after{
  content:"";position:absolute;inset:auto 22px 22px 22px;height:80px;border-radius:18px;
  background:linear-gradient(135deg,rgba(188,15,212,.92),rgba(93,2,158,.92));
  border:1px solid rgba(255,249,130,.3);box-shadow:0 18px 40px rgba(0,0,0,.38),0 0 32px rgba(188,15,212,.24);
}
#wolastoq-bingo .wb-info-badge{
  position:absolute;left:42px;right:42px;bottom:42px;z-index:2;color:#fff;font-weight:900;font-size:clamp(26px,4vw,42px);
  line-height:1.05;text-shadow:0 4px 20px rgba(0,0,0,.45);
}
#wolastoq-bingo .wb-info-copy{display:grid;gap:18px}
#wolastoq-bingo .wb-info-copy h3{font-size:30px;margin-bottom:10px}
#wolastoq-bingo .wb-info-copy p{font-size:16px}
#wolastoq-bingo .wb-mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
#wolastoq-bingo .wb-mini{
  border:1px solid rgba(255,249,130,.16);border-radius:16px;background:linear-gradient(145deg,rgba(255,249,130,.1),rgba(188,15,212,.1));
  padding:18px 16px;min-height:104px;
}
#wolastoq-bingo .wb-mini b{display:block;color:var(--yellow);font-size:24px;line-height:1;margin-bottom:8px}
#wolastoq-bingo .wb-mini span{display:block;color:#fff;font-size:13.5px;font-weight:650;line-height:1.25}
#wolastoq-bingo .wb-phd-packages{
  position:relative;border-top:1px solid rgba(255,255,255,.1);padding-top:22px;overflow:hidden;
}
#wolastoq-bingo .wb-phd-packages::before{
  content:"";position:absolute;right:-120px;top:26px;width:260px;height:260px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,249,130,.26),transparent 68%);pointer-events:none;
}
#wolastoq-bingo .wb-phd-showcase{
  position:relative;display:grid;grid-template-columns:.78fr 1.22fr;gap:18px;align-items:stretch;
}
#wolastoq-bingo .wb-phd-device{
  position:relative;min-height:394px;border-radius:22px;padding:18px;
  background:
    radial-gradient(110% 100% at 50% 0%,rgba(255,249,130,.3),transparent 45%),
    radial-gradient(70% 90% at 4% 12%,rgba(188,15,212,.42),transparent 58%),
    linear-gradient(155deg,rgba(188,15,212,.44),rgba(10,6,18,.94) 62%);
  border:1px solid rgba(255,249,130,.38);box-shadow:0 24px 62px rgba(0,0,0,.42),0 0 38px rgba(188,15,212,.2);
  overflow:hidden;
}
#wolastoq-bingo .wb-phd-device::before{
  content:"";position:absolute;inset:18px;border-radius:26px;border:1px solid rgba(255,255,255,.16);
  background:linear-gradient(145deg,rgba(255,255,255,.08),rgba(255,255,255,.02));
}
#wolastoq-bingo .wb-phd-device-top{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:18px}
#wolastoq-bingo .wb-phd-device-top span:first-child{
  color:var(--yellow);font-size:11.5px;letter-spacing:1.25px;text-transform:uppercase;font-weight:800;line-height:1.25;min-width:0;
}
#wolastoq-bingo .wb-phd-live{
  flex:none;display:inline-flex;align-items:center;gap:7px;color:#fff;font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;
  background:rgba(255,249,130,.14);border:1px solid rgba(255,249,130,.36);border-radius:50px;padding:6px 11px;
}
#wolastoq-bingo .wb-phd-live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--yellow);box-shadow:0 0 12px rgba(255,249,130,.8)}
#wolastoq-bingo .wb-phd-screen{
  position:relative;z-index:2;border-radius:20px;padding:18px;
  background:linear-gradient(180deg,rgba(11,6,20,.95),rgba(24,8,36,.8));
  border:1px solid rgba(255,249,130,.18);box-shadow:inset 0 0 38px rgba(188,15,212,.24);
}
#wolastoq-bingo .wb-phd-number-row{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:18px}
#wolastoq-bingo .wb-phd-ball{
  aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:#240036;font-weight:900;font-size:13px;background:linear-gradient(180deg,#fff,var(--yellow));
  box-shadow:0 8px 18px rgba(0,0,0,.34), inset 0 -4px 10px rgba(93,2,158,.18);
}
#wolastoq-bingo .wb-phd-meter{
  position:relative;height:9px;border-radius:50px;background:rgba(255,255,255,.1);overflow:hidden;margin-bottom:18px;
}
#wolastoq-bingo .wb-phd-sweep{
  position:absolute;inset:0;width:58%;border-radius:50px;
  background:linear-gradient(90deg,var(--magenta),var(--yellow));box-shadow:0 0 24px rgba(255,249,130,.5);
  animation:wbMeter 4s ease-in-out infinite;
}
#wolastoq-bingo .wb-phd-device h3{position:relative;z-index:2;font-size:26px;margin-bottom:10px}
#wolastoq-bingo .wb-phd-device p{position:relative;z-index:2;color:rgba(255,255,255,.82);font-size:14.5px}
#wolastoq-bingo .wb-phd-device-stats{
  position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px;
}
#wolastoq-bingo .wb-phd-device-stat{
  border-radius:14px;background:linear-gradient(145deg,rgba(255,249,130,.11),rgba(188,15,212,.12));border:1px solid rgba(255,249,130,.18);padding:13px 12px;
}
#wolastoq-bingo .wb-phd-device-stat b{display:block;color:var(--yellow);font-size:22px;line-height:1}
#wolastoq-bingo .wb-phd-device-stat span{display:block;color:rgba(255,255,255,.78);font-size:12px;font-weight:650;margin-top:5px}
#wolastoq-bingo .wb-package-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
#wolastoq-bingo .wb-package{
  position:relative;overflow:hidden;border:1px solid rgba(255,249,130,.16);border-radius:18px;
  background:linear-gradient(155deg,rgba(89,26,116,.5),rgba(14,7,24,.78));
  padding:17px 16px 16px;min-height:138px;transition:transform .2s ease,border-color .2s ease,background .2s ease;
}
#wolastoq-bingo .wb-package:hover{transform:translateY(-4px);border-color:rgba(255,249,130,.5);background:linear-gradient(155deg,rgba(119,35,149,.6),rgba(14,7,24,.84))}
#wolastoq-bingo .wb-package.featured{
  border-color:rgba(255,249,130,.58);
  background:linear-gradient(155deg,rgba(255,249,130,.24),rgba(188,15,212,.28) 52%,rgba(20,10,31,.76));
  box-shadow:0 18px 44px rgba(255,210,59,.2),0 0 0 1px rgba(255,249,130,.12) inset;
}
#wolastoq-bingo .wb-package-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:13px}
#wolastoq-bingo .wb-package strong{display:block;color:#fff;font-size:14px;letter-spacing:.3px;text-transform:uppercase}
#wolastoq-bingo .wb-package .wb-phd-price{
  display:block;color:var(--yellow);font-size:30px;font-weight:900;line-height:1;margin-top:3px;
}
#wolastoq-bingo .wb-package .wb-phd-count{display:block;color:#fff;font-weight:800;font-size:17px;margin-bottom:4px}
#wolastoq-bingo .wb-package span{display:block;color:var(--muted);font-size:13.3px;line-height:1.35}
#wolastoq-bingo .wb-package-badge{
  color:#26002f;background:var(--yellow);font-size:10px;line-height:1;font-weight:900;text-transform:uppercase;
  border-radius:50px;padding:6px 8px;white-space:nowrap;
}
#wolastoq-bingo .wb-phd-note{
  margin-top:14px;border-radius:16px;padding:15px 16px;
  background:linear-gradient(135deg,rgba(255,249,130,.13),rgba(188,15,212,.1));border:1px solid rgba(255,249,130,.24);
  color:rgba(255,255,255,.82);font-size:14px;
}
#wolastoq-bingo .wb-phd-note strong{color:#fff}
#wolastoq-bingo .wb-table{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;background:transparent;border-radius:0;overflow:visible;border:none}
#wolastoq-bingo .wb-row{display:grid;grid-template-columns:1fr;align-content:space-between;gap:14px;min-height:134px;padding:20px 22px;border-radius:18px;border:1px solid rgba(255,249,130,.16);background:linear-gradient(145deg,rgba(80,25,105,.46),rgba(13,7,22,.76));box-shadow:0 18px 40px rgba(0,0,0,.24)}
#wolastoq-bingo .wb-row.featured{grid-column:span 2;background:linear-gradient(135deg,rgba(188,15,212,.3),rgba(255,249,130,.13));border-color:rgba(255,249,130,.34);box-shadow:0 20px 46px rgba(188,15,212,.22)}
#wolastoq-bingo .wb-row .wb-day{font-weight:800;color:#fff;font-size:16px}
#wolastoq-bingo .wb-row .wb-time{font-size:13.8px;color:var(--muted);margin-top:6px;line-height:1.45}
#wolastoq-bingo .wb-pill{font-size:11.5px;font-weight:700;letter-spacing:.5px;padding:6px 13px;border-radius:50px;text-transform:uppercase;white-space:nowrap}
#wolastoq-bingo .wb-row .wb-pill{justify-self:start}
#wolastoq-bingo .wb-pill.online{background:rgba(255,249,130,.16);color:var(--yellow);border:1px solid rgba(255,249,130,.38)}
#wolastoq-bingo .wb-pill.inperson{background:rgba(188,15,212,.28);color:#fff;border:1px solid rgba(255,249,130,.28)}
#wolastoq-bingo .wb-sched-note{text-align:center;margin-top:30px;font-size:15px;color:var(--muted)}
#wolastoq-bingo .wb-sched-note strong{color:var(--yellow)}

/* ============ BOOK ONLINE ============ */
#wolastoq-bingo .wb-book-grid{display:grid;grid-template-columns:1fr 1fr;gap:50px;align-items:center}
#wolastoq-bingo .wb-tips{list-style:none;margin:26px 0 32px}
#wolastoq-bingo .wb-tips li{display:flex;gap:13px;align-items:flex-start;margin-bottom:14px;font-size:15.5px;color:#fff;font-weight:500}
#wolastoq-bingo .wb-tips li svg{flex:none;margin-top:2px}
#wolastoq-bingo .wb-book-cta{display:flex;gap:14px;flex-wrap:wrap}
#wolastoq-bingo .wb-mock{background:linear-gradient(145deg,rgba(76,23,100,.48),rgba(10,6,18,.86));border-radius:22px;border:1px solid rgba(255,249,130,.2);overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.45)}
#wolastoq-bingo .wb-mock-head{background:linear-gradient(135deg,var(--magenta),var(--purple));padding:20px 24px;display:flex;align-items:center;justify-content:space-between}
#wolastoq-bingo .wb-mock-head span{color:#fff;font-weight:700;letter-spacing:1px;font-size:14px}
#wolastoq-bingo .wb-mock-body{padding:26px 24px}
#wolastoq-bingo .wb-mock-line{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px dashed rgba(255,255,255,.14)}
#wolastoq-bingo .wb-mock-line span:first-child{font-weight:600;color:#fff;font-size:15px}
#wolastoq-bingo .wb-mock-line span:last-child{color:var(--yellow);font-weight:700}
#wolastoq-bingo .wb-mock-total{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:16px}
#wolastoq-bingo .wb-mock-total span:first-child{font-weight:700;font-size:16px;color:#fff}
#wolastoq-bingo .wb-mock-total span:last-child{font-weight:900;font-size:22px;color:var(--yellow)}

/* ============ COSMIC BINGO ============ */
#wolastoq-bingo .wb-cosmic{
  padding:96px 0;position:relative;overflow:hidden;
  background:
    radial-gradient(130% 120% at 80% 10%,rgba(188,15,212,.5) 0%,rgba(11,6,20,.97) 55%,var(--night) 100%),
    radial-gradient(80% 80% at 15% 90%,rgba(255,249,130,.14),transparent 60%);
}
#wolastoq-bingo .wb-cosmic::before{content:"";position:absolute;inset:0;background:rgba(8,4,16,.5)}
#wolastoq-bingo .wb-stars{position:absolute;inset:0;pointer-events:none;opacity:.85;z-index:1}
#wolastoq-bingo .wb-cosmic-grid{position:relative;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center}
#wolastoq-bingo .wb-cosmic h2{font-size:clamp(30px,4.6vw,52px);margin-bottom:18px}
#wolastoq-bingo .wb-cosmic h2 em{font-style:normal;background:linear-gradient(90deg,#fff,var(--yellow),#ff6be0);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
#wolastoq-bingo .wb-cosmic p.lead{color:rgba(255,255,255,.82);font-size:18px;margin-bottom:26px}
#wolastoq-bingo .wb-tagrow{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:30px}
#wolastoq-bingo .wb-glowtag{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:50px;font-weight:600;font-size:14.5px;color:#fff;
  background:rgba(188,15,212,.18);border:1px solid rgba(255,249,130,.32);box-shadow:0 0 18px rgba(188,15,212,.18) inset}
#wolastoq-bingo .wb-cosmic-art{display:flex;align-items:center;justify-content:center;position:relative}

/* ============ EVENTS ============ */
#wolastoq-bingo .wb-events{
  background:
    radial-gradient(85% 95% at 50% 8%,rgba(188,15,212,.32),transparent 62%),
    radial-gradient(70% 80% at 8% 95%,rgba(255,249,130,.12),transparent 58%),
    linear-gradient(180deg,var(--black),#0d0715);
}
#wolastoq-bingo .wb-events .wb-section-head{max-width:820px;margin-bottom:54px}
#wolastoq-bingo .wb-event-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
#wolastoq-bingo .wb-flyer{
  border-radius:22px;overflow:hidden;min-height:420px;display:flex;flex-direction:column;
  box-shadow:0 24px 62px rgba(0,0,0,.34),0 0 0 1px rgba(255,249,130,.08) inset;
}
#wolastoq-bingo .wb-flyer-top{
  min-height:276px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  background:
    radial-gradient(68% 80% at 50% 36%,rgba(255,249,130,.22),transparent 62%),
    linear-gradient(150deg,rgba(188,15,212,.54),rgba(93,2,158,.28));
  position:relative;
}
#wolastoq-bingo .wb-flyer-top svg{width:78px;height:78px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.24))}
#wolastoq-bingo .wb-flyer-top img{width:min(180px,72%);height:auto;filter:drop-shadow(0 14px 28px rgba(0,0,0,.34))}
#wolastoq-bingo .wb-flyer.sample .wb-flyer-top{
  background:
    radial-gradient(75% 80% at 50% 36%,rgba(255,249,130,.26),transparent 62%),
    linear-gradient(150deg,rgba(188,15,212,.58),rgba(20,10,31,.54));
}
#wolastoq-bingo .wb-flyer-tag{
  position:absolute;top:18px;left:18px;background:var(--yellow);color:var(--purple);font-weight:800;
  font-size:12px;letter-spacing:1.2px;padding:8px 14px;border-radius:50px;text-transform:uppercase;
}
#wolastoq-bingo .wb-flyer-body{padding:28px 28px 32px;text-align:center;display:flex;flex:1;flex-direction:column;justify-content:center}
#wolastoq-bingo .wb-flyer .wb-flyer-body{background:linear-gradient(180deg,rgba(18,9,29,.94),rgba(9,5,15,.98))}
#wolastoq-bingo .wb-flyer-body h4{font-size:23px;font-weight:800;margin-bottom:8px}
#wolastoq-bingo .wb-flyer-body p{font-size:16px;margin-top:0;color:rgba(255,255,255,.74)}
#wolastoq-bingo .wb-events-cta{text-align:center;margin-top:38px}

/* ============ READY BANNER ============ */
#wolastoq-bingo .wb-ready-inner{
  background:
    radial-gradient(68% 120% at 100% 0%,rgba(255,249,130,.24),transparent 58%),
    radial-gradient(120% 160% at 100% 0%,var(--magenta),var(--purple) 55%,#24003d);
  border:1px solid rgba(255,249,130,.36);
  border-radius:28px;padding:60px 50px;text-align:center;position:relative;overflow:hidden;
  box-shadow:0 30px 70px rgba(0,0,0,.5),0 0 52px rgba(188,15,212,.2);
}
#wolastoq-bingo .wb-ready-inner h2{color:#fff;font-size:clamp(28px,4vw,46px);margin-bottom:14px;position:relative;z-index:2}
#wolastoq-bingo .wb-ready-inner p{color:rgba(255,255,255,.9);font-size:18px;margin-bottom:30px;position:relative;z-index:2}
#wolastoq-bingo .wb-ready-inner .wb-btn{position:relative;z-index:2}
#wolastoq-bingo .wb-ready-balls{position:absolute;inset:0;z-index:1;opacity:.45}

/* ============ FAQ ============ */
#wolastoq-bingo .wb-faq-list{max-width:820px;margin:0 auto}
#wolastoq-bingo .wb-faq-item{border:1px solid rgba(255,249,130,.16);border-radius:14px;margin-bottom:14px;overflow:hidden;background:linear-gradient(145deg,rgba(72,22,96,.42),rgba(10,6,18,.82));transition:border-color .2s}
#wolastoq-bingo .wb-faq-item[open]{border-color:rgba(255,249,130,.4)}
#wolastoq-bingo .wb-faq-q{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:20px 24px;font-weight:700;font-size:17px;color:#fff}
#wolastoq-bingo .wb-faq-q::-webkit-details-marker{display:none}
#wolastoq-bingo .wb-faq-icon{flex:none;width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--magenta),var(--purple));
  display:flex;align-items:center;justify-content:center;transition:transform .25s}
#wolastoq-bingo .wb-faq-item[open] .wb-faq-icon{transform:rotate(45deg)}
#wolastoq-bingo .wb-faq-a{padding:0 24px 22px;color:var(--muted);font-size:15.5px}

/* ============ TESTIMONIALS ============ */
#wolastoq-bingo .wb-review-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
#wolastoq-bingo .wb-review{padding:30px 28px}
#wolastoq-bingo .wb-rstars{display:flex;gap:3px;margin-bottom:14px}
#wolastoq-bingo .wb-review p{font-size:15.5px;color:#fff;margin-bottom:18px}
#wolastoq-bingo .wb-review .wb-author{display:flex;align-items:center;gap:12px}
#wolastoq-bingo .wb-avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--magenta),var(--purple));
  color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:17px}
#wolastoq-bingo .wb-author b{font-size:15px;color:#fff}
#wolastoq-bingo .wb-author span{font-size:13px;color:var(--muted)}

/* ============ EXPLORE WOLASTOQ (cross-links) ============ */
#wolastoq-bingo .wb-explore-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
#wolastoq-bingo .wb-tile{position:relative;border-radius:18px;overflow:hidden;height:230px;display:block;text-decoration:none;border:1px solid rgba(255,249,130,.18);transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
#wolastoq-bingo .wb-tile:hover{transform:translateY(-6px);border-color:rgba(255,249,130,.58);box-shadow:0 22px 54px rgba(188,15,212,.24)}
#wolastoq-bingo .wb-tile img{width:100%;height:100%;object-fit:cover;transition:transform .45s ease;filter:brightness(.6)}
#wolastoq-bingo .wb-tile:hover img{transform:scale(1.08)}
#wolastoq-bingo .wb-tile::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,6,20,.1) 25%,rgba(11,6,20,.92) 100%)}
#wolastoq-bingo .wb-tile-body{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:22px 24px}
#wolastoq-bingo .wb-tile-body h4{color:#fff;font-size:21px;margin-bottom:4px}
#wolastoq-bingo .wb-tile-body span{color:var(--yellow);font-weight:600;font-size:13.5px;display:inline-flex;align-items:center;gap:6px}
#wolastoq-bingo .wb-ready-logo{height:48px;width:auto;margin-bottom:22px;position:relative;z-index:2}

/* ============ RESPONSIVE ============ */
@media(max-width:900px){
  #wolastoq-bingo .wb-steps,#wolastoq-bingo .wb-flow-grid,#wolastoq-bingo .wb-event-grid,#wolastoq-bingo .wb-review-grid,#wolastoq-bingo .wb-explore-grid{grid-template-columns:1fr}
  #wolastoq-bingo .wb-jackpot-grid,#wolastoq-bingo .wb-info-grid,#wolastoq-bingo .wb-book-grid,#wolastoq-bingo .wb-cosmic-grid,#wolastoq-bingo .wb-photo-grid,#wolastoq-bingo .wb-planner-grid{grid-template-columns:1fr;gap:34px}
  #wolastoq-bingo .wb-jp-visual{order:-1}
  #wolastoq-bingo .wb-mini-grid,#wolastoq-bingo .wb-package-grid,#wolastoq-bingo .wb-phd-showcase{grid-template-columns:1fr}
  #wolastoq-bingo .wb-table{grid-template-columns:1fr}
  #wolastoq-bingo .wb-row.featured{grid-column:auto}
  #wolastoq-bingo .wb-phd-device{min-height:330px}
  #wolastoq-bingo .wb-info-visual{min-height:280px}
  #wolastoq-bingo .wb-planner-photo{min-height:360px}
  #wolastoq-bingo .wb-photo-main .wb-photo-card img{min-height:320px}
  #wolastoq-bingo .wb-flyer{min-height:auto}
  #wolastoq-bingo .wb-flyer-top{min-height:230px}
}
@media(max-width:560px){
  #wolastoq-bingo{font-size:16px}
  #wolastoq-bingo .wb-wrap{padding:0 18px}
  #wolastoq-bingo .wb-eyebrow{font-size:11px;letter-spacing:1.35px;padding:7px 12px;max-width:86%}
  #wolastoq-bingo .wb-ball-float.b1{display:none}
  #wolastoq-bingo .wb-hero{min-height:auto;padding:62px 0 54px;background-position:center}
  #wolastoq-bingo .wb-hero h1{font-size:clamp(36px,11vw,48px);line-height:1.08}
  #wolastoq-bingo .wb-hero .wb-sub{font-size:17px;margin:14px 0 24px;max-width:18rem}
  #wolastoq-bingo .wb-hero-cta{gap:12px}
  #wolastoq-bingo .wb-hero-cta .wb-btn{width:100%;justify-content:center;padding:15px 22px}
  #wolastoq-bingo .wb-hero-trust{display:grid;gap:13px;margin-top:26px;padding-top:22px}
  #wolastoq-bingo .wb-band{padding:62px 0}
  #wolastoq-bingo .wb-section-head{margin-bottom:34px}
  #wolastoq-bingo h2.wb-title{font-size:clamp(29px,9vw,38px)}
  #wolastoq-bingo .wb-step{padding:32px 24px 25px}
  #wolastoq-bingo .wb-step-num{left:24px}
  #wolastoq-bingo .wb-flow-body{padding:18px 18px 20px}
  #wolastoq-bingo .wb-flow-shot{aspect-ratio:4/3}
  #wolastoq-bingo .wb-perk-grid,#wolastoq-bingo .wb-tonight-strip{grid-template-columns:1fr}
  #wolastoq-bingo .wb-planner-photo{min-height:330px}
  #wolastoq-bingo .wb-planner-photo-copy{left:22px;right:22px;bottom:22px;padding:20px 22px 22px}
  #wolastoq-bingo .wb-photo-card img,#wolastoq-bingo .wb-photo-main .wb-photo-card img{min-height:220px}
  #wolastoq-bingo .wb-play-panel{padding:22px}
  #wolastoq-bingo .wb-events .wb-section-head{margin-bottom:32px}
  #wolastoq-bingo .wb-flyer-top{min-height:220px}
  #wolastoq-bingo .wb-flyer-body{padding:24px 22px 28px}
  #wolastoq-bingo .wb-flyer-body h4{font-size:21px}
  #wolastoq-bingo .wb-info-badge{left:26px;right:26px;bottom:34px}
  #wolastoq-bingo .wb-row{min-height:auto;padding:18px}
  #wolastoq-bingo .wb-ready-inner{padding:36px 24px}
}

#wolastoq-bingo .wb-phd-ball:nth-child(1){background:radial-gradient(circle at 35% 30%,#8fb8ff,#4169E1 62%,#1c3a8f)!important;color:#fff!important}
#wolastoq-bingo .wb-phd-ball:nth-child(2){background:radial-gradient(circle at 35% 30%,#ff9d9d,#E02020 62%,#8f1414)!important;color:#fff!important}
#wolastoq-bingo .wb-phd-ball:nth-child(3){background:radial-gradient(circle at 35% 30%,#ffffff,#eef0f5 62%,#cfcfda)!important;color:#2a2a33!important}
#wolastoq-bingo .wb-phd-ball:nth-child(4){background:radial-gradient(circle at 35% 30%,#6fce9a,#128a44 62%,#0a4f28)!important;color:#fff!important}
#wolastoq-bingo .wb-phd-ball:nth-child(5){background:radial-gradient(circle at 35% 30%,#fff39a,#FFD23B 62%,#e0a400)!important;color:#5a4200!important}

/* ============ BIG BANK BINGO EVENT ============ */
#wolastoq-bingo .wb-bbb{padding-top:46px;padding-bottom:46px}
#wolastoq-bingo .wb-bbb-card{position:relative;overflow:hidden;border-radius:28px;border:1px solid rgba(255,249,130,.4);background:radial-gradient(120% 120% at 50% -12%,rgba(188,15,212,.3),transparent 60%),linear-gradient(165deg,#240f42 0%,#160a2b 55%,#0b0616 100%);box-shadow:0 34px 80px rgba(0,0,0,.55),0 0 64px rgba(188,15,212,.2);padding:46px 40px}
#wolastoq-bingo .wb-bbb-card::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#BC0FD4,#FFD23B 50%,#BC0FD4)}
#wolastoq-bingo .wb-bbb-flag{position:absolute;top:20px;right:22px;background:linear-gradient(120deg,#BC0FD4,#7a1fd0);color:#fff;font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;padding:6px 14px;border-radius:40px}
#wolastoq-bingo .wb-bbb-head{text-align:center;margin-bottom:30px}
#wolastoq-bingo .wb-bbb-title{font-family:'Anton',sans-serif;font-weight:400;letter-spacing:.6px;font-size:clamp(42px,6.6vw,72px);line-height:1;margin:0;color:#fff}
#wolastoq-bingo .wb-bbb-title span{color:#FFD23B}
#wolastoq-bingo .wb-bbb-date{margin:10px 0 16px;color:#ecdfff;font-weight:700;letter-spacing:1.2px;font-size:clamp(15px,2.2vw,20px);text-transform:uppercase}
#wolastoq-bingo .wb-bbb-online{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(120deg,#FFD23B,#ffb703);color:#3a1d00;font-weight:800;letter-spacing:.4px;text-transform:uppercase;font-size:13px;padding:9px 18px;border-radius:40px}
#wolastoq-bingo .wb-bbb-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px}
#wolastoq-bingo .wb-bbb-tier{border-radius:20px;padding:24px;border:1px solid rgba(255,249,130,.22);background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.02))}
#wolastoq-bingo .wb-bbb-tier.alt{border-color:rgba(188,15,212,.42);background:linear-gradient(160deg,rgba(188,15,212,.16),rgba(255,255,255,.02))}
#wolastoq-bingo .wb-bbb-tier-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
#wolastoq-bingo .wb-bbb-tier-name{color:#ecdfff;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:13px}
#wolastoq-bingo .wb-bbb-tier-amt{font-family:'Anton',sans-serif;font-weight:400;font-size:42px;line-height:1;color:#FFD23B}
#wolastoq-bingo .wb-bbb-incl{list-style:none;margin:0;padding:0;display:grid;gap:11px}
#wolastoq-bingo .wb-bbb-incl li{position:relative;padding-left:26px;color:#e2d8f5;font-size:15px;line-height:1.4}
#wolastoq-bingo .wb-bbb-incl li::before{content:"";position:absolute;left:0;top:5px;width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff39a,#FFD23B 65%,#e0a400)}
#wolastoq-bingo .wb-bbb-phd{margin:0 0 18px;color:#e2d8f5;font-size:15px;line-height:1.45}
#wolastoq-bingo .wb-bbb-time{display:flex;gap:12px}
#wolastoq-bingo .wb-bbb-time>div{flex:1;text-align:center;border-radius:14px;padding:12px 8px;background:rgba(0,0,0,.24)}
#wolastoq-bingo .wb-bbb-time b{display:block;color:#fff;font-size:19px;font-weight:800}
#wolastoq-bingo .wb-bbb-time span{color:#c9bce3;font-size:11px;letter-spacing:.6px;text-transform:uppercase}
#wolastoq-bingo .wb-bbb-jp-head{text-align:center;color:#FFD23B;font-weight:800;letter-spacing:2px;text-transform:uppercase;font-size:13px;margin:6px 0 14px}
#wolastoq-bingo .wb-bbb-prizes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
#wolastoq-bingo .wb-bbb-jackpots{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:12px;margin-bottom:30px}
#wolastoq-bingo .wb-bbb-prize{text-align:center;border-radius:16px;padding:18px 10px;background:linear-gradient(160deg,rgba(255,249,130,.1),rgba(255,255,255,.02));border:1px solid rgba(255,249,130,.2)}
#wolastoq-bingo .wb-bbb-prize b{display:block;font-family:'Anton',sans-serif;font-weight:400;font-size:28px;color:#FFD23B;line-height:1}
#wolastoq-bingo .wb-bbb-prize span{display:block;margin-top:7px;color:#d9cdef;font-size:12px;letter-spacing:.5px;text-transform:uppercase;line-height:1.3}
#wolastoq-bingo .wb-bbb-prize--big{background:linear-gradient(160deg,rgba(188,15,212,.32),rgba(255,249,130,.12));border-color:rgba(255,249,130,.55)}
#wolastoq-bingo .wb-bbb-prize--big b{font-size:34px}
#wolastoq-bingo .wb-bbb-cta-wrap{text-align:center}
#wolastoq-bingo .wb-bbb-cta-wrap .wb-btn{display:inline-flex;align-items:center;gap:8px}
@media(max-width:760px){
  #wolastoq-bingo .wb-bbb-card{padding:34px 20px}
  #wolastoq-bingo .wb-bbb-grid{grid-template-columns:1fr}
  #wolastoq-bingo .wb-bbb-jackpots{grid-template-columns:1fr 1fr}
  #wolastoq-bingo .wb-bbb-jackpots .wb-bbb-prize--big{grid-column:1 / -1}
}

#wolastoq-bingo .wb-bbb-flyer{display:block;max-width:600px;margin:0 auto;border-radius:24px;overflow:hidden;box-shadow:0 34px 80px rgba(0,0,0,.55),0 0 60px rgba(188,15,212,.22);transition:transform .2s ease,box-shadow .2s ease}
#wolastoq-bingo .wb-bbb-flyer:hover{transform:translateY(-4px);box-shadow:0 40px 92px rgba(0,0,0,.6),0 0 74px rgba(188,15,212,.3)}
#wolastoq-bingo .wb-bbb-flyer img{display:block;width:100%;height:auto}
#wolastoq-bingo .wb-bbb-flyer-cta{text-align:center;margin-top:26px}
#wolastoq-bingo .wb-bbb-flyer-cta .wb-btn{display:inline-flex;align-items:center;gap:8px}

#wolastoq-bingo .wb-bbb-invite{text-align:center;max-width:780px;margin:0 auto 34px}
#wolastoq-bingo .wb-bbb-invite-flag{display:inline-block;background:linear-gradient(120deg,#BC0FD4,#ff6be0);color:#fff;font-weight:800;letter-spacing:2px;text-transform:uppercase;font-size:13px;padding:8px 18px;border-radius:40px;box-shadow:0 8px 22px rgba(188,15,212,.4)}
#wolastoq-bingo .wb-bbb-invite-title{font-family:'Anton',sans-serif;font-weight:400;letter-spacing:.5px;font-size:clamp(40px,6.4vw,72px);line-height:1;color:#fff;margin:16px 0 14px}
#wolastoq-bingo .wb-bbb-invite-title span{color:#FFD23B;text-shadow:0 0 34px rgba(255,210,59,.5)}
#wolastoq-bingo .wb-bbb-invite-sub{color:#e2d8f5;font-size:clamp(16px,2.4vw,20px);line-height:1.5;margin:0}

/* EVENTSWAP 20260718 — stacked event headers */
#wolastoq-bingo .wb-bbb-evhead{text-align:center;margin:0 auto 24px}
#wolastoq-bingo .wb-bbb-evhead-next{margin-top:64px}
#wolastoq-bingo .wb-bbb-evdate{display:inline-block;background:linear-gradient(120deg,#FFD23B,#ffb703);color:#3a1d00;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;font-size:13px;padding:8px 18px;border-radius:40px;box-shadow:0 8px 22px rgba(255,183,3,.35)}
#wolastoq-bingo .wb-bbb-evname{font-family:'Anton',sans-serif;font-weight:400;letter-spacing:.6px;font-size:clamp(30px,4.6vw,50px);line-height:1.05;color:#fff;margin:14px 0 0}
#wolastoq-bingo .wb-bbb-evname span{color:#FFD23B}

/* ---- Big Bank Bingo: make the event stand out ---- */
#wolastoq-bingo .wb-bbb{position:relative;overflow:hidden;padding-top:58px;padding-bottom:58px;
  background:
    radial-gradient(60% 52% at 50% 40%, rgba(188,15,212,.34), transparent 62%),
    radial-gradient(80% 60% at 50% 118%, rgba(255,210,59,.12), transparent 60%),
    linear-gradient(180deg,#0a0512 0%,#180a2c 48%,#0a0512 100%)}
#wolastoq-bingo .wb-bbb::before,#wolastoq-bingo .wb-bbb::after{content:"";position:absolute;left:0;right:0;height:3px;z-index:2;
  background:linear-gradient(90deg,transparent,#BC0FD4,#FFD23B 50%,#BC0FD4,transparent);opacity:.9}
#wolastoq-bingo .wb-bbb::before{top:0}
#wolastoq-bingo .wb-bbb::after{bottom:0}
@keyframes wbbbShift{0%{background-position:0% 50%}100%{background-position:220% 50%}}
@keyframes wbbbGlow{0%,100%{box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 60px rgba(255,210,59,.28),0 0 30px rgba(188,15,212,.3)}
  50%{box-shadow:0 36px 92px rgba(0,0,0,.62),0 0 108px rgba(255,210,59,.55),0 0 54px rgba(188,15,212,.5)}}
#wolastoq-bingo .wb-bbb-frame{position:relative;max-width:632px;margin:0 auto;padding:8px;border-radius:32px;
  background:linear-gradient(120deg,#FFD23B,#ff6be0,#BC0FD4,#FFD23B);background-size:220% 220%;
  animation:wbbbShift 9s linear infinite, wbbbGlow 4.5s ease-in-out infinite;transition:transform .25s ease}
#wolastoq-bingo .wb-bbb-frame:hover{transform:translateY(-4px)}
#wolastoq-bingo .wb-bbb-frame .wb-bbb-flyer{max-width:none;margin:0;border-radius:24px;box-shadow:none;transition:none}
#wolastoq-bingo .wb-bbb-frame .wb-bbb-flyer:hover{transform:none}
#wolastoq-bingo .wb-bbb-frame img{border-radius:24px}
@media(prefers-reduced-motion:reduce){#wolastoq-bingo .wb-bbb-frame{animation:none}}

#wolastoq-bingo .wb-jp-upto{font-size:.34em;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;vertical-align:middle;opacity:.85;margin-right:4px}
</style>

<div id="wolastoq-bingo">

  <!-- ===================== HERO BANNER (original kept) ===================== -->
  <section class="wb-hero">
    <svg class="wb-ball-float b1" viewBox="0 0 100 100"><defs><radialGradient id="wbB1" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#8fb8ff"/><stop offset="55%" stop-color="#4169E1"/><stop offset="100%" stop-color="#1c3a8f"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#wbB1)"/><circle cx="50" cy="50" r="27" fill="#fff"/><text x="50" y="46" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="15" fill="#1c3a8f">B</text><text x="50" y="64" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="17" fill="#1f1230">7</text><ellipse cx="38" cy="28" rx="13" ry="8" fill="#fff" opacity=".3"/></svg>
    <svg class="wb-ball-float b2" viewBox="0 0 100 100"><defs><radialGradient id="wbB2" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#6fce9a"/><stop offset="55%" stop-color="#128a44"/><stop offset="100%" stop-color="#0a4f28"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#wbB2)"/><circle cx="50" cy="50" r="27" fill="#fff"/><text x="50" y="46" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="15" fill="#0a4f28">G</text><text x="50" y="64" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="17" fill="#1f1230">52</text><ellipse cx="38" cy="28" rx="13" ry="8" fill="#fff" opacity=".35"/></svg>
    <svg class="wb-ball-float b3" viewBox="0 0 100 100"><defs><radialGradient id="wbB3" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#eef0f5"/><stop offset="100%" stop-color="#cfcfda"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#wbB3)"/><circle cx="50" cy="50" r="27" fill="#fff"/><text x="50" y="46" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="15" fill="#2a2a33">N</text><text x="50" y="64" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="17" fill="#1f1230">33</text><ellipse cx="38" cy="28" rx="13" ry="8" fill="#fff" opacity=".35"/></svg>
    <svg class="wb-ball-float b4" viewBox="0 0 100 100"><defs><radialGradient id="wbB4" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#ff9d9d"/><stop offset="55%" stop-color="#E02020"/><stop offset="100%" stop-color="#8f1414"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#wbB4)"/><circle cx="50" cy="50" r="27" fill="#fff"/><text x="50" y="46" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="15" fill="#8f1414">I</text><text x="50" y="64" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="17" fill="#1f1230">19</text><ellipse cx="38" cy="28" rx="13" ry="8" fill="#fff" opacity=".35"/></svg>
    <svg class="wb-ball-float b5" viewBox="0 0 100 100"><defs><radialGradient id="wbB5" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#fff39a"/><stop offset="55%" stop-color="#FFD23B"/><stop offset="100%" stop-color="#e0a400"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#wbB5)"/><circle cx="50" cy="50" r="27" fill="#fff"/><text x="50" y="46" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="15" fill="#7a5a00">O</text><text x="50" y="64" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="17" fill="#1f1230">71</text><ellipse cx="38" cy="28" rx="13" ry="8" fill="#fff" opacity=".35"/></svg>
    <svg class="wb-ball-float b6" viewBox="0 0 100 100"><defs><radialGradient id="wbB6" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#8fb8ff"/><stop offset="55%" stop-color="#4169E1"/><stop offset="100%" stop-color="#1c3a8f"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#wbB6)"/><circle cx="50" cy="50" r="27" fill="#fff"/><text x="50" y="46" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="15" fill="#1c3a8f">B</text><text x="50" y="64" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="17" fill="#1f1230">14</text><ellipse cx="38" cy="28" rx="13" ry="8" fill="#fff" opacity=".38"/></svg>
    <svg class="wb-ball-float b7" viewBox="0 0 100 100"><defs><radialGradient id="wbB7" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#6fce9a"/><stop offset="55%" stop-color="#128a44"/><stop offset="100%" stop-color="#0a4f28"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#wbB7)"/><circle cx="50" cy="50" r="27" fill="#fff"/><text x="50" y="46" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="15" fill="#0a4f28">G</text><text x="50" y="64" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="800" font-size="17" fill="#1f1230">60</text><ellipse cx="38" cy="28" rx="13" ry="8" fill="#fff" opacity=".32"/></svg>
    <div class="wb-wrap wb-hero-inner">
      <span class="wb-eyebrow">Bingo Nights at Wolastoq Casino</span>
      <h1>Bingo: Cover Your Card,<span class="white">Claim the Prize</span></h1>
      <p class="wb-sub">Grab your dauber and get ready to shout!</p>
      <div class="wb-hero-cta">
        <a class="wb-btn wb-btn-primary" href="https://booking.wolastoqcasino.ca">Book Online Now
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#5D029E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
        <a class="wb-btn wb-btn-ghost" href="#wb-schedule">View Schedule</a>
      </div>
      <div class="wb-hero-trust">
        <div><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#FFF982" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Cash prizes every session</div>
        <div><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#FFF982" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg> Everyone 16+ welcome</div>
      </div>
    </div>
  </section>

  <!-- ===================== BIG BANK BINGO ===================== -->
  <section class="wb-band wb-bbb" id="big-bank-bingo">
    <div class="wb-wrap">
      <div class="wb-bbb-invite">
        <span class="wb-bbb-invite-flag">You’re Invited</span>
        <h2 class="wb-bbb-invite-title">Come Play for <span><?php echo wola_events_top_prize(); ?></span></h2>
        <p class="wb-bbb-invite-sub">Big bingo events are coming up &mdash; reserve your seats online before they&rsquo;re gone.</p>
      </div>

      <?php /* WOLAEVENTS — DO NOT DELETE: auto-expiring, date-sorted flyers through October 2026.
      Events managed in ONE place: wp-content/themes/wola/inc/wola-events.php */
      foreach ( wola_events_upcoming( 'bingo', 'bingo' ) as $wev ) : ?>
      <div class="wb-bbb-evhead<?php if ( ! isset( $wb_first ) ) { $wb_first = true; } else { echo ' wb-bbb-evhead-next'; } ?>">
        <span class="wb-bbb-evdate"><?php echo $wev['datefmt']; ?></span>
        <h3 class="wb-bbb-evname"><?php echo $wev['name_hl']; ?></h3>
      </div>
      <div class="wb-bbb-frame"><a class="wb-bbb-flyer" href="<?php echo $wev['book']; ?>" aria-label="<?php echo esc_attr( $wev['name'] . ', ' . $wev['datefmt'] . ' — book online' ); ?>">
        <img src="<?php echo $wev['img']; ?>" alt="<?php echo esc_attr( $wev['alt'] ); ?>">
      </a></div>
      <div class="wb-bbb-flyer-cta"><a class="wb-btn wb-btn-primary" href="<?php echo $wev['book']; ?>">Book <?php echo $wev['name']; ?> <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#5D029E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>
      <?php endforeach; ?>
    </div>
  </section>

  <!-- ===================== HOW IT WORKS ===================== -->
  <section class="wb-band">
    <div class="wb-wrap">
      <div class="wb-section-head">
        <span class="wb-eyebrow">How It Works</span>
        <h2 class="wb-title">How Bingo Works at <span class="hl">Wolastoq</span></h2>
        <p>Reserve your bingo cards and seat online. Your cards are waiting on your table when you arrive, with no line-up and no waiting.</p>
      </div>
      <div class="wb-steps wb-reveal">
        <div class="wb-card wb-step">
          <div class="wb-step-num">1</div>
          <div class="wb-step-ico">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="14" rx="2" stroke="#FFD23B" stroke-width="1.8"/><path d="M3 9h18M7 18v2M17 18v2" stroke="#FFD23B" stroke-width="1.8" stroke-linecap="round"/></svg>
          </div>
          <h3>Book Your Seat</h3>
          <p>Reserve your paper, PHDs and bingo seat online.</p>
        </div>
        <div class="wb-card wb-step">
          <div class="wb-step-num">2</div>
          <div class="wb-step-ico">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="13" height="17" rx="2" stroke="#FFD23B" stroke-width="1.8"/><path d="M8 8h5M8 12h5M8 16h3" stroke="#FFD23B" stroke-width="1.8" stroke-linecap="round"/><path d="M17 7l3 1v12a1 1 0 01-1 1h-2" stroke="#FFD23B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <h3>Your Cards Are Ready</h3>
          <p>Book online and your cards are waiting on your reserved table and seat. Prefer in person? Stop by Admissions from 4:30 PM (4:00 PM Saturdays &amp; Sundays).</p>
        </div>
        <div class="wb-card wb-step">
          <div class="wb-step-num">3</div>
          <div class="wb-step-ico">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4.5" stroke="#FFD23B" stroke-width="1.8"/><path d="M12 12.5V21M9 21h6" stroke="#FFD23B" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="8" r="1.6" fill="#FFD23B"/></svg>
          </div>
          <h3>Dab &amp; Win</h3>
          <p>Mark your card, hit your pattern, and shout BINGO! Cash prizes are paid out every session.</p>
        </div>
      </div>
      <div style="text-align:center;margin-top:48px">
        <a class="wb-btn wb-btn-primary" href="https://booking.wolastoqcasino.ca">Book Online Now
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#5D029E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
      </div>
    </div>
  </section>

  <!-- ===================== PLAN YOUR NIGHT ===================== -->
  <section class="wb-band wb-planner">
    <div class="wb-wrap">
      <div class="wb-planner-grid wb-reveal">
        <div class="wb-planner-photo">
          <div class="wb-planner-photo-copy">
            <b>Plan your night</b>
            <h3>Plan your bingo night</h3>
          </div>
        </div>
        <div class="wb-planner-copy">
          <span class="wb-eyebrow">First Time Or Friday Regular</span>
          <h2 class="wb-title">Everything You Need For A <span class="hl">Casino Bingo Night</span></h2>
          <p class="lead">Clear timing, simple booking, PHD options and a full casino night around the session. Come ready to play, eat, cheer and stay awhile.</p>
          <div class="wb-perk-grid">
            <article class="wb-perk">
              <div class="wb-perk-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="#FFD23B" stroke-width="1.7"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#FFD23B" stroke-width="1.7" stroke-linecap="round"/></svg>
              </div>
              <h3>First time playing?</h3>
              <p>Choose your paper, PHD package optional, pick your seat, then check out online.</p>
            </article>
            <article class="wb-perk">
              <div class="wb-perk-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="#FFD23B" stroke-width="1.7"/><path d="M8 10h8M8 14h5" stroke="#FFD23B" stroke-width="1.7" stroke-linecap="round"/></svg>
              </div>
              <h3>Cards ready on arrival</h3>
              <p>Bingo Paper is on your table and seat upon arrival.</p>
            </article>
            <article class="wb-perk">
              <div class="wb-perk-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 18h16M7 18V9a5 5 0 0110 0v9M9 9h6" stroke="#FFD23B" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <h3>Make it a casino night</h3>
              <p>Come for bingo, then stay close to the gaming floor, food, drinks and events.</p>
            </article>
            <article class="wb-perk">
              <div class="wb-perk-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" stroke="#FFD23B" stroke-width="1.7"/><circle cx="16" cy="8" r="3" stroke="#FFD23B" stroke-width="1.7"/><path d="M3.5 19a4.5 4.5 0 019 0M11.5 19a4.5 4.5 0 019 0" stroke="#FFD23B" stroke-width="1.7" stroke-linecap="round"/></svg>
              </div>
              <h3>Easy for groups</h3>
              <p>Pick your table, choose multiple chairs and add each player before you pay.</p>
            </article>
          </div>
          <div class="wb-tonight-strip">
            <div class="wb-tonight-item"><b>12 PM</b><span>online booking cut-off</span></div>
            <div class="wb-tonight-item"><b>4:30 PM</b><span>evening admissions</span></div>
            <div class="wb-tonight-item"><b>16+</b><span>minimum bingo age</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===================== REAL BOOKING WALKTHROUGH ===================== -->
  <section class="wb-band wb-booking-flow">
    <div class="wb-wrap">
      <div class="wb-section-head">
        <h2 class="wb-title">See How Easy It Is To <span class="hl">Book Online</span></h2>
        <p>Choose your session, pick your table, add player names and review your package before checkout.</p>
      </div>
      <div class="wb-flow-grid wb-reveal">
        <article class="wb-flow-card">
          <div class="wb-flow-shot">
            <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/booking-flow-1-schedule.png" alt="Wolastoq Casino booking schedule with featured events and weekly bingo sessions">
          </div>
          <div class="wb-flow-body">
            <h3>Choose your bingo session</h3>
            <p>Start with the featured event or weekly schedule. Each date shows the time and seats still available.</p>
          </div>
        </article>
        <article class="wb-flow-card">
          <div class="wb-flow-shot">
            <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/booking-flow-2-chair-picker.png" alt="Wolastoq Casino floor plan showing available tables and chair picker">
          </div>
          <div class="wb-flow-body">
            <h3>Pick your table and chairs</h3>
            <p>Tap a table to open the chair picker. Green chairs are open, and your picks are shown clearly before checkout.</p>
          </div>
        </article>
        <article class="wb-flow-card">
          <div class="wb-flow-shot panel">
            <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/booking-flow-3-booking-panel.png" alt="Booking drawer asking how many players are in the party">
          </div>
          <div class="wb-flow-body">
            <h3>Tell us your party size</h3>
            <p>The booking drawer walks you through party size, names, packages and review in a simple three-step checkout.</p>
          </div>
        </article>
        <article class="wb-flow-card">
          <div class="wb-flow-shot panel">
            <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/booking-flow-4-player-details.png" alt="Booking drawer with player name fields before package selection">
          </div>
          <div class="wb-flow-body">
            <h3>Add player details</h3>
            <p>Enter player names, choose packages and finish payment. Your paper is prepared for your reserved seat.</p>
          </div>
        </article>
      </div>
      <div style="text-align:center;margin-top:42px">
        <a class="wb-btn wb-btn-primary" href="https://booking.wolastoqcasino.ca">Open The Booking Page</a>
      </div>
    </div>
  </section>

  <!-- ===================== STATS BAND (parallax) ===================== -->


  <!-- ===================== CASINO IMAGE STORY ===================== -->
  <section class="wb-band wb-photo-story">
    <div class="wb-wrap">
      <div class="wb-section-head">
        <h2 class="wb-title">A Full Casino Night, <span class="hl">Built Around Bingo</span></h2>
        <p>Come for the cards, then stay for the gaming floor, prizes and entertainment.</p>
      </div>
      <div class="wb-photo-grid wb-reveal" style="grid-template-columns:1fr">
        <div class="wb-photo-main">
          <article class="wb-photo-card">
            <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-home-banner.jpg" alt="Wolastoq Casino gaming floor with rows of slot machines">
            <div class="wb-photo-caption">
              <h3>A full casino night</h3>
              <p>Make a night of it with slots, table games and casino promotions.</p>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>

  <!-- ===================== JACKPOT ===================== -->
  <section class="wb-jackpot">
    <div class="wb-wrap">
      <div class="wb-jackpot-grid">
        <div>
          <span class="wb-eyebrow">Daily Booking</span>
          <h2>Win Up To <span class="hl">$50,000</span> With Our Bonanza Jackpot</h2>
          <p class="lead">Every session, our Bonanza Jackpot grows until somebody covers their card and takes it all home. Watch the numbers climb and play for the kind of payout that could be life changing.</p>
          <ul class="wb-jp-list">
            <li><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#FFF982"/><path d="M7 12l3.5 3.5L17 9" stroke="#5D029E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Cash prizes paid out every session we play</li>
            <li><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#FFF982"/><path d="M7 12l3.5 3.5L17 9" stroke="#5D029E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> Bonanza Jackpot grows every session until it's claimed</li>
            <li><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#FFF982"/><path d="M7 12l3.5 3.5L17 9" stroke="#5D029E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg> $5,000 Mega Jackpot plus 5 more progressive jackpots that keep growing</li>
          </ul>
          <a class="wb-btn wb-btn-primary" href="https://booking.wolastoqcasino.ca">Book My Seat</a>
        </div>
        <div class="wb-jp-visual">
          <div class="wb-jp-glow"></div>
          <div class="wb-jp-card">
            <div class="wb-jp-label">Bonanza Jackpot</div>
            <div class="wb-jp-amount"><span class="wb-jp-upto">Up to</span> $50,000</div>
            <div class="wb-jp-sub">GROWING EVERY SESSION</div>
            <svg style="margin-top:22px" width="228" height="60" viewBox="0 0 228 60" fill="none">
              <circle cx="24" cy="30" r="20" fill="#2f5fd0"/><circle cx="24" cy="30" r="11" fill="#fff"/><text x="24" y="35" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="11" fill="#123a8f">B5</text>
              <circle cx="69" cy="30" r="20" fill="#e11f1f"/><circle cx="69" cy="30" r="11" fill="#fff"/><text x="69" y="35" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="11" fill="#8f1414">I22</text>
              <circle cx="114" cy="30" r="20" fill="#eef0f4"/><circle cx="114" cy="30" r="11" fill="#fff"/><text x="114" y="35" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="10" fill="#2a2a33">N40</text>
              <circle cx="159" cy="30" r="20" fill="#128a44"/><circle cx="159" cy="30" r="11" fill="#fff"/><text x="159" y="35" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="10" fill="#0a4f28">G52</text>
              <circle cx="204" cy="30" r="20" fill="#FFD23B"/><circle cx="204" cy="30" r="11" fill="#fff"/><text x="204" y="35" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="10" fill="#7a5a00">O66</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===================== SCHEDULE & PHDS ===================== -->
  <section class="wb-band alt" id="wb-schedule">
    <div class="wb-wrap">
      <div class="wb-section-head">
        <span class="wb-eyebrow">Schedule &amp; PHDs</span>
        <h2 class="wb-title">When We Play &amp; <span class="hl">What's On</span></h2>
      </div>

      <div class="wb-play-panel wb-reveal">
        <div class="wb-info-grid">
          <div class="wb-info-visual" aria-hidden="true">
            <div class="wb-info-badge">Bingo nights at Wolastoq</div>
          </div>
          <div class="wb-info-copy">
            <div>
              <h3>Wolastoq Casino Bingo</h3>
              <p>Book your seat, then head straight to your table. Midday Bingo runs at <strong style="color:#fff">12:00 PM</strong> on Mondays and Wednesdays.</p>
            </div>

          </div>
        </div>

        <div class="wb-phd-packages">
              <div class="wb-phd-showcase">
                <div class="wb-phd-device">
                  <div class="wb-phd-device-top">
                    <span>PHD electronic unit</span>
                    <span class="wb-phd-live">Auto dab</span>
                  </div>
                  <div class="wb-phd-screen">
                    <div class="wb-phd-number-row" aria-hidden="true">
                      <span class="wb-phd-ball">B5</span>
                      <span class="wb-phd-ball">I22</span>
                      <span class="wb-phd-ball">N40</span>
                      <span class="wb-phd-ball">G52</span>
                      <span class="wb-phd-ball">O66</span>
                    </div>
                    <div class="wb-phd-meter" aria-hidden="true"><span class="wb-phd-sweep"></span></div>
                    <h3>PHD Packages</h3>
                    <p>A PHD is an electronic unit that dabs your numbers and plays your bingo for you, so you can play more cards with less table juggling.</p>
                  </div>

                </div>
                <div>
                  <div class="wb-package-grid">
                    <div class="wb-package">
                      <div class="wb-package-top"><strong>PHD #1</strong><span class="wb-phd-price">$30</span></div>
                      <span class="wb-phd-count">12-up</span>
                      <span>Regular and special games</span>
                    </div>
                    <div class="wb-package">
                      <div class="wb-package-top"><strong>PHD #2</strong><span class="wb-phd-price">$35</span></div>
                      <span class="wb-phd-count">18-up</span>
                      <span>Regular and special games</span>
                    </div>
                    <div class="wb-package">
                      <div class="wb-package-top"><strong>PHD #3</strong><span class="wb-phd-price">$40</span></div>
                      <span class="wb-phd-count">27-up</span>
                      <span>Regular and special games</span>
                    </div>
                    <div class="wb-package featured">
                      <div class="wb-package-top"><strong>PHD #4</strong><span class="wb-package-badge">Popular</span></div>
                      <span class="wb-phd-price">$50</span>
                      <span class="wb-phd-count">36-up</span>
                      <span>Regular and special games</span>
                    </div>
                    <div class="wb-package">
                      <div class="wb-package-top"><strong>PHD #5</strong><span class="wb-phd-price">$60</span></div>
                      <span class="wb-phd-count">45-up</span>
                      <span>Regular and special games</span>
                    </div>
                    <div class="wb-package">
                      <div class="wb-package-top"><strong>PHD #6</strong><span class="wb-package-badge">Max play</span></div>
                      <span class="wb-phd-price">$80</span>
                      <span class="wb-phd-count">54-up</span>
                      <span>Regular and special games</span>
                    </div>
                  </div>
                  <p class="wb-phd-note">Electronic add-ons like extra credits and PHD Bonanza are available in person.</p>
                </div>
              </div>
        </div>
      </div>

      <div class="wb-table">
        <div class="wb-row">
          <div><div class="wb-day">Monday - Midday Bingo</div><div class="wb-time">12:00 PM | At Admissions | No evening session</div></div>
          <span class="wb-pill inperson">In-person only</span>
        </div>
        <div class="wb-row">
          <div><div class="wb-day">Tuesday - Evening Bingo</div><div class="wb-time">Admissions from 4:30 PM</div></div>
          <span class="wb-pill online">Online or in-person</span>
        </div>
        <div class="wb-row featured">
          <div><div class="wb-day">Wednesday - Midday Bingo + Seniors Discount Night</div><div class="wb-time">Midday 12:00 PM | Books online · senior discount in person only</div></div>
          <span class="wb-pill online">Online or in-person</span>
        </div>
        <div class="wb-row">
          <div><div class="wb-day">Thursday &amp; Friday - Evening Bingo</div><div class="wb-time">Admissions from 4:30 PM</div></div>
          <span class="wb-pill online">Online or in-person</span>
        </div>
        <div class="wb-row">
          <div><div class="wb-day">Saturday &amp; Sunday - Evening Bingo</div><div class="wb-time">Admissions from 4:00 PM</div></div>
          <span class="wb-pill online">Online or in-person</span>
        </div>
      </div>
      <p class="wb-sched-note">Everyone welcome. <strong>Must be 16 years or older</strong>. Hours and specials are subject to change, so check back or give us a call before you head over.</p>
    </div>
  </section>

  <!-- ===================== BOOK ONLINE ===================== -->
  <section class="wb-band">
    <div class="wb-wrap">
      <div class="wb-book-grid">
        <div>
          <span class="wb-eyebrow">Book Online</span>
          <h2 class="wb-title">Reserve Your Seat <span class="hl">From Your Couch</span></h2>
          <p style="margin-top:14px;font-size:17px">Skip the line and lock in your spot. Pick your paper, choose your PHDs and select your table before you leave the house. When you arrive, your bingo paper is already waiting at your reserved table and seat. <em>(Bonanza tickets can't be added online; they're sold in person on the floor.)</em></p>
          <ul class="wb-tips">
            <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FFD23B"/><path d="M8 12l2.5 2.5L16 9" stroke="#16191A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Daily booking cut-off at 12:00 PM. Book early to guarantee your seat.</li>
            <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FFD23B"/><path d="M8 12l2.5 2.5L16 9" stroke="#16191A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Your booked paper waits at your reserved table and seat. No Admissions pickup needed.</li>
            <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FFD23B"/><path d="M8 12l2.5 2.5L16 9" stroke="#16191A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> To add optional items, enter the quantity first, then click Add Item</li>
            <li><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#FFD23B"/><path d="M8 12l2.5 2.5L16 9" stroke="#16191A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Midday Bingo (Mon &amp; Wed) is in-person only</li>
          </ul>
          <div class="wb-book-cta">
            <a class="wb-btn wb-btn-purple" href="https://booking.wolastoqcasino.ca">Start Booking</a>
            <a class="wb-btn wb-btn-ghost" href="tel:5064629300">Call (506) 462-9300</a>
          </div>
        </div>
        <div class="wb-mock">
          <div class="wb-mock-head"><span>YOUR BOOKING</span>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="14" rx="2" stroke="#fff" stroke-width="1.6"/><path d="M3 9h18M7 18v2M17 18v2" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>
          </div>
          <div class="wb-mock-body">
            <div class="wb-mock-line"><span>9 up - Admission</span><span>$30.00</span></div>
            <div class="wb-mock-line"><span>Toonie Ball</span><span>$2.00</span></div>
            <div class="wb-mock-line"><span>PHD #4</span><span>$50.00</span></div>
            <div class="wb-mock-line"><span>Table &amp; Seat</span><span>Reserved</span></div>
            <div class="wb-mock-total"><span>Ready at your seat</span><span>Booked!</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===================== COSMIC BINGO ===================== -->
  <section class="wb-cosmic">
    <svg class="wb-stars" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice">
      <g fill="#fff">
        <circle cx="120" cy="80" r="1.6" opacity=".8"/><circle cx="300" cy="140" r="1" opacity=".6"/><circle cx="500" cy="60" r="2" opacity=".9"/><circle cx="680" cy="120" r="1.2" opacity=".7"/><circle cx="900" cy="70" r="1.6" opacity=".85"/><circle cx="1080" cy="150" r="1" opacity=".6"/><circle cx="200" cy="300" r="1.3" opacity=".7"/><circle cx="420" cy="420" r="1.8" opacity=".8"/><circle cx="760" cy="380" r="1.1" opacity=".6"/><circle cx="980" cy="460" r="1.6" opacity=".8"/><circle cx="1120" cy="340" r="1.2" opacity=".7"/><circle cx="60" cy="500" r="1.4" opacity=".7"/><circle cx="340" cy="540" r="1" opacity=".5"/><circle cx="620" cy="520" r="1.7" opacity=".8"/>
      </g>
      <g fill="#FFF982"><circle cx="250" cy="220" r="2" opacity=".76"/><circle cx="850" cy="260" r="2.2" opacity=".76"/></g>
      <g fill="#ff6be0"><circle cx="560" cy="300" r="2" opacity=".72"/><circle cx="1040" cy="220" r="2" opacity=".72"/></g>
    </svg>
    <div class="wb-wrap">
      <div class="wb-cosmic-grid">
        <div>
          <span class="wb-eyebrow">Every 3rd Saturday of the Month</span>
          <h2><em>Cosmic Bingo</em></h2>
          <p class="lead">Glow-in-the-dark bingo under the blacklights. Our brightest night of the month has music, a full bar and room for your crew.</p>
          <div class="wb-tagrow">
            <span class="wb-glowtag">Glow-in-the-dark &amp; blacklights</span>
            <span class="wb-glowtag">Music</span>
            <span class="wb-glowtag">Full bar</span>
            <span class="wb-glowtag">19+ event</span>
          </div>
          <a class="wb-btn wb-btn-primary" href="https://booking.wolastoqcasino.ca">Book Online Now
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#5D029E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </div>
        <div class="wb-cosmic-art">
          <svg width="320" height="320" viewBox="0 0 320 320" fill="none">
            <defs>
              <radialGradient id="wbCosGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#BC0FD4" stop-opacity=".55"/><stop offset="100%" stop-color="#BC0FD4" stop-opacity="0"/></radialGradient>
              <radialGradient id="wbCosBall" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#FFF982"/><stop offset="55%" stop-color="#FFD23B"/><stop offset="100%" stop-color="#BC0FD4"/></radialGradient>
            </defs>
            <circle cx="160" cy="160" r="150" fill="url(#wbCosGlow)"/>
            <g opacity=".95">
              <circle cx="160" cy="160" r="86" fill="url(#wbCosBall)" stroke="#d9fbff" stroke-width="2"/>
              <circle cx="160" cy="160" r="48" fill="#08122b"/>
              <text x="160" y="150" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="26" fill="#5D029E">B</text>
              <text x="160" y="184" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="30" fill="#ff6bd6">9</text>
              <ellipse cx="130" cy="120" rx="22" ry="13" fill="#fff" opacity=".4"/>
            </g>
            <circle cx="70" cy="70" r="22" fill="#ff6bd6" opacity=".9"/><circle cx="70" cy="70" r="11" fill="#fff"/>
            <circle cx="258" cy="90" r="18" fill="#FFD23B" opacity=".9"/><circle cx="258" cy="90" r="9" fill="#fff"/>
            <circle cx="250" cy="250" r="24" fill="#FFF982" opacity=".9"/><circle cx="250" cy="250" r="12" fill="#fff"/>
            <circle cx="66" cy="248" r="16" fill="#b06bff" opacity=".9"/><circle cx="66" cy="248" r="8" fill="#fff"/>
          </svg>
        </div>
      </div>
    </div>
  </section>

  <!-- ===================== UPCOMING EVENTS ===================== -->
  <section class="wb-band wb-events">
    <div class="wb-wrap">
      <div class="wb-section-head">
        <span class="wb-eyebrow">What's Coming Up</span>
        <h2 class="wb-title">Upcoming Events &amp; <span class="hl">Special Bingo</span></h2>
        <p>Plan around recurring special bingo nights, and check the Events page for the latest flyers.</p>
      </div>
      <div class="wb-event-grid">
        <div class="wb-card wb-flyer">
          <div class="wb-flyer-top"><span class="wb-flyer-tag">Monthly</span>
            <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-logo-stacked.png" alt="Wolastoq Casino">
          </div>
          <div class="wb-flyer-body"><h4>Cosmic Bingo</h4><p>Every 3rd Saturday of the month</p></div>
        </div>
        <div class="wb-card wb-flyer">
          <div class="wb-flyer-top"><span class="wb-flyer-tag">Weekly</span>
            <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-logo-stacked.png" alt="Wolastoq Casino">
          </div>
          <div class="wb-flyer-body"><h4>Seniors Discount Night</h4><p>Wednesday evening · book online, senior discount in person</p></div>
        </div>
        <div class="wb-card wb-flyer">
          <div class="wb-flyer-top"><span class="wb-flyer-tag">Midday</span>
            <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-logo-stacked.png" alt="Wolastoq Casino">
          </div>
          <div class="wb-flyer-body"><h4>Midday Bingo</h4><p>Mondays and Wednesdays at 12:00 PM</p></div>
        </div>
        <div class="wb-card wb-flyer sample">
          <div class="wb-flyer-top"><span class="wb-flyer-tag">Sample</span>
            <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-logo-stacked.png" alt="Wolastoq Casino">
          </div>
          <div class="wb-flyer-body"><h4>Sample Event</h4><p>Details coming soon</p></div>
        </div>
      </div>
      <div class="wb-events-cta">
        <a class="wb-btn wb-btn-ghost" href="https://www.wolastoqcasino.ca/events/">View All Events</a>
      </div>
    </div>
  </section>

  <!-- ===================== READY BANNER ===================== -->
  <section class="wb-band alt" style="padding-top:30px">
    <div class="wb-wrap">
      <div class="wb-ready-inner">
        <svg class="wb-ready-balls" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMid slice">
          <g opacity=".5">
            <circle cx="80" cy="60" r="40" fill="#ff6be0"/><circle cx="1100" cy="80" r="50" fill="#FFD23B"/><circle cx="1000" cy="240" r="32" fill="#BC0FD4"/><circle cx="180" cy="240" r="28" fill="#fff" opacity=".4"/><circle cx="600" cy="20" r="22" fill="#fff" opacity=".3"/>
          </g>
        </svg>
        <img class="wb-ready-logo" src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-logo.png" alt="Wolastoq Casino">
        <h2>Ready To Play?</h2>
        <p>Lock in your seat now and we'll see you at the caller's table.</p>
        <a class="wb-btn wb-btn-primary" href="https://booking.wolastoqcasino.ca">Book Online Now
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#5D029E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
      </div>
    </div>
  </section>

  <!-- ===================== FAQ ===================== -->
  <section class="wb-band">
    <div class="wb-wrap">
      <div class="wb-section-head">
        <span class="wb-eyebrow">Good To Know</span>
        <h2 class="wb-title">Frequently Asked <span class="hl">Questions</span></h2>
      </div>
      <div class="wb-faq-list">
        <details class="wb-faq-item">
          <summary class="wb-faq-q">Do I need to book my seat in advance?
            <span class="wb-faq-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></span>
          </summary>
          <div class="wb-faq-a">Booking ahead is the best way to guarantee your seat. The daily cut-off is 12:00 PM. You can book online for most evening sessions, or stop by Admissions in person. Midday Bingo is in-person only; Wednesday's Seniors Discount Night can be booked online, with the senior discount applied in person.</div>
        </details>
        <details class="wb-faq-item">
          <summary class="wb-faq-q">What is the Bonanza Jackpot?
            <span class="wb-faq-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></span>
          </summary>
          <div class="wb-faq-a">It's our progressive jackpot worth up to $50,000. It grows every session until somebody covers their card and takes it home. Sessions also feature a $5,000 Mega Jackpot plus five more progressive jackpots. Bonanza tickets are sold in person on the floor.</div>
        </details>
        <details class="wb-faq-item">
          <summary class="wb-faq-q">What is a PHD?
            <span class="wb-faq-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></span>
          </summary>
          <div class="wb-faq-a">A PHD (Personal Handheld Device) is an electronic unit that dabs your numbers and plays your bingo for you. We offer six packages from 12-up to 54-up regular and special games, $30-$80, plus electronic add-ons like extra credits and PHD Bonanza.</div>
        </details>
        <details class="wb-faq-item">
          <summary class="wb-faq-q">When can I play bingo at Wolastoq?
            <span class="wb-faq-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></span>
          </summary>
          <div class="wb-faq-a">We run Midday Bingo at 12:00 PM on Mondays &amp; Wednesdays, with evening sessions most other days. Everyone 16 and older is welcome. (Please see the schedule above for the days we play.)</div>
        </details>
        <details class="wb-faq-item">
          <summary class="wb-faq-q">Which nights can I book online?
            <span class="wb-faq-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></span>
          </summary>
          <div class="wb-faq-a">You can book online for evening sessions Tuesday through Sunday, including Wednesday's Seniors Discount Night — the books can be purchased online, but the senior discount is applied in person only. Monday Midday Bingo is in-person only at Admissions.</div>
        </details>
        <details class="wb-faq-item">
          <summary class="wb-faq-q">How do I add paper or PHDs to my order?
            <span class="wb-faq-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg></span>
          </summary>
          <div class="wb-faq-a">In the online booking tool, enter the quantity first, then click "Add Item." Repeat for each paper pack or PHD package you want. Your selections are saved to your reserved table and seat.</div>
        </details>

      </div>
    </div>
  </section>

  <!-- ===================== TESTIMONIALS ===================== -->
  <section class="wb-band alt">
    <div class="wb-wrap">
      <div class="wb-section-head">
        <span class="wb-eyebrow">Real Results. Real People.</span>
        <h2 class="wb-title">What Our <span class="hl">Players Say</span></h2>
      </div>
      <div class="wb-review-grid wb-reveal">
        <div class="wb-card wb-review">
          <div class="wb-rstars">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg>
          </div>
          <p>"Great casino, very big. 2 floors with a whole floor as a smoking section, variety of games for everyone to enjoy. The food is great and the environment is amazing. Highly recommend checking it out!"</p>
          <div class="wb-author"><div class="wb-avatar">B</div><div><b>Bry</b><br><span>Verified visitor</span></div></div>
        </div>
        <div class="wb-card wb-review">
          <div class="wb-rstars">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg>
          </div>
          <p>"Best slots in New Brunswick, great atmosphere. We gambled all night and the casino manager showed us around. I really enjoyed the shuttle service both ways from downtown. I'll be back soon!"</p>
          <div class="wb-author"><div class="wb-avatar">M</div><div><b>Matthew Leaman</b><br><span>Verified visitor</span></div></div>
        </div>
        <div class="wb-card wb-review">
          <div class="wb-rstars">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD23B"><path d="M12 2l3 6.5 7 .6-5.3 4.6 1.6 6.9L12 17.8 5.7 20.6l1.6-6.9L2 9.1l7-.6z"/></svg>
          </div>
          <p>"The new renovations are great! New machines, good size gaming area, and the new bar looks great. Staff are so kind, polite and helpful. Overall a really nice place to spend some time."</p>
          <div class="wb-author"><div class="wb-avatar">A</div><div><b>Anne Hoffman</b><br><span>Verified visitor</span></div></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===================== EXPLORE WOLASTOQ (other pages) ===================== -->
  <section class="wb-band">
    <div class="wb-wrap">
      <div class="wb-section-head">
        <span class="wb-eyebrow">More At Wolastoq</span>
        <h2 class="wb-title">Explore The Rest Of <span class="hl">The Casino</span></h2>
        <p>Two floors of gaming, dining and entertainment. After bingo, discover everything else Wolastoq has to offer.</p>
      </div>
      <div class="wb-explore-grid wb-reveal">
        <a class="wb-tile" href="https://www.wolastoqcasino.ca/classic-slots/">
          <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-home-banner.jpg" alt="Classic Slots">
          <div class="wb-tile-body"><h4>Classic Slots</h4><span>Play now</span></div>
        </a>
        <a class="wb-tile" href="https://www.wolastoqcasino.ca/poker/">
          <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/poker.png" alt="Poker">
          <div class="wb-tile-body"><h4>Poker</h4><span>Take a seat</span></div>
        </a>
        <a class="wb-tile" href="https://www.wolastoqcasino.ca/blackjack/">
          <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/blackjack-bg.png" alt="Blackjack">
          <div class="wb-tile-body"><h4>Blackjack</h4><span>Hit or stay</span></div>
        </a>
        <a class="wb-tile" href="https://www.wolastoqcasino.ca/roulette/">
          <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/roulette.png" alt="Roulette">
          <div class="wb-tile-body"><h4>Roulette</h4><span>Spin the wheel</span></div>
        </a>
        <a class="wb-tile" href="https://www.wolastoqcasino.ca/baccarat/">
          <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/baccarat-bg.png" alt="Baccarat">
          <div class="wb-tile-body"><h4>Baccarat</h4><span>Place your bet</span></div>
        </a>
        <a class="wb-tile" href="https://www.wolastoqcasino.ca/bingo/">
          <img src="https://www.wolastoqcasino.ca/wp-content/uploads/bingo-redesign/wolastoq-home-24.png" alt="Bingo at Wolastoq Casino">
          <div class="wb-tile-body"><h4>Bingo</h4><span>Plan your night</span></div>
        </a>
      </div>
      <div style="text-align:center;margin-top:44px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
        <a class="wb-btn wb-btn-ghost" href="https://www.wolastoqcasino.ca/promotions/">Promotions</a>
        <a class="wb-btn wb-btn-ghost" href="https://www.wolastoqcasino.ca/events/">Events</a>
        <a class="wb-btn wb-btn-ghost" href="https://www.wolastoqcasino.ca/rewards/">Rewards Program</a>
        <a class="wb-btn wb-btn-ghost" href="https://www.wolastoqcasino.ca/about-us/">About Wolastoq</a>
      </div>
    </div>
  </section>

</div>

<script>
(function(){
  var root=document.getElementById('wolastoq-bingo');
  if(!root) return;

  /* FAQ accordion - one open at a time */
  var items=root.querySelectorAll('.wb-faq-item');
  items.forEach(function(it){
    it.addEventListener('toggle',function(){
      if(it.open){items.forEach(function(o){if(o!==it)o.open=false;});}
    });
  });

  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals=root.querySelectorAll('.wb-reveal');

  /* count-up for stat numbers */
  function countUp(el){
    var target=parseInt(el.getAttribute('data-count'),10);
    if(isNaN(target)){return;}
    var prefix=el.getAttribute('data-prefix')||'', suffix=el.getAttribute('data-suffix')||'';
    el.textContent=prefix+target.toLocaleString()+suffix;
  }

  function revealEl(el){
    el.classList.add('wb-in');
    el.querySelectorAll('[data-count]').forEach(countUp);
  }

  if(reduce || !('IntersectionObserver' in window)){
    reveals.forEach(revealEl);
  } else {
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){revealEl(e.target);io.unobserve(e.target);}
      });
    },{threshold:0.16});
    reveals.forEach(function(el){io.observe(el);});
    /* safety: reveal everything after 4s in case observer misses */
    setTimeout(function(){reveals.forEach(revealEl);},4000);
  }
})();
</script>

<?php get_footer(); ?>

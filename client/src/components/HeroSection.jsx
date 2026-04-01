import React from 'react';

export default function HeroSection() {
  return (
    <header className="relative overflow-hidden">
      {/* Background with gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-blue-dark via-brand-blue to-brand-blue-mid"></div>

      {/* Decorative bingo balls */}
      <div className="absolute top-4 left-[10%] w-16 h-16 rounded-full bg-red-500/20 blur-xl"></div>
      <div className="absolute top-12 right-[15%] w-20 h-20 rounded-full bg-blue-500/20 blur-xl"></div>
      <div className="absolute bottom-8 left-[30%] w-14 h-14 rounded-full bg-yellow-500/15 blur-xl"></div>
      <div className="absolute top-6 right-[40%] w-12 h-12 rounded-full bg-green-500/15 blur-xl"></div>

      <div className="relative max-w-5xl mx-auto px-4 py-12 md:py-16 text-center">
        {/* Logo */}
        <div className="inline-block mb-4">
          <div className="flex items-center justify-center mb-2">
            <img
              src="/logo.png"
              alt="Saint Mary's Entertainment Centre"
              className="w-24 h-24 md:w-32 md:h-32 object-contain"
            />
          </div>
        </div>

        <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
          Saint Mary's<br />
          <span className="text-brand-gold">Entertainment Centre</span>
        </h1>

        <p className="mt-4 text-lg md:text-xl text-blue-200 font-medium max-w-xl mx-auto">
          Bingo 7 Nights a Week
        </p>

        {/* Feature badges */}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-5 py-2.5 text-white text-sm font-medium">
            Nightly Jackpots up to <span className="text-brand-gold font-bold">$5,000</span>
          </div>
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-5 py-2.5 text-white text-sm font-medium">
            Tuesday to Sunday
          </div>
        </div>

        {/* Booking info banner */}
        <div className="mt-8 inline-block">
          <div className="bg-brand-gold/20 border border-brand-gold/40 rounded-2xl px-8 py-4 backdrop-blur-sm">
            <p className="text-brand-gold-light text-lg font-semibold">
              Book Your Seats Online
            </p>
            <p className="text-blue-200 text-sm mt-1">
              Daily booking cut-off at <strong className="text-white">12:00 PM</strong> — Doors open at 4:30 PM
            </p>
          </div>
        </div>
      </div>

      {/* Bottom wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 60" fill="none" className="w-full">
          <path d="M0 60V30C240 0 480 0 720 30C960 60 1200 60 1440 30V60H0Z" fill="#0a1628" fillOpacity="0.5" />
        </svg>
      </div>
    </header>
  );
}

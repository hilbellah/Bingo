# Event Side Placement Experiment

Date: 2026-06-18

We tested moving long-range Special Bingo and Live Event / Venue cards out of the top schedule strip and into the open side space around the floor plan.

What was tried:
- Removed the Featured Events rail from the schedule header.
- Added a responsive side layout around the floor plan.
- On very wide screens, Special Bingo appeared in the left side column and Live Event / Venue appeared in the right side column.
- On narrower screens, the event cards collapsed above the floor plan to avoid squeezing or overlapping the seat map.
- Event images were rendered inside those side cards.

Why it was backed out:
- The owner decided to return the event cards to the top area above the weekly schedule.
- The side placement may still be useful later if the floor plan layout is redesigned with permanent side panels.

Files involved in the experiment:
- `client/src/App.jsx`
  - Temporary components used: `FeaturedEventsSideLayout`, `FeaturedEventsCompact`, `FeaturedEventsSidePanel`, `FeaturedEventCard`.
  - Active component after backing out: `FeaturedEventRail`.
- `client/src/components/FloorPlan.jsx`
  - Avoid putting event images inside the floor-plan banner; it can clip on mobile because the floor plan is wider than the viewport.

Recommendation if revisiting:
- Use explicit side columns only at a very wide breakpoint.
- Keep a compact fallback for normal desktop and mobile.
- Do not put event cards inside the scrollable floor-plan room.

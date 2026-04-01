// Exact seat layout matching Saint Mary's Entertainment Centre venue blueprint
// Each table number maps to a physical table with 6 seats (3 per side)
// Tables 1-75, no table 41 = 74 tables total
//
// Layout matches the venue blueprint floor plan:
//   FRONT OF ROOM — STAGE at top
//   Upper-left block (5 cols x 3 rows) | Floor Stage | Upper-right block (4 cols x 3 rows)
//   Lower-left (4 cols x 3 rows) | Lower-center-left (3 cols x 3 rows) | Transition (2 cols) | Center column (2 cols x 4 rows + top single) | Lower-right (3 cols x 4 rows)
//   BACK OF ROOM — ENTRANCE at bottom

export const SECTIONS = [
  // === UPPER AREA (near stage) ===
  {
    id: 'upper-left',
    label: '',
    area: 'upper',
    seats: [
      [6, 12, 18, 24, 30],
      [5, 11, 17, 23, 29],
      [4, 10, 16, 22, 28],
    ]
  },
  {
    id: 'upper-right',
    label: '',
    area: 'upper',
    seats: [
      [54, 61, 68, 75],
      [53, 60, 67, 74],
      [52, 59, 66, 73],
    ]
  },

  // === LOWER AREA (near entrance) ===
  {
    id: 'lower-left',
    label: '',
    area: 'lower',
    seats: [
      [3, 9, 15, 21],
      [2, 8, 14, 20],
      [1, 7, 13, 19],
    ]
  },
  {
    id: 'lower-center-left',
    label: '',
    area: 'lower',
    seats: [
      [27, 33, 39],
      [26, 32, 38],
      [25, 31, 37],
    ]
  },
  {
    id: 'center-left-inner',
    label: '',
    area: 'lower',
    seats: [
      [34, 40],
      [35, null],
      [36, null],
    ]
  },
  {
    id: 'center-column',
    label: '',
    area: 'lower',
    seats: [
      [46, 47],
      [45, 51],
      [44, 50],
      [43, 49],
      [42, 48],
    ]
  },
  {
    id: 'lower-right',
    label: '',
    area: 'lower',
    seats: [
      [58, 65, 72],
      [57, 64, 71],
      [56, 63, 70],
      [55, 62, 69],
    ]
  },
];

// All valid seat numbers (1-75, no 41)
export const ALL_SEAT_NUMBERS = [];
for (const section of SECTIONS) {
  for (const row of section.seats) {
    for (const num of row) {
      if (num !== null) ALL_SEAT_NUMBERS.push(num);
    }
  }
}
ALL_SEAT_NUMBERS.sort((a, b) => a - b);

export const TOTAL_SEATS = ALL_SEAT_NUMBERS.length; // 74 tables (1-75, no 41)

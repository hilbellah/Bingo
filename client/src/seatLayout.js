// Exact seat layout matching Saint Mary's Entertainment Centre venue map
// Each seat has: number, section, row, col (for grid positioning)
// Sections match the physical groupings on the venue floor plan

// Layout from the venue seat map image:
// CALLER at top center
// Left side: two blocks of 4 cols x 3 rows (seats 1-24)
// Center-left: two blocks of 3 cols x 3 rows (seats 25-40)
// Center column: 5 seats vertical (seats 42-46) - note: no seat 41
// Right side: upper block 4 cols x 4 rows (seats 51-75), lower block 4 cols x 3 rows (seats 48-50, 55-57, 62-64, 69-71)

export const SECTIONS = [
  {
    id: 'left-upper',
    label: '',
    seats: [
      // Row from top to bottom (closest to caller first)
      // Each sub-array is a row
      [6, 12, 18, 24],
      [5, 11, 17, 23],
      [4, 10, 16, 22],
    ]
  },
  {
    id: 'left-lower',
    label: '',
    seats: [
      [3, 9, 15, 21],
      [2, 8, 14, 20],
      [1, 7, 13, 19],
    ]
  },
  {
    id: 'center-left-upper',
    label: '',
    seats: [
      [30, 36, null],
      [29, 35, null],
      [28, 34, 40],
    ]
  },
  {
    id: 'center-left-lower',
    label: '',
    seats: [
      [27, 33, 39],
      [26, 32, 38],
      [25, 31, 37],
    ]
  },
  {
    id: 'center-column',
    label: '',
    seats: [
      [46],
      [45],
      [44],
      [43],
      [42],
    ]
  },
  {
    id: 'right-upper',
    label: '',
    seats: [
      [54, 61, 68, 75],
      [53, 60, 67, 74],
      [52, 59, 66, 73],
      [51, 58, 65, 72],
    ]
  },
  {
    id: 'right-lower',
    label: '',
    seats: [
      [50, 57, 64, 71],
      [49, 56, 63, 70],
      [48, 55, 62, 69],
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

export const TOTAL_SEATS = ALL_SEAT_NUMBERS.length; // 74 seats (1-75, no 41)

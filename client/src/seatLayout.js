// Floor plan layout matching the updated venue blueprint
// 73 tables total (1-73), each with 6 seats (3 per side)
//
// Layout:
//   FRONT OF ROOM — STAGE at top-center
//   Upper-left block (6-7 cols x 3 rows) | Stage | Right block (4 cols x 7 rows)
//   Lower-left block (7 cols x 3 rows) | Center column (1 col x 5 rows, tables 41-45)
//   BACK OF ROOM — ENTRANCE at bottom-left

export const SECTIONS = [
  {
    id: 'upper-left',
    label: '',
    area: 'upper',
    seats: [
      [6, 12, 18, 24, 30, 36, null],
      [5, 11, 17, 23, 29, 35, null],
      [4, 10, 16, 22, 28, 34, 40],
    ]
  },
  {
    id: 'lower-left',
    label: '',
    area: 'lower',
    seats: [
      [3, 9, 15, 21, 27, 33, 39],
      [2, 8, 14, 20, 26, 32, 38],
      [1, 7, 13, 19, 25, 31, 37],
    ]
  },
  {
    id: 'center-column',
    label: '',
    area: 'lower',
    seats: [
      [45],
      [44],
      [43],
      [42],
      [41],
    ]
  },
  {
    id: 'right',
    label: '',
    area: 'right',
    seats: [
      [52, 59, 66, 73],
      [51, 58, 65, 72],
      [50, 57, 64, 71],
      [49, 56, 63, 70],
      [48, 55, 62, 69],
      [47, 54, 61, 68],
      [46, 53, 60, 67],
    ]
  },
];

export const ALL_SEAT_NUMBERS = [];
for (const section of SECTIONS) {
  for (const row of section.seats) {
    for (const num of row) {
      if (num !== null) ALL_SEAT_NUMBERS.push(num);
    }
  }
}
ALL_SEAT_NUMBERS.sort((a, b) => a - b);

export const TOTAL_SEATS = ALL_SEAT_NUMBERS.length; // 73 tables

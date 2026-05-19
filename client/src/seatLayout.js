// Floor plan layout matching the venue blueprint (75 tables, 6 chairs each).
//
// Layout (looking down at the room with the stage at the top):
//
//   FRONT OF ROOM - STAGE
//   +---------------------------+   +-----------+   +----------------+
//   |  upper-left (6 cols x 3   |   | Stage     |   |  upper-right   |
//   |  rows + col 7 has 41      |   | between   |   |  (4 cols x 3   |
//   |  over 40)                 |   | 41/40 + 47/46 | rows)        |
//   +---------------------------+   +-----+   +----------------+
//
//   +---------------------------+   +-----------------------------+
//   |  lower-left (7 cols x 3   |   |  lower-right (5 cols x 4    |
//   |  rows)                    |   |  rows; leftmost col = 44-41)|
//   +---------------------------+   +-----------------------------+
//   BACK OF ROOM - ENTRANCE

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
    id: 'upper-right',
    label: '',
    area: 'upper',
    seats: [
      [54, 61, 68, 75],
      [53, 60, 67, 74],
      [52, 59, 66, 73],
    ]
  },
  {
    // Stage-front tables. 41 and 47 are the two added tables. They render as
    // vertical pairs: 41 above 40, and 47 above 46.
    id: 'stage-bridge',
    label: '',
    area: 'middle',
    seats: [
      [41, 47],
      [46],
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
    // Leftmost column of this section (45/44/43/42) sits directly under the stage area.
    // Cols 2-5 (51-48, 58-55, 65-62, 72-69) align with upper-right.
    id: 'lower-right',
    label: '',
    area: 'lower',
    seats: [
      [45, 51, 58, 65, 72],
      [44, 50, 57, 64, 71],
      [43, 49, 56, 63, 70],
      [42, 48, 55, 62, 69],
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

export const TOTAL_SEATS = ALL_SEAT_NUMBERS.length; // 75 tables

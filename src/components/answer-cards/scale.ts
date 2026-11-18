/** Seven points or fewer fit one row; more wrap into two balanced rows (AC-8). */
export const scaleColumns = (points: number): number =>
  points <= 7 ? points : Math.ceil(points / 2);

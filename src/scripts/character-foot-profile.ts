/** A linear support query has the same minimum on a point cloud and its hull. */
export function footProfileHull(points: Array<[number, number]>) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .filter((p, i, all) => !i || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]);
  if (sorted.length < 3) return sorted;
  const turn = (a: number[], b: number[], c: number[]) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower: Array<[number, number]> = [], upper: Array<[number, number]> = [];
  for (const p of sorted) {
    while (lower.length > 1 && turn(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length > 1 && turn(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

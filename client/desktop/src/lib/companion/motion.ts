import { LEAP_HOPS } from "@/lib/companion/protocol";

export function hopFrames(
  fromX: number,
  toX: number,
  hops = LEAP_HOPS,
  height = 56
) {
  const steps = hops * 8;
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    x.push(fromX + (toX - fromX) * t);
    const phase = (t * hops) % 1;
    y.push(-Math.sin(phase * Math.PI) * height);
  }
  return { x, y };
}

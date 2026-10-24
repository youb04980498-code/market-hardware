export type Activity = "Browsing" | "Cart" | "Checkout Queue";
export type Point = readonly [number, number];
export type Selection =
  { kind: "shelf"; id: string } | { kind: "customer"; id: string } | null;
export const departments = [
  {
    id: "gpu",
    name: "Graphics cards",
    short: "GPU",
    color: "#7f75d9",
    x: -5.3,
    z: -2.1,
    description:
      "A miniature graphics lab. Twin-fan cards and display packaging, modeled for this demo.",
  },
  {
    id: "cpu",
    name: "Processors",
    short: "CPU",
    color: "#df9870",
    x: -1.1,
    z: -2.1,
    description:
      "The heart of the build. Socketed processor displays and presentation boxes.",
  },
  {
    id: "ram",
    name: "Memory",
    short: "RAM",
    color: "#72a997",
    x: 3.1,
    z: -2.1,
    description:
      "A little more headroom. Color-coded memory kits and a DIMM showcase.",
  },
  {
    id: "board",
    name: "Motherboards",
    short: "BOARDS",
    color: "#769dbb",
    x: -5.3,
    z: 1.6,
    description:
      "Where everything connects. Detailed circuit boards with sockets and expansion slots.",
  },
  {
    id: "storage",
    name: "Storage & cooling",
    short: "SSD / AIR",
    color: "#bba05f",
    x: -1.1,
    z: 1.6,
    description:
      "Keep it cool, keep it fast. Miniature drives, cooling fans and accessory boxes.",
  },
  {
    id: "builds",
    name: "Desktop builds",
    short: "SYSTEMS",
    color: "#b47f99",
    x: 3.1,
    z: 1.6,
    description:
      "Ready for the desk. Display PCs with glass panels and illuminated cooling fans.",
  },
] as const;
export type Department = (typeof departments)[number];
export interface Shopper {
  id: string;
  name: string;
  activity: Activity;
  color: string;
  skin: string;
  hair: string;
  speed: number;
  phase: number;
  path: readonly Point[];
}
export const shoppers: readonly Shopper[] = [
  {
    id: "01",
    name: "Alex",
    activity: "Browsing",
    color: "#d78e62",
    skin: "#e1b296",
    hair: "#40352e",
    speed: 0.52,
    phase: 0,
    path: [
      [-7.5, -0.7],
      [-7.5, -3.9],
      [-3.3, -3.9],
      [-3.3, -0.7],
    ],
  },
  {
    id: "02",
    name: "Sam",
    activity: "Cart",
    color: "#758ab3",
    skin: "#9d6c50",
    hair: "#28282e",
    speed: 0.42,
    phase: 0,
    path: [
      [-3.25, 3.6],
      [-3.25, -0.4],
      [1, -0.4],
      [1, 3.6],
    ],
  },
  {
    id: "03",
    name: "Charlie",
    activity: "Browsing",
    color: "#789f85",
    skin: "#dca77c",
    hair: "#674c39",
    speed: 0.48,
    phase: 3,
    path: [
      [5.4, -4.1],
      [5.4, -0.5],
      [1, -0.5],
      [1, -4.1],
    ],
  },
  {
    id: "04",
    name: "Robin",
    activity: "Cart",
    color: "#c0a16a",
    skin: "#e7bd9c",
    hair: "#4f3b2e",
    speed: 0.38,
    phase: 45,
    path: [
      [-7.5, 3.9],
      [-7.5, -0.5],
      [-3.2, -0.5],
      [-3.2, 3.9],
    ],
  },
  {
    id: "05",
    name: "Jamie",
    activity: "Browsing",
    color: "#b280a5",
    skin: "#b77e5f",
    hair: "#282b32",
    speed: 0.43,
    phase: 18,
    path: [
      [1, 3.9],
      [5.2, 3.9],
      [5.2, 0.1],
      [1, 0.1],
    ],
  },
  {
    id: "06",
    name: "Morgan",
    activity: "Browsing",
    color: "#639da9",
    skin: "#e6b69a",
    hair: "#a57547",
    speed: 0.5,
    phase: 5,
    path: [
      [-7.5, -4.2],
      [-3.2, -4.2],
      [-3.2, -0.6],
      [-7.5, -0.6],
    ],
  },
  {
    id: "07",
    name: "Taylor",
    activity: "Checkout Queue",
    color: "#cf8c80",
    skin: "#a87053",
    hair: "#303038",
    speed: 0,
    phase: 0,
    path: [[7.2, 1.4]],
  },
  {
    id: "08",
    name: "Drew",
    activity: "Checkout Queue",
    color: "#8b89b3",
    skin: "#e7ba9b",
    hair: "#72513b",
    speed: 0,
    phase: 0,
    path: [[7.2, 2.7]],
  },
  {
    id: "09",
    name: "Casey",
    activity: "Checkout Queue",
    color: "#77a09b",
    skin: "#c68d68",
    hair: "#33323a",
    speed: 0,
    phase: 0,
    path: [[7.2, -2.2]],
  },
];

// Continuous, frame-rate-independent closed paths. Each corner includes a browsing stop.
// The clock is owned by the scene, so pause/resume never jumps to wall-clock time.
export function poseAt(shopper: Shopper, seconds: number) {
  if (shopper.speed === 0)
    return {
      x: shopper.path[0][0],
      z: shopper.path[0][1],
      angle: Math.PI,
      moving: false,
    };
  const pause = shopper.activity === "Browsing" ? 3.5 : 1.2;
  const segments = shopper.path.map((a, i) => {
    const b = shopper.path[(i + 1) % shopper.path.length];
    return {
      a,
      b,
      duration: Math.hypot(b[0] - a[0], b[1] - a[1]) / shopper.speed,
    };
  });
  const duration = segments.reduce((sum, s) => sum + s.duration + pause, 0);
  let t = (seconds + shopper.phase) % duration;
  for (const segment of segments) {
    if (t < segment.duration + pause) {
      const progress = Math.min(t / segment.duration, 1);
      return {
        x: segment.a[0] + (segment.b[0] - segment.a[0]) * progress,
        z: segment.a[1] + (segment.b[1] - segment.a[1]) * progress,
        angle: Math.atan2(
          segment.b[0] - segment.a[0],
          segment.b[1] - segment.a[1],
        ),
        moving: t < segment.duration,
      };
    }
    t -= segment.duration + pause;
  }
  return {
    x: shopper.path[0][0],
    z: shopper.path[0][1],
    angle: 0,
    moving: false,
  };
}

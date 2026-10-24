import type { WarehouseSite } from "./cityLayout";
import CitySurroundings from "./CitySurroundings";
import { useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  createInstances,
  Instances,
  OrbitControls,
  RoundedBox,
} from "@react-three/drei";
import type { ComponentRef } from "react";
import { Vector3, PCFShadowMap, MathUtils } from "three";
import { Block, Sign } from "./geometry";
import {
  Interior,
  DepartmentIsland,
  Character,
  Register,
  Plant,
} from "./StoreScene";
import { WarehouseRoom, Fulfillment } from "./BusinessScene";
import { GraphicsLifecycle } from "./GraphicsLifecycle";
import { departments, shoppers } from "./simulation";
import type { Shopper } from "./simulation";
import { poseAt } from "./simulation";
import { canRepresentCheckout, stageColors } from "./worldModel";
import type {
  WorldOrder,
  WorldStock,
  WorldProduct,
  WorldSelection,
  WorldSnapshot,
  WorldMonitoring,
} from "./worldModel";

export type CampusZone =
  | "overview"
  | "storefront"
  | "checkout"
  | "warehouses"
  | "warehouse"
  | "business"
  | "fulfillment";
export type CampusFocus = {
  zone: CampusZone;
  warehouseId?: number;
  serial: number;
  facility?: "headquarters" | "analytics" | "monitoring";
};
export type CampusSelection =
  | WorldSelection
  | { kind: "department"; id: string }
  | { kind: "demo-customer"; id: string }
  | { kind: "facility"; id: "headquarters" | "analytics" | "monitoring" };
const [Leaves, Leaf] = createInstances();
type CampusNavigation = (
  zone: CampusZone,
  id?: number,
  facility?: CampusFocus["facility"],
) => void;

function Districts() {
  const zones = [
    {
      name: "COMMERCIAL",
      sub: "Store + checkout",
      x: -22,
      z: 1,
      w: 24,
      d: 56,
      color: "#deddd0",
    },
    {
      name: "INDUSTRIAL",
      sub: "Recorded warehouse network",
      x: 20,
      z: -18,
      w: 36,
      d: 29,
      color: "#d7e0dc",
    },
    {
      name: "LOGISTICS",
      sub: "Fulfillment + delivery",
      x: 20,
      z: 15,
      w: 24,
      d: 20,
      color: "#e7dfcf",
    },
    {
      name: "BUSINESS",
      sub: "HQ / Analytics / Monitoring",
      x: -7.5,
      z: -17,
      w: 9,
      d: 29,
      color: "#dfdce6",
    },
  ];
  return (
    <>
      {zones.map((d) => (
        <group key={d.name}>
          <Block
            size={[d.w, 0.05, d.d]}
            position={[d.x, -0.055, d.z]}
            color={d.color}
          />
          <Sign
            text={d.name}
            sub={d.sub}
            width={d.name === "BUSINESS" ? 6.5 : 12}
            height={1.8}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[
              d.x,
              -0.019,
              d.name === "BUSINESS" ? -1.5 : d.z + d.d / 2 - 1.5,
            ]}
            color={d.color}
            ink="#405758"
          />
        </group>
      ))}
      <Block size={[2, 0.04, 24]} position={[-11, -0.01, 8]} color="#dadbd1" />
      <Block
        size={[2, 0.04, 29]}
        position={[-2.8, -0.01, -17]}
        color="#dadbd1"
      />
      <Block
        size={[35, 0.04, 2]}
        position={[20, -0.01, -3.9]}
        color="#dadbd1"
      />
    </>
  );
}

function BusinessDistrict({
  snapshot,
  monitoring,
  onSelect,
}: {
  snapshot: WorldSnapshot | null;
  monitoring: WorldMonitoring | null;
  onSelect: (s: CampusSelection) => void;
}) {
  const targets = monitoring?.available
    ? monitoring.data?.metrics.availability
    : null;
  const services = targets
    ? `${targets.filter((t) => t.value[1] === "1").length} / ${targets.length} TARGETS UP`
    : "MONITORING UNAVAILABLE";
  const analytics = snapshot?.analytics.data;
  const offices = [
    {
      id: "headquarters" as const,
      name: "HEADQUARTERS",
      z: -25,
      w: 8.3,
      d: 7,
      h: 4.5,
      accent: "#92a8a2",
      text: `${snapshot?.orders.data?.total ?? "—"} RECORDED ORDERS`,
      sub: "VIRTUAL ADMINISTRATION HUB",
    },
    {
      id: "analytics" as const,
      name: "ANALYTICS",
      z: -15,
      w: 7.5,
      d: 7,
      h: 3.2,
      accent: "#b3a8ce",
      text: analytics
        ? `NET ${(analytics.data.net_cents / 100).toFixed(2)} EUR`
        : "ANALYTICS UNAVAILABLE",
      sub: analytics?.metadata.stale
        ? "STALE SERVING SNAPSHOT"
        : "RECORDED SERVING SNAPSHOT",
    },
    {
      id: "monitoring" as const,
      name: "MONITORING",
      z: -6.5,
      w: 7.1,
      d: 6,
      h: 3,
      accent: "#a4b791",
      text: services,
      sub:
        monitoring?.available && monitoring.data?.unavailable.length
          ? "PARTIAL / MISSING SOURCES"
          : "EXISTING OBSERVABILITY API",
    },
  ];
  return (
    <>
      {offices.map((o) => (
        <group
          key={o.id}
          position={[-7.5, 0, o.z]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ kind: "facility", id: o.id });
          }}
        >
          <Block size={[o.w, 0.18, o.d]} position={[0, 0, 0]} color="#f0eadf" />
          <Block
            size={[o.w, o.h, 0.18]}
            position={[0, o.h / 2, -o.d / 2]}
            color="#e7e7df"
          />
          <Block
            size={[0.15, o.h, o.d]}
            position={[-o.w / 2, o.h / 2, 0]}
            color="#e1e5df"
          />
          <Block
            size={[o.w, 0.15, 0.3]}
            position={[0, o.h, -o.d / 2]}
            color="#40555e"
          />
          <Sign
            text={o.name}
            width={o.w - 0.4}
            height={0.8}
            position={[0, o.h - 0.4, -o.d / 2 + 0.11]}
            color="#344e58"
            ink="#faf0de"
          />
          <Sign
            text={o.text}
            sub={o.sub}
            width={o.w - 1}
            height={0.8}
            position={[0, o.h - 1.4, -o.d / 2 + 0.13]}
            color={o.accent}
            ink="#243e40"
          />
          {[-1.8, 1.8].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <Block
                size={[2.2, 0.12, 1.1]}
                position={[0, 0.85, 0]}
                color="#c9b89b"
              />
              <Block
                size={[0.08, 0.8, 0.08]}
                position={[-0.9, 0.4, 0]}
                color="#5a6c6a"
              />
              <Block
                size={[0.08, 0.8, 0.08]}
                position={[0.9, 0.4, 0]}
                color="#5a6c6a"
              />
              <Block
                size={[0.7, 0.45, 0.05]}
                position={[0, 1.15, -0.25]}
                color="#3e5660"
              />
              <Block
                size={[0.6, 0.35, 0.02]}
                position={[0, 1.15, -0.21]}
                color="#b4d0d0"
              />
              <Block
                size={[0.6, 0.15, 0.6]}
                position={[0, 0.5, 1]}
                color={o.accent}
              />
            </group>
          ))}
          <Block
            size={[o.w, 0.15, 0.2]}
            position={[0, o.h, o.d / 2]}
            color={o.accent}
          />
          <Sign
            text="ENTER"
            width={1.4}
            height={0.3}
            position={[0, 0.03, o.d / 2 - 0.3]}
            rotation={[-Math.PI / 2, 0, 0]}
            color="#f0eadf"
            ink="#405758"
          />
          <Plant position={[o.w / 2 - 0.7, 0, o.d / 2 - 0.7]} scale={0.65} />
        </group>
      ))}
    </>
  );
}

function DemoDelivery({
  index,
  time,
  paused,
}: {
  index: number;
  time: React.RefObject<number>;
  paused: boolean;
}) {
  const ref = useRef<import("three").Group>(null);
  const driver: Shopper = {
    id: `demo-van-${index}`,
    name: "DEMO DELIVERY",
    activity: "Cart",
    color: "#a6b9c4",
    skin: "#c8b9a0",
    hair: "#5f6d63",
    speed: 3,
    phase: index * 42,
    path: [
      [-40, -32],
      [40, -32],
      [40, 32],
      [-40, 32],
    ],
  };
  const start = useRef(poseAt(driver, 0)).current;
  useFrame(() => {
    if (ref.current && !paused) {
      const pose = poseAt(driver, time.current);
      ref.current.position.set(pose.x, 0, pose.z);
      ref.current.rotation.y = pose.angle;
    }
  });
  return (
    <group
      ref={ref}
      position={[start.x, 0, start.z]}
      rotation={[0, start.angle, 0]}
    >
      <Block size={[1.8, 0.3, 3.6]} position={[0, 0.45, 0]} color="#60716e" />
      <Block
        size={[1.8, 1.25, 2.3]}
        position={[0, 1.18, -0.5]}
        color={index ? "#bdc9ad" : "#b9b2cf"}
      />
      <Block
        size={[1.8, 1.05, 1.2]}
        position={[0, 1.07, 1.25]}
        color="#e8dfca"
      />
      <Block
        size={[1.5, 0.48, 0.03]}
        position={[0, 1.25, 1.87]}
        color="#a8c8cb"
      />
      {[-0.88, 0.88].map((x) =>
        [-1, 1.3].map((z) => (
          <mesh
            key={`${x}-${z}`}
            position={[x, 0.32, z]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.3, 0.3, 0.15, 8]} />
            <meshStandardMaterial color="#3c4d4d" />
          </mesh>
        )),
      )}
      <Sign
        text="DEMO"
        width={1.2}
        height={0.45}
        position={[0, 1.15, 1.9]}
        color="#e8dfca"
        ink="#49616a"
      />
    </group>
  );
}

const trees: [number, number][] = [
  ...Array.from(
    { length: 13 },
    (_, i) => [-39 + i * 6.5, -35] as [number, number],
  ),
  ...Array.from(
    { length: 13 },
    (_, i) => [-39 + i * 6.5, 35] as [number, number],
  ),
  ...[-26, -19, -12, 12, 19, 26].flatMap(
    (z) =>
      [
        [-6, z],
        [6, z],
      ] as [number, number][],
  ),
  ...[-35, -28, -14, 14, 28, 35].flatMap(
    (x) =>
      [
        [x, -5.7],
        [x, 5.7],
      ] as [number, number][],
  ),
  [-35, -24],
  [-35, -10],
  [-35, 12],
  [-35, 23],
  [36, -3],
  [36, 10],
  [36, 24],
];
function Landscaping() {
  return (
    <Leaves limit={450} castShadow receiveShadow frustumCulled={false}>
      <dodecahedronGeometry args={[1, 1]} />
      <meshStandardMaterial roughness={1} flatShading />
      {trees
        .filter(
          ([x, z]) =>
            !(x === -6 && z < 0) &&
            !(x === 6 && z < 0) &&
            !(Math.abs(x + 35) < 2 && z < 0),
        )
        .map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <Block
              size={[0.28, 2.3, 0.28]}
              position={[0, 1.1, 0]}
              color="#786448"
            />
            <Block
              size={[1.7, 0.13, 1.7]}
              position={[0, -0.04, 0]}
              color="#8c9e65"
            />
            {[0, 1, 2, 3, 4].map((n) => (
              <Leaf
                key={n}
                position={[
                  Math.sin(n * 2.4) * 0.7,
                  2.7 + (n === 0 ? 0.7 : 0) + (i % 3) * 0.13,
                  Math.cos(n * 2.4) * 0.7,
                ]}
                scale={[1.1 + (i % 3) * 0.1, 1.1, 1.05]}
                color={
                  ["#829b71", "#9db48c", "#adc09b", "#728e67"][(i + n) % 4]
                }
              />
            ))}
          </group>
        ))}
    </Leaves>
  );
}

function Car({
  position,
  color = "#c5c2b2",
}: {
  position: [number, number, number];
  color?: string;
}) {
  return (
    <group position={position}>
      <RoundedBox
        args={[1.5, 0.55, 3]}
        position={[0, 0.52, 0]}
        radius={0.15}
        smoothness={2}
        castShadow
      >
        <meshStandardMaterial color={color} />
      </RoundedBox>
      <Block
        size={[1.25, 0.55, 1.5]}
        position={[0, 1, -0.15]}
        color="#5d7580"
      />
      <Block
        size={[1.32, 0.1, 1.55]}
        position={[0, 1.3, -0.15]}
        color={color}
      />
      {[-0.72, 0.72].map((x) =>
        [-0.9, 0.9].map((z) => (
          <mesh
            key={`${x}-${z}`}
            position={[x, 0.3, z]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.27, 0.27, 0.16, 10]} />
            <meshStandardMaterial color="#2c373a" />
          </mesh>
        )),
      )}
      {[-0.52, 0.52].map((x) => (
        <Block
          key={x}
          size={[0.3, 0.12, 0.04]}
          position={[x, 0.6, 1.52]}
          color="#f3e6b4"
        />
      ))}
    </group>
  );
}

function CampusGround() {
  return (
    <>
      <Block size={[88, 0.7, 74]} position={[0, -0.62, 0]} color="#bac3ad" />
      <Block size={[85, 0.12, 67]} position={[0, -0.24, 0]} color="#b5bd9d" />
      {[-32, 32, 0].map((z) => (
        <Block
          key={`road-z${z}`}
          size={[85, 0.07, 5.6]}
          position={[0, -0.14, z]}
          color="#667176"
        />
      ))}
      {[-40, 40, 0].map((x) => (
        <Block
          key={`road-x${x}`}
          size={[5.6, 0.07, 66]}
          position={[x, -0.14, 0]}
          color="#667176"
        />
      ))}
      {Array.from({ length: 20 }, (_, i) => (
        <group key={i}>
          {[-32, 32].map((z) => (
            <Block
              key={z}
              size={[2, 0.012, 0.07]}
              position={[-37 + i * 4, -0.094, z]}
              color="#e7dfbb"
            />
          ))}
          {[-40, 40].map((x) => (
            <Block
              key={x}
              size={[0.07, 0.012, 1.9]}
              position={[x, -0.094, -29 + i * 3]}
              color="#e7dfbb"
            />
          ))}
        </group>
      ))}
      {[-8, 8].map((x) =>
        [-2, -1, 0, 1, 2].map((n) => (
          <Block
            key={`${x}-${n}`}
            size={[0.55, 0.012, 4]}
            position={[x + n * 0.7, -0.087, 0]}
            color="#e5e5d9"
          />
        )),
      )}
      {[-9, 9].map((z) =>
        [-2, -1, 0, 1, 2].map((n) => (
          <Block
            key={`${z}-${n}`}
            size={[4, 0.012, 0.55]}
            position={[0, -0.087, z + n * 0.7]}
            color="#e5e5d9"
          />
        )),
      )}
      <mesh position={[0, -0.075, 0]} receiveShadow>
        <cylinderGeometry args={[9.2, 9.2, 0.08, 64]} />
        <meshStandardMaterial color="#697578" />
      </mesh>
      <mesh position={[0, -0.015, 0]} receiveShadow>
        <cylinderGeometry args={[6.9, 6.9, 0.15, 48]} />
        <meshStandardMaterial color="#d8d1bf" />
      </mesh>
      {[
        [-22, -14],
        [-22, 15],
        [20, 15],
      ].map(([x, z], i) => (
        <Block
          key={i}
          size={[23, 0.12, 19]}
          position={[x, -0.08, z]}
          color="#cfcbb9"
        />
      ))}
      <Block
        size={[36, 0.12, 29]}
        position={[20, -0.08, -18.5]}
        color="#cfcbb9"
      />
      {[-24, -19, -14, -9].map((z, i) => (
        <group key={z}>
          <Block
            size={[2.6, 0.02, 4.3]}
            position={[-35, -0.15, z]}
            color="#7d8887"
          />
          <Block
            size={[2.5, 0.015, 0.055]}
            position={[-35, -0.13, z + 2.1]}
            color="#e7e5d4"
          />
          <Car
            position={[-35, 0, z]}
            color={["#b8bcb1", "#b95b4b", "#486578", "#d4c7a7"][i]}
          />
        </group>
      ))}
      <Sign
        text="PARKING"
        width={3.4}
        height={0.6}
        position={[-35, 1.8, -28]}
        color="#384e58"
        ink="#fff3d7"
      />
      {Array.from({ length: 22 }, (_, i) => (
        <group key={`fence${i}`}>
          {[-35.5, 35.5].map((z) => (
            <Block
              key={z}
              size={[0.12, 1, 0.12]}
              position={[-42 + i * 4, 0.4, z]}
              color="#435353"
            />
          ))}
        </group>
      ))}
      {[-35.5, 35.5].map((z) => (
        <Block
          key={z}
          size={[85, 0.06, 0.08]}
          position={[0, 0.8, z]}
          color="#435353"
        />
      ))}
      {[-30, -12, 12, 30].flatMap((x) =>
        [-29, 29].map((z) => (
          <group key={`${x}-${z}`} position={[x, 0, z]}>
            <Block
              size={[0.12, 4, 0.12]}
              position={[0, 2, 0]}
              color="#485551"
            />
            <Block
              size={[0.8, 0.09, 0.15]}
              position={[0.3, 4, 0]}
              color="#45524f"
            />
            <mesh position={[0.55, 3.93, 0]}>
              <sphereGeometry args={[0.12, 8, 5]} />
              <meshStandardMaterial
                color="#fff0bd"
                emissive="#fff0bd"
                emissiveIntensity={0.8}
              />
            </mesh>
          </group>
        )),
      )}
    </>
  );
}

function FacilitySign({
  text,
  sub,
  width = 12,
  position = [0, 4, 6.2],
  onClick,
}: {
  text: string;
  sub: string;
  width?: number;
  position?: [number, number, number];
  onClick: () => void;
}) {
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Block size={[width + 0.3, 1.9, 0.22]} color="#344e58" />
      <Sign
        text={text}
        sub={sub}
        width={width}
        height={1.6}
        position={[0, 0, 0.13]}
        color="#344e58"
        ink="#fff7e8"
      />
      {[-width / 2, width / 2].map((x) => (
        <Block
          key={x}
          size={[0.12, 3.3, 0.12]}
          position={[x, -2.5, 0]}
          color="#47575a"
        />
      ))}
    </group>
  );
}

function CheckoutHall() {
  return (
    <>
      <Block size={[19, 0.18, 13]} position={[0, 0, 0]} color="#e1d5bd" />
      <Block size={[19, 3.8, 0.2]} position={[0, 1.9, -6.4]} color="#5c686c" />
      <Block size={[0.2, 3.8, 13]} position={[-9.5, 1.9, 0]} color="#5c686c" />
      <Block size={[19, 0.2, 0.35]} position={[0, 3.8, -6.4]} color="#3c4c52" />
      {[-5, 0, 5].map((x, i) => (
        <Register key={x} x={x} z={-2} number={`0${i + 1}`} />
      ))}
      {[-6.3, -3.7, -1.3, 1.3, 3.7, 6.3].map((x) => (
        <group key={x}>
          {[0.2, 3.9].map((z) => (
            <group key={z} position={[x, 0, z]}>
              <mesh position={[0, 0.45, 0]} castShadow>
                <cylinderGeometry args={[0.055, 0.07, 0.9, 8]} />
                <meshStandardMaterial color="#867a60" metalness={0.5} />
              </mesh>
              <mesh position={[0, 0.92, 0]}>
                <sphereGeometry args={[0.1, 8, 5]} />
                <meshStandardMaterial color="#ae9a72" />
              </mesh>
            </group>
          ))}
          <Block
            size={[0.04, 0.07, 3.7]}
            position={[x, 0.8, 2.05]}
            color="#ac4b40"
          />
        </group>
      ))}
      <Sign
        text="RECORDED ORDERS / LOGICAL QUEUES"
        sub="FIGURES DO NOT TRACK REAL PEOPLE"
        width={11}
        height={1}
        position={[0, 2.6, -6.25]}
        color="#394f58"
        ink="#fff1d6"
      />
      <Plant position={[-8, 0, 5]} />
      <Plant position={[8, 0, 5]} />
    </>
  );
}

function Board({ snapshot }: { snapshot: WorldSnapshot | null }) {
  const units = snapshot?.warehouses.available
    ? snapshot.warehouses.data?.items
        .filter((w) => w.classification === "OPERATIONAL")
        .reduce((s, w) => s + w.physical, 0)
    : undefined;
  const shipped = snapshot?.orders.available
    ? snapshot.orders.data?.items.filter((o) => o.status === "SHIPPED").length
    : undefined;
  return (
    <group position={[0, 0, 0]}>
      <RoundedBox
        args={[8, 0.55, 5.2]}
        radius={0.4}
        smoothness={3}
        position={[0, 0.25, 0]}
        castShadow
      >
        <meshStandardMaterial color="#a9b1a3" />
      </RoundedBox>
      <Block size={[7.6, 3.7, 1.3]} position={[0, 2.35, 0]} color="#2e4651" />
      <Sign
        text="MARKET HARDWARE"
        sub="OPERATIONS / RECORDED LOCAL DATA"
        width={7.1}
        height={0.85}
        position={[0, 3.7, 0.67]}
        color="#2e4651"
        ink="#f8efdc"
      />
      {[
        ["ORDERS", snapshot?.orders.data?.total, "ALL RETAINED"],
        ["STOCK", units, "OPERATIONAL UNITS"],
        ["SHIPPING", shipped, "LATEST ORDER WINDOW"],
      ].map(([name, value, sub], i) => (
        <Sign
          key={String(name)}
          text={`${name}  ${value ?? "—"}`}
          sub={String(sub)}
          width={2.2}
          height={1.35}
          position={[-2.4 + i * 2.4, 2.1, 0.67]}
          color="#2e4651"
          ink="#f6e8c7"
        />
      ))}
      {[-5.2, 5.2].map((x) => (
        <group key={x} position={[x, 0, 3.7]}>
          <Block
            size={[2.6, 0.25, 0.7]}
            position={[0, 0.45, 0]}
            color="#aa8b62"
          />
          <Block
            size={[2.6, 0.5, 0.1]}
            position={[0, 0.85, -0.3]}
            color="#aa8b62"
          />
          {[-0.9, 0.9].map((dx) => (
            <Block
              key={dx}
              size={[0.12, 0.45, 0.6]}
              position={[dx, 0.2, 0]}
              color="#526257"
            />
          ))}
        </group>
      ))}
      <Plant position={[-4.4, 0, -1.8]} scale={1.2} />
      <Plant position={[4.4, 0, -1.8]} scale={1.2} />
    </group>
  );
}

function CampusCamera({
  focus,
  sites,
  zoomCommand,
  onReady,
}: {
  focus: CampusFocus;
  sites: WarehouseSite[];
  zoomCommand: { serial: number; factor: number };
  onReady: () => void;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, size, invalidate } = useThree();
  const motion = useRef<{ eye: Vector3; target: Vector3; zoom: number } | null>(
    null,
  );
  const initialized = useRef(false);
  useEffect(() => {
    const targets: Record<CampusZone, [number, number, number]> = {
      overview: [0, 0, 0],
      storefront: [-22, 0.7, -14],
      checkout: [-22, 0.6, 15],
      warehouses: [19, 0.4, -18],
      warehouse: sites.find(
        (s) => s.warehouse.warehouse_id === focus.warehouseId,
      )?.position ?? [19, 0.4, -18],
      fulfillment: [20, 0.7, 15],
      business:
        focus.facility === "headquarters"
          ? [-7.5, 1, -25]
          : focus.facility === "analytics"
            ? [-7.5, 0.5, -15]
            : focus.facility === "monitoring"
              ? [-7.5, 0.5, -6.5]
              : [-7.5, 0.5, -17],
    };
    const target = new Vector3(...targets[focus.zone]);
    const zoom =
      focus.zone === "overview"
        ? Math.min(size.width / 235, size.height / 175)
        : focus.zone === "warehouses"
          ? Math.min(size.width / 58, size.height / 45)
          : Math.min(size.width / 34, size.height / 27);
    const eye = target.clone().add(new Vector3(52, 60, 68));
    if (
      !initialized.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      motion.current = null;
      camera.position.copy(eye);
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      controls.current?.target.copy(target);
      controls.current?.update();
      initialized.current = true;
      onReady();
    } else motion.current = { eye, target, zoom };
    invalidate();
    // Sites change their records without resetting the player's camera.
  }, [
    focus.serial,
    focus.zone,
    focus.warehouseId,
    focus.facility,
    size.width,
    size.height,
    camera,
    invalidate,
    onReady,
  ]);
  useEffect(() => {
    if (!zoomCommand.serial) return;
    motion.current = {
      eye: camera.position.clone(),
      target: controls.current?.target.clone() ?? new Vector3(),
      zoom: MathUtils.clamp(camera.zoom * zoomCommand.factor, 5, 95),
    };
    invalidate();
  }, [zoomCommand.serial, zoomCommand.factor, camera, invalidate]);
  useFrame((_, delta) => {
    const m = motion.current;
    if (!m || !controls.current) return;
    const alpha = 1 - Math.exp(-Math.min(delta, 0.05) * 7);
    camera.position.lerp(m.eye, alpha);
    controls.current.target.lerp(m.target, alpha);
    camera.zoom = MathUtils.lerp(camera.zoom, m.zoom, alpha);
    camera.updateProjectionMatrix();
    controls.current.update();
    invalidate();
    if (
      camera.position.distanceTo(m.eye) < 0.03 &&
      controls.current.target.distanceTo(m.target) < 0.03 &&
      Math.abs(camera.zoom - m.zoom) < 0.02
    ) {
      motion.current = null;
      onReady();
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minZoom={5}
      maxZoom={95}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI / 2.3}
      onStart={() => {
        motion.current = null;
        onReady();
      }}
    />
  );
}

function Activities({
  demo,
  orders,
  time,
  paused,
  selected,
  onSelect,
}: {
  demo: boolean;
  orders: WorldOrder[];
  time: React.RefObject<number>;
  paused: boolean;
  selected: CampusSelection;
  onSelect: (s: CampusSelection) => void;
}) {
  return (
    <>
      {demo && (
        <>
          <DemoDelivery index={0} time={time} paused={paused} />
          <DemoDelivery index={1} time={time} paused={paused} />
          {[0, 1].map((i) => {
            const walker: Shopper = {
              ...shoppers[i],
              id: `demo-pedestrian-${i}`,
              name: "DEMO PEDESTRIAN",
              activity: "Browsing",
              speed: 0.9,
              phase: i * 12,
              path: i
                ? [
                    [-11, -5],
                    [-11, 5],
                    [6, 5],
                    [6, -5],
                  ]
                : [
                    [-10.5, 7],
                    [-10.5, 22],
                    [-33, 22],
                    [-33, 7],
                  ],
            };
            return (
              <Character
                key={walker.id}
                shopper={walker}
                time={time}
                paused={paused}
                selected={
                  selected?.kind === "demo-customer" &&
                  selected.id === walker.id
                }
                label="SIMULATED PEDESTRIAN"
                onSelect={() =>
                  onSelect({ kind: "demo-customer", id: walker.id })
                }
              />
            );
          })}
        </>
      )}
      <group position={[-22, 0, -14]}>
        {demo &&
          shoppers
            .filter((s) => s.activity !== "Checkout Queue")
            .map((shopper) => (
              <Character
                key={shopper.id}
                shopper={shopper}
                time={time}
                paused={paused}
                selected={
                  selected?.kind === "demo-customer" &&
                  selected.id === shopper.id
                }
                onSelect={() =>
                  onSelect({ kind: "demo-customer", id: shopper.id })
                }
              />
            ))}
      </group>
      <group position={[-22, 0, 15]}>
        {demo
          ? shoppers
              .filter((s) => s.activity === "Checkout Queue")
              .map((s, i) => {
                const shopper = {
                  ...s,
                  path: [[[-5, 0, 5][i], 1.3]] as readonly (readonly [
                    number,
                    number,
                  ])[],
                };
                return (
                  <Character
                    key={s.id}
                    shopper={shopper}
                    time={time}
                    paused={paused}
                    selected={
                      selected?.kind === "demo-customer" && selected.id === s.id
                    }
                    onSelect={() =>
                      onSelect({ kind: "demo-customer", id: s.id })
                    }
                  />
                );
              })
          : orders
              .filter((o) => canRepresentCheckout(o.status))
              .slice(0, 8)
              .map((order, i) => {
                const leave = ["PAID", "CANCELLED", "REFUNDED"].includes(
                  order.status,
                );
                const shopper: Shopper = {
                  id: String(order.order_id),
                  name: `Order #${order.order_id}`,
                  activity: "Checkout Queue",
                  color: stageColors[order.status] ?? "#8a968b",
                  skin: "#cbb79a",
                  hair: "#506064",
                  speed: 0,
                  phase: 0,
                  path: [
                    [
                      leave ? 7.5 : [-5, 0, 5][i % 3],
                      leave
                        ? 3.8 + (i % 3) * 0.7
                        : 0.2 + Math.floor(i / 3) * 1.3,
                    ],
                  ],
                };
                return (
                  <Character
                    key={order.order_id}
                    shopper={shopper}
                    time={time}
                    paused={paused}
                    transition
                    label={`${order.status} / ORDER TOKEN`}
                    selected={
                      selected?.kind === "order" &&
                      selected.id === order.order_id
                    }
                    onSelect={() =>
                      onSelect({ kind: "order", id: order.order_id })
                    }
                  />
                );
              })}
      </group>
    </>
  );
}

function Models({
  sites,
  stocks,
  orders,
  products,
  snapshot,
  monitoring,
  demo,
  paused,
  selected,
  onSelect,
  onFocus,
}: {
  sites: WarehouseSite[];
  stocks: Record<number, WorldStock[]>;
  orders: WorldOrder[];
  products: WorldProduct[];
  snapshot: WorldSnapshot | null;
  monitoring: WorldMonitoring | null;
  demo: boolean;
  paused: boolean;
  selected: CampusSelection;
  onSelect: (s: CampusSelection) => void;
  onFocus: CampusNavigation;
}) {
  const time = useRef(0);
  useFrame((_, delta) => {
    if (!paused) time.current += Math.min(delta, 0.05);
  });
  const recordSelection: WorldSelection =
    selected?.kind === "department" ||
    selected?.kind === "demo-customer" ||
    selected?.kind === "facility"
      ? null
      : selected;
  return (
    <>
      <CitySurroundings />
      <CampusGround />
      <Districts />
      <Landscaping />
      <BusinessDistrict
        snapshot={snapshot}
        monitoring={monitoring}
        onSelect={onSelect}
      />
      <group
        position={[-22, 0, -14]}
        onClick={(e) => {
          e.stopPropagation();
          onFocus("storefront");
        }}
      >
        <Interior withCheckout={false} />
        {departments.map((item) => (
          <DepartmentIsland
            key={item.id}
            item={item}
            selected={
              selected?.kind === "department" && selected.id === item.id
            }
            onSelect={() => onSelect({ kind: "department", id: item.id })}
          />
        ))}
        <FacilitySign
          text="STORE"
          sub="ELECTRONICS / PUBLISHED CATALOGUE"
          onClick={() => onFocus("storefront")}
        />
      </group>
      <group
        position={[-22, 0, 15]}
        onClick={(e) => {
          e.stopPropagation();
          onFocus("checkout");
        }}
      >
        <CheckoutHall />
        <FacilitySign
          text="CHECKOUT"
          sub="RECORDED ORDER STATES / READ ONLY"
          onClick={() => onFocus("checkout")}
        />
      </group>
      {sites.map(({ warehouse: w, position }) => (
        <group
          key={w.warehouse_id}
          position={position}
          scale={0.63}
          onClick={(e) => {
            e.stopPropagation();
            onSelect({ kind: "warehouse", id: w.warehouse_id });
          }}
        >
          <WarehouseRoom
            stocks={(stocks[w.warehouse_id] ?? []).slice(0, 24)}
            products={products}
            selected={
              recordSelection?.kind === "product" &&
              recordSelection.warehouse_id !== w.warehouse_id
                ? null
                : recordSelection
            }
            onSelect={(s) =>
              onSelect(
                s?.kind === "product" || s?.kind === "rack"
                  ? { ...s, warehouse_id: w.warehouse_id }
                  : s,
              )
            }
          />
          <FacilitySign
            text={w.name}
            sub={`${w.city} / ${w.classification} / #${w.warehouse_id}`}
            width={15}
            position={[0, 4.2, 6.2]}
            onClick={() => onFocus("warehouse", w.warehouse_id)}
          />
        </group>
      ))}
      <group
        position={[20, 0, 15]}
        onClick={(e) => {
          e.stopPropagation();
          onFocus("fulfillment");
        }}
      >
        <Fulfillment
          orders={orders}
          paused={paused}
          selected={recordSelection}
          onSelect={onSelect}
        />
        <FacilitySign
          text="FULFILLMENT"
          sub="LOGICAL SHIPPING / NO PHYSICAL TRACKING"
          onClick={() => onFocus("fulfillment")}
        />
      </group>
      <Board snapshot={snapshot} />
      <Activities
        demo={demo}
        orders={orders}
        time={time}
        paused={paused}
        selected={selected}
        onSelect={onSelect}
      />
    </>
  );
}

export default function CampusScene({
  focus,
  zoomCommand,
  sites,
  stocks,
  orders,
  products,
  snapshot,
  monitoring,
  demo,
  paused,
  selected,
  onSelect,
  onFocus,
  onReady,
  onLost,
}: {
  focus: CampusFocus;
  zoomCommand: { serial: number; factor: number };
  sites: WarehouseSite[];
  stocks: Record<number, WorldStock[]>;
  orders: WorldOrder[];
  products: WorldProduct[];
  snapshot: WorldSnapshot | null;
  monitoring: WorldMonitoring | null;
  demo: boolean;
  paused: boolean;
  selected: CampusSelection;
  onSelect: (s: CampusSelection) => void;
  onFocus: CampusNavigation;
  onReady: () => void;
  onLost: () => void;
}) {
  return (
    <Canvas
      orthographic
      dpr={[1, 1.35]}
      shadows={{ type: PCFShadowMap }}
      camera={{ position: [52, 60, 68], zoom: 10, near: 0.1, far: 400 }}
      frameloop={paused ? "demand" : "always"}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor("#c8cfb9")}
      onPointerMissed={() => onSelect(null)}
      fallback={
        <div className="mini-fallback" role="alert">
          WebGL is unavailable. Enable desktop hardware acceleration.
        </div>
      }
    >
      <GraphicsLifecycle onLost={onLost} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={["#fff4de", "#6f815e", 1.3]} />
      <directionalLight
        castShadow
        position={[-35, 65, 35]}
        intensity={2.7}
        color="#fff0ce"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-normalBias={0.08}
      />
      <directionalLight
        position={[35, 20, -35]}
        intensity={0.7}
        color="#d4e3f4"
      />
      <mesh
        position={[0, -1.1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[300, 300]} />
        <meshStandardMaterial color="#c8cfb9" />
      </mesh>
      <Instances limit={5000} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.75} />
        <Models
          sites={sites}
          stocks={stocks}
          orders={orders}
          products={products}
          snapshot={snapshot}
          monitoring={monitoring}
          demo={demo}
          paused={paused}
          selected={selected}
          onSelect={onSelect}
          onFocus={onFocus}
        />
      </Instances>
      <CampusCamera
        focus={focus}
        sites={sites}
        zoomCommand={zoomCommand}
        onReady={onReady}
      />
    </Canvas>
  );
}

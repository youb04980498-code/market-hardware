import { useRef, type ComponentProps } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Billboard } from "@react-three/drei";
import { Group } from "three";
import { Block, Sign, Hardware } from "./geometry";
import { orderPosition, stageColors } from "./worldModel";
import type {
  WorldOrder,
  WorldStock,
  WorldProduct,
  WorldSelection,
} from "./worldModel";

// Screen-size LOD: tiny labels disappear when zoomed out; record lists remain accessible.
function LodSign(props: ComponentProps<typeof Sign>) {
  const ref = useRef<Group>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = camera.zoom >= 24;
  });
  return (
    <group ref={ref}>
      <Sign {...props} />
    </group>
  );
}

function Rack({ index, onClick }: { index: number; onClick: () => void }) {
  const x = ((index % 3) - 1) * 5.3,
    z = (Math.floor(index / 3) - 0.5) * 4.3;
  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {[-1.85, 1.85].map((dx) =>
        [-0.55, 0.55].map((dz) => (
          <Block
            key={`${dx}-${dz}`}
            size={[0.09, 2.9, 0.09]}
            position={[dx, 1.45, dz]}
            color="#536c72"
          />
        )),
      )}
      {[0.25, 1.1, 1.95, 2.8].map((y) => (
        <Block
          key={y}
          size={[3.9, 0.09, 1.25]}
          position={[0, y, 0]}
          color="#c8a879"
        />
      ))}
      <LodSign
        text={`RACK ${index + 1}`}
        sub="SYNTHETIC PLACEMENT"
        position={[0, 3.15, 0]}
        width={3}
        height={0.5}
      />
    </group>
  );
}

export function WarehouseRoom({
  stocks,
  products,
  onSelect,
  selected,
}: {
  stocks: WorldStock[];
  products: WorldProduct[];
  onSelect: (s: WorldSelection) => void;
  selected: WorldSelection;
}) {
  return (
    <>
      <Block
        size={[18.5, 3.6, 0.18]}
        position={[0, 1.8, -6.3]}
        color="#e8e8de"
      />
      <Sign
        text="INVENTORY / READ ONLY"
        sub="RACK LOCATIONS ARE SYNTHETIC"
        position={[0, 2.9, -6.17]}
        width={7}
        height={0.8}
        color="#37594b"
        ink="#fff8e8"
      />
      {Array.from({ length: 6 }, (_, i) => (
        <Rack
          key={i}
          index={i}
          onClick={() => onSelect({ kind: "rack", id: i })}
        />
      ))}
      {stocks.slice(0, 24).map((s, i) => {
        const rack = Math.floor(i / 4),
          slot = i % 4;
        const p = products.find((p) => p.productId === String(s.product_id));
        const x = ((rack % 3) - 1) * 5.3 + ((slot % 2) - 0.5) * 1.7,
          z = (Math.floor(rack / 3) - 0.5) * 4.3;
        const y = slot < 2 ? 0.62 : 1.5;
        const color =
          s.available === 0
            ? "#bc7f70"
            : s.reserved_quantity > 0
              ? "#9c91bd"
              : "#7fa28d";
        return (
          <group
            key={s.product_id}
            position={[x, y, z + 0.18]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ kind: "product", id: s.product_id });
            }}
          >
            <Block size={[1.1, 0.61, 0.75]} color={color} />
            <Block
              size={[0.13, 0.62, 0.77]}
              position={[0, 0, 0]}
              color="#e8d9b6"
            />
            <LodSign
              text={p?.sku ?? `PRODUCT ${s.product_id}`}
              sub={`AVAILABLE ${s.available} / RESERVED ${s.reserved_quantity}`}
              width={1.05}
              height={0.32}
              position={[0, 0.02, 0.39]}
            />
            {selected?.kind === "product" && selected.id === s.product_id && (
              <Billboard position={[0, 0.75, 0]}>
                <Sign
                  text={p?.name ?? String(s.product_id)}
                  width={3.4}
                  height={0.45}
                  color="#37594b"
                  ink="#ffffff"
                />
              </Billboard>
            )}
          </group>
        );
      })}
      <Block size={[2.4, 0.75, 1.1]} position={[7, 0.4, 5]} color="#bfa785" />
      <group position={[7, 1.1, 5]} scale={0.8}>
        <Hardware kind="board" />
      </group>
    </>
  );
}

function Parcel({
  order,
  paused,
  selected,
  onSelect,
}: {
  order: WorldOrder;
  paused: boolean;
  selected: boolean;
  onSelect: (s: WorldSelection) => void;
}) {
  const target = orderPosition(order.status, order.order_id);
  const initial = useRef(target);
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current && !paused) {
      for (let i = 0; i < 3; i++) {
        const key = (["x", "y", "z"] as const)[i];
        ref.current.position[key] +=
          (target[i] - ref.current.position[key]) * Math.min(delta * 2.5, 1);
      }
    }
  });
  return (
    <group
      ref={ref}
      position={initial.current}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: "order", id: order.order_id });
      }}
    >
      <RoundedBox
        args={[0.42, 0.47, 0.45]}
        radius={0.025}
        smoothness={1}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={stageColors[order.status] ?? "#989d96"} />
      </RoundedBox>
      <Block size={[0.055, 0.48, 0.46]} color="#ead9ae" />
      <LodSign
        text={`#${order.order_id}`}
        width={0.4}
        height={0.17}
        position={[0, 0.02, 0.236]}
      />
      {selected && (
        <Billboard position={[0, 1, 0]}>
          <Sign
            text={`ORDER #${order.order_id}`}
            sub={order.status}
            width={2.4}
            height={0.6}
            color="#37594b"
            ink="#fff7e3"
          />
        </Billboard>
      )}
    </group>
  );
}

export function Fulfillment({
  orders,
  paused,
  selected,
  onSelect,
}: {
  orders: WorldOrder[];
  paused: boolean;
  selected: WorldSelection;
  onSelect: (s: WorldSelection) => void;
}) {
  return (
    <>
      <Block size={[18.5, 3, 0.16]} position={[0, 1.5, -6.3]} color="#e8e8de" />
      <Sign
        text="FULFILLMENT / LOGICAL STATES"
        sub="ILLUSTRATIVE MOTION - NO PHYSICAL TRACKING"
        position={[0, 2.25, -6.15]}
        width={10}
        height={0.9}
        color="#37594b"
        ink="#fff7e3"
      />
      {(
        ["PENDING", "STOCK_RESERVED", "PAID", "SHIPPED", "DELIVERED"] as const
      ).map((status, i) => (
        <group key={status} position={[[-7, -4, -1, 3, 7][i], 0, 0]}>
          <Block
            size={[2, 0.18, 6]}
            position={[0, 0.4, -0.7]}
            color="#52685f"
          />
          {Array.from({ length: 14 }, (_, n) => (
            <Block
              key={n}
              size={[1.9, 0.035, 0.035]}
              position={[0, 0.51, -3.2 + n * 0.4]}
              color="#c6c8ac"
            />
          ))}
          {[-2.7, 1.7].map((z) => (
            <Block
              key={z}
              size={[1.3, 0.42, 0.16]}
              position={[0, 0.16, z]}
              color="#92a091"
            />
          ))}
          <Sign
            text={status.replaceAll("_", " ")}
            width={2.5}
            height={0.38}
            position={[0, 1.6, -4]}
            color={stageColors[status]}
            ink="#18382a"
          />
        </group>
      ))}
      <Sign
        text="EXCEPTIONS / CANCELLED / REFUNDED"
        position={[-3, 1.4, 4.9]}
        width={6}
        height={0.45}
      />
      <Block size={[4, 0.25, 1.7]} position={[-4, 0.15, 3.9]} color="#c7b7a2" />
      <group position={[4.9, 0, 4.4]}>
        <Block size={[3, 0.18, 1.6]} position={[0, 0.44, 0]} color="#8aa99d" />
        <Block
          size={[3, 0.8, 0.1]}
          position={[0, 0.9, -0.75]}
          color="#8aa99d"
        />
        <Block
          size={[0.12, 0.8, 1.6]}
          position={[1.45, 0.9, 0]}
          color="#8aa99d"
        />
        <Block
          size={[3, 0.35, 0.1]}
          position={[0, 0.6, 0.75]}
          color="#8aa99d"
        />
        <Block
          size={[1, 1.5, 1.6]}
          position={[-1.9, 0.96, 0]}
          color="#ecddbd"
        />
        <Block
          size={[0.6, 0.55, 0.03]}
          position={[-1.9, 1.23, 0.82]}
          color="#adcbd0"
        />
        {[-1.9, 0.8].map((x) =>
          [-0.8, 0.8].map((z) => (
            <mesh
              key={`${x}-${z}`}
              position={[x, 0.3, z]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.27, 0.27, 0.16, 10]} />
              <meshStandardMaterial color="#374a47" />
            </mesh>
          )),
        )}
        <Sign
          text="LOGICAL SHIPPING BAY"
          width={3.4}
          height={0.35}
          position={[0, 2, 0]}
        />
      </group>
      {orders.slice(0, 24).map((order) => (
        <Parcel
          key={order.order_id}
          order={order}
          paused={paused}
          selected={
            selected?.kind === "order" && selected.id === order.order_id
          }
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

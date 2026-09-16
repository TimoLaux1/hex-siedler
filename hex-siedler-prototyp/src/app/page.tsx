"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Resources = { wood: number; brick: number; wool: number; grain: number; ore: number };
type Player = { user_id: string; player_name: string; player_index: number; color: string; resources?: Resources; victory_points?: number };
type Settlement = { vertex: number; player: number; building?: "settlement" | "city" };
type Road = { edge: number; a: number; b: number; player: number };
type FishTile = { slot: number; number: number };
type GameState = { round?: number; phase?: string; setup_step?: number; setup_order?: number[]; active_player?: number; winner_player?: number; settlements?: Settlement[]; roads?: Road[]; dice?: number[] };
type Room = { id: string; join_code: string; status: string; created_by: string; state?: GameState; fish_tiles?: FishTile[]; victory_target?: number; version?: number };
type BuildMode = "road" | "settlement" | "city" | null;

const terrain = [
  ["Gebirge", "mountain", "▲", 10], ["Weide", "meadow", "⌁", 2], ["Wald", "forest", "♣", 9],
  ["Feld", "field", "✦", 12], ["Lehm", "clay", "◆", 6], ["Weide", "meadow", "⌁", 4], ["Lehm", "clay", "◆", 10],
  ["Wald", "forest", "♣", 9], ["Gebirge", "mountain", "▲", 11], ["Wüste", "desert", "●", 0], ["Wald", "forest", "♣", 3], ["Feld", "field", "✦", 8],
  ["Wald", "forest", "♣", 8], ["Feld", "field", "✦", 3], ["Weide", "meadow", "⌁", 4], ["Gebirge", "mountain", "▲", 5],
  ["Feld", "field", "✦", 5], ["Weide", "meadow", "⌁", 6], ["Lehm", "clay", "◆", 11],
] as const;

const rows = [3, 4, 5, 4, 3];
const colors = ["#287c91", "#db7558", "#d5a137", "#6f8652"];
const hexRadius = 64;
const hexWidth = Math.sqrt(3) * hexRadius;

const tileCenters = rows.flatMap((count, row) => {
  const startX = (610 - count * hexWidth) / 2 + hexWidth / 2;
  return Array.from({ length: count }, (_, column) => ({ x: startX + column * hexWidth, y: 80 + row * 96 }));
});

const fishCenters = [
  { x: tileCenters[0].x - hexWidth, y: tileCenters[0].y },
  { x: tileCenters[2].x + hexWidth, y: tileCenters[2].y },
  { x: tileCenters[16].x - hexWidth, y: tileCenters[16].y },
  { x: tileCenters[18].x + hexWidth, y: tileCenters[18].y },
];
const fishNumbers = [2, 3, 4, 5, 9, 10, 11, 12];

type Vertex = { id: number; x: number; y: number; neighbors: number[] };
type Edge = { id: number; a: number; b: number; x: number; y: number; angle: number };

function createBoardTopology(centers: { x: number; y: number }[]) {
  const vertices: Array<Omit<Vertex, "neighbors">> = [];
  const vertexKeys = new Map<string, number>();
  const edgePairs = new Map<string, { a: number; b: number }>();
  const tileVertices: number[][] = [];
  centers.forEach(({ x: centerX, y: centerY }) => {
      const corners: number[] = [];
      for (let corner = 0; corner < 6; corner++) {
        const angle = (-90 + corner * 60) * Math.PI / 180;
        const x = centerX + 64 * Math.cos(angle);
        const y = centerY + 64 * Math.sin(angle);
        const key = `${Math.round(x * 10)}:${Math.round(y * 10)}`;
        let id = vertexKeys.get(key);
        if (id === undefined) {
          id = vertices.length;
          vertexKeys.set(key, id);
          vertices.push({ id, x, y });
        }
        corners.push(id);
      }
      corners.forEach((a, index) => {
        const b = corners[(index + 1) % 6];
        const key = [a, b].sort((left, right) => left - right).join(":");
        edgePairs.set(key, { a, b });
      });
      tileVertices.push(corners);
  });
  const neighborSets = vertices.map(() => new Set<number>());
  const edges: Edge[] = [...edgePairs.values()].map(({ a, b }, id) => {
    neighborSets[a].add(b); neighborSets[b].add(a);
    const va = vertices[a], vb = vertices[b];
    return { id, a, b, x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2, angle: Math.atan2(vb.y - va.y, vb.x - va.x) * 180 / Math.PI };
  });
  return { vertices: vertices.map((vertex, id) => ({ ...vertex, neighbors: [...neighborSets[id]] })), edges, tileVertices };
}

const topology = createBoardTopology([...tileCenters, ...fishCenters]);

function TerrainArtwork({ type, x, y }: { type: string; x: number; y: number }) {
  if (type === "mountain") {
    return <g className="terrain-art mountain-art" transform={`translate(${x} ${y})`}>
      <path className="terrain-back" d="M-54 25-19-37 8 9 27-25 57 27Z" />
      <path className="terrain-front" d="M-41 28-4-27 17 4 34-18 57 28Z" />
      <path className="terrain-highlight" d="m-19-37-9 17 10-5 8 9 9-3Zm46 12-8 13 8-4 7 8 5-3Z" />
      <g className="ore-cluster" transform="translate(-43 -16)"><path d="m0 10 7-12 10 5 1 13-12 5Z"/><path d="m7-2-1 13 12 5"/></g>
    </g>;
  }
  if (type === "meadow") {
    return <g className="terrain-art meadow-art" transform={`translate(${x} ${y})`}>
      <path className="terrain-back" d="M-61 15Q-31-16 2 9Q31-20 62 4V39H-61Z" />
      <path className="terrain-front" d="M-62 29Q-25 2 8 27Q35 5 62 18V43H-62Z" />
      <g className="sheep" transform="translate(-39 -24)"><circle cx="7" cy="5" r="7"/><circle cx="15" cy="4" r="8"/><circle cx="23" cy="7" r="7"/><circle cx="28" cy="10" r="5"/><circle className="sheep-head" cx="32" cy="9" r="5"/><path d="M10 11v7m14-6v7"/></g>
      <path className="grass-strokes" d="m24-25 3-8 2 8 5-7m10 34 3-9 3 8 5-7M-21 24l3-8 3 8 5-7" />
    </g>;
  }
  if (type === "forest") {
    return <g className="terrain-art forest-art" transform={`translate(${x} ${y})`}>
      <path className="terrain-back" d="M-62 26Q-25 5 4 23Q36 0 63 21V43H-62Z" />
      {[-40, -18, 8, 33].map((treeX, index) => <g className={index % 2 ? "tree tree-light" : "tree"} key={treeX} transform={`translate(${treeX} ${index % 2 ? -14 : -5})`}><path d="m0-27-15 21h8l-12 17h15v14h8V11h15L7-6h8Z"/></g>)}
      <g className="wood-log" transform="translate(-48 -33)"><path d="M0 4h25v10H0z"/><ellipse cx="25" cy="9" rx="5" ry="5"/><path d="M25 6v6m-3-3h6"/></g>
    </g>;
  }
  if (type === "field") {
    return <g className="terrain-art field-art" transform={`translate(${x} ${y})`}>
      <path className="terrain-back" d="M-62 7Q-25-5 8 8Q35 17 62 3V43H-62Z" />
      {[-42, -24, -6, 12, 30, 48].map((stalkX, index) => <g className="wheat" key={stalkX} transform={`translate(${stalkX} ${index % 2 ? 5 : -2})`}><path d="M0 31V-20M0-9l-8-8m8 14 8-9M0 5l-8-8m8 18 8-9"/><ellipse cx="-8" cy="-17" rx="3" ry="7"/><ellipse cx="8" cy="-12" rx="3" ry="7"/></g>)}
      <path className="field-lines" d="M-59 28Q-20 10 15 28Q40 38 61 22M-57 38Q-21 20 12 37" />
    </g>;
  }
  if (type === "clay") {
    return <g className="terrain-art clay-art" transform={`translate(${x} ${y})`}>
      <path className="terrain-back" d="M-62 2Q-28-15 2 3Q32 20 62-2V43H-62Z" />
      <path className="clay-strata" d="M-60 18Q-28 2 1 17Q32 32 61 12M-59 33Q-24 18 9 34" />
      <g className="bricks" transform="translate(-47 -33)"><rect width="22" height="11" rx="2"/><rect x="24" width="22" height="11" rx="2"/><rect x="11" y="13" width="22" height="11" rx="2"/></g>
      <path className="clay-cracks" d="m34-21-8 9 7 8-10 10m-42-17 6 8-8 7" />
    </g>;
  }
  return <g className="terrain-art desert-art" transform={`translate(${x} ${y})`}>
    <circle className="desert-sun" cx="-38" cy="-27" r="9" />
    <path className="terrain-back" d="M-63 8Q-30-17 3 7Q35 28 64-1V43H-63Z" />
    <path className="terrain-front" d="M-63 29Q-25 3 9 28Q37 45 64 20V44H-63Z" />
    <path className="desert-wind" d="M17-28q16-7 30 0M29-18q12-5 23 1" />
  </g>;
}

function FishArtwork({ x, y }: { x: number; y: number }) {
  return <g className="terrain-art fish-art" transform={`translate(${x} ${y})`}>
    <path className="fish-wave fish-wave-back" d="M-63 12Q-40-2-17 12T29 12T75 12V44H-63Z" />
    <path className="fish-wave fish-wave-front" d="M-63 27Q-39 13-15 27T33 27T81 27V44H-63Z" />
    <g className="fish-school" transform="translate(-38 -23)">
      <path d="M0 9 9 1c10-7 24-2 29 8-5 10-19 15-29 8Z" />
      <path d="m0 9-10-8v16Z" />
      <circle cx="28" cy="8" r="1.8" />
    </g>
    <path className="fish-bubbles" d="M32-26a4 4 0 1 0 0 .1M43-16a2.5 2.5 0 1 0 0 .1" />
  </g>;
}

function OceanDecorations() {
  const fish = (x: number, y: number, scale = 1, flip = false) => <g className="ocean-fish" transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
    <path d="M-18 0C-8-13 11-13 23 0 11 13-8 13-18 0Z" />
    <path d="m-17 0-14-11v22Z" />
    <circle cx="15" cy="-2" r="2" />
  </g>;
  const dolphin = (x: number, y: number, scale = 1, flip = false) => <g className="ocean-dolphin" transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
    <path d="M-36 9C-17-17 17-22 42-5 27-5 22 2 12 9 0 18-15 18-28 14l-13 10 4-15Z" />
    <path d="M4-10 16-27 19-7M-5 11 8 25 10 8" />
    <circle cx="29" cy="-7" r="1.8" />
  </g>;
  return <svg className="ocean-decorations" viewBox="0 0 610 544" aria-hidden="true">
    {fish(-72, 98, .78)}{fish(-118, 145, .48)}{fish(-88, 195, .58, true)}
    {fish(686, 92, .65, true)}{fish(724, 142, .46, true)}{fish(692, 205, .52)}
    {fish(-98, 455, .62)}{fish(701, 462, .7, true)}
    {fish(105, -78, .55)}{fish(505, -92, .48, true)}
    {fish(118, 637, .55, true)}{fish(495, 648, .62)}
    {dolphin(-112, 318, .95)}{dolphin(718, 330, .88, true)}
    {dolphin(278, -105, .7, true)}{dolphin(337, 661, .75)}
    <g className="ocean-bubbles"><circle cx="-55" cy="255" r="7"/><circle cx="-34" cy="279" r="3"/><circle cx="672" cy="265" r="6"/><circle cx="650" cy="286" r="3"/></g>
  </svg>;
}

function hexPoints(x: number, y: number) {
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = (-90 + corner * 60) * Math.PI / 180;
    return `${x + hexRadius * Math.cos(angle)},${y + hexRadius * Math.sin(angle)}`;
  }).join(" ");
}

const diePips: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function PipDie({ value }: { value: number }) {
  const visiblePips = diePips[value] ?? [];
  return <span className="pip-die" role="img" aria-label={`Würfel zeigt ${value}`}>
    {Array.from({ length: 9 }, (_, index) => (
      <span
        aria-hidden="true"
        className={`pip ${visiblePips.includes(index + 1) ? "visible" : ""}`}
        key={index}
      />
    ))}
  </span>;
}

type ResourceKind = keyof Resources;

const resourceCards: { key: ResourceKind; label: string }[] = [
  { key: "wood", label: "Holz" },
  { key: "brick", label: "Lehm" },
  { key: "wool", label: "Wolle" },
  { key: "grain", label: "Getreide" },
  { key: "ore", label: "Erz" },
];

function ResourceIcon({ kind }: { kind: ResourceKind }) {
  if (kind === "wood") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path className="icon-fill" d="M6 9h19v14H6z"/><ellipse className="icon-light" cx="25" cy="16" rx="5" ry="7"/><path className="icon-line" d="M25 12v8m-3-4h6M8 12h13M8 20h13"/></svg>;
  }
  if (kind === "brick") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><rect className="icon-fill" x="3" y="7" width="12" height="8" rx="2"/><rect className="icon-light" x="17" y="7" width="12" height="8" rx="2"/><rect className="icon-fill" x="10" y="17" width="12" height="8" rx="2"/><path className="icon-line" d="M5 11h8m6 0h8m-7 10h-8"/></svg>;
  }
  if (kind === "wool") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><circle className="icon-light" cx="11" cy="14" r="7"/><circle className="icon-light" cx="18" cy="12" r="8"/><circle className="icon-light" cx="23" cy="17" r="7"/><circle className="icon-fill" cx="26" cy="16" r="5"/><path className="icon-line" d="M10 20v5m12-4v4m6-12 2-2"/></svg>;
  }
  if (kind === "grain") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path className="icon-line thick" d="M16 28V5M16 12 9 7m7 11 8-6m-8 13-8-6"/><ellipse className="icon-fill" cx="9" cy="7" rx="4" ry="7" transform="rotate(-42 9 7)"/><ellipse className="icon-light" cx="24" cy="12" rx="4" ry="7" transform="rotate(42 24 12)"/><ellipse className="icon-fill" cx="8" cy="19" rx="4" ry="7" transform="rotate(-42 8 19)"/></svg>;
  }
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path className="icon-fill" d="m4 20 5-13 9-3 10 9-4 13H10Z"/><path className="icon-light" d="m9 7 7 8 2-11m-2 11 12-2M16 15l8 11m-8-11-6 11"/><path className="icon-line" d="m4 20 5-13 9-3 10 9-4 13H10Z"/></svg>;
}

function FullBoard({ room, fishTiles, myIndex, buildMode, isActiveTurn, onVertex, onEdge }: { room?: Room | null; fishTiles?: FishTile[]; myIndex?: number; buildMode?: BuildMode; isActiveTurn?: boolean; onVertex?: (vertex: Vertex) => void; onEdge?: (edge: Edge) => void }) {
  const state = room?.state;
  const visibleFish = fishTiles ?? room?.fish_tiles ?? [];
  const settlements = state?.settlements ?? [];
  const roads = state?.roads ?? [];
  const step = state?.setup_step ?? 0;
  const currentPlayer = state?.setup_order?.[step];
  const mySetupTurn = myIndex !== undefined && currentPlayer === myIndex;
  const regularBuildTurn = Boolean(isActiveTurn && state?.phase === "build");
  const blockedVertices = new Set(settlements.flatMap((item) => [item.vertex, ...(topology.vertices[item.vertex]?.neighbors ?? [])]));
  const latestOwnSettlement = [...settlements].reverse().find((item) => item.player === myIndex)?.vertex;
  const ownBuildingVertices = new Set(settlements.filter((item) => item.player === myIndex).map((item) => item.vertex));
  const opponentBuildingVertices = new Set(settlements.filter((item) => item.player !== myIndex).map((item) => item.vertex));
  const ownRoadVertices = new Set(roads.filter((item) => item.player === myIndex).flatMap((item) => [item.a, item.b]));
  const visibleTileIndices = [...Array.from({ length: terrain.length }, (_, index) => index), ...visibleFish.map((fish) => terrain.length + fish.slot)];
  const visibleVertices = new Set(visibleTileIndices.flatMap((index) => topology.tileVertices[index] ?? []));
  return (
    <div className="full-board" aria-label={`Spielfeld mit 19 Landschaftsfeldern und ${visibleFish.length} Fischfeldern`}>
      <OceanDecorations />
      <svg className="board-svg" viewBox="0 0 610 544" role="img" aria-label={`Spielfeld mit 19 Landschaftsfeldern und ${visibleFish.length} Fischfeldern`}>
        <defs>
          <linearGradient id="mountain-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#aeb9b3"/><stop offset=".45" stopColor="#667572"/><stop offset="1" stopColor="#3e4c49"/></linearGradient>
          <linearGradient id="meadow-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b9ce8e"/><stop offset="1" stopColor="#719854"/></linearGradient>
          <linearGradient id="forest-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#4e8062"/><stop offset="1" stopColor="#214d39"/></linearGradient>
          <linearGradient id="field-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#efd06a"/><stop offset="1" stopColor="#bd8e29"/></linearGradient>
          <linearGradient id="clay-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#cd805b"/><stop offset="1" stopColor="#88452f"/></linearGradient>
          <linearGradient id="desert-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dac997"/><stop offset="1" stopColor="#aa945d"/></linearGradient>
          <linearGradient id="fish-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#62c7d5"/><stop offset=".55" stopColor="#278fa9"/><stop offset="1" stopColor="#166b88"/></linearGradient>
        </defs>
        {visibleFish.map((fish) => {
          const { x, y } = fishCenters[fish.slot];
          const points = hexPoints(x, y);
          return <g key={`fish-${fish.slot}`} className="svg-tile fish">
            <polygon points={points} fill="url(#fish-fill)" />
            <polygon className="tile-inset" points={points} />
            <FishArtwork x={x} y={y} />
            <text className="svg-name" x={x} y={y + 37}>Fischgrund</text>
            <g className="svg-token"><circle cx={x} cy={y} r="18"/><text x={x} y={y + 5}>{fish.number}</text></g>
          </g>;
        })}
        {tileCenters.map(({ x, y }, index) => {
          const [name, className, , number] = terrain[index];
          const points = hexPoints(x, y);
          return <g key={`${name}-${index}`} className={`svg-tile ${className}`}>
            <polygon points={points} fill={`url(#${className}-fill)`} />
            <polygon className="tile-inset" points={points} />
            <TerrainArtwork type={className} x={x} y={y} />
            <text className="svg-name" x={x} y={y + 37}>{name}</text>
            {number > 0 && <g className={`svg-token ${number === 6 || number === 8 ? "hot" : ""}`}><circle cx={x} cy={y} r="18"/><text x={x} y={y + 5}>{number}</text></g>}
          </g>;
        })}
      </svg>
      {room && topology.edges.filter((edge) => visibleVertices.has(edge.a) && visibleVertices.has(edge.b)).map((edge) => {
        const built = roads.find((road) => road.edge === edge.id);
        const setupSelectable = mySetupTurn && state?.phase === "setup_road" && !built && (edge.a === latestOwnSettlement || edge.b === latestOwnSettlement);
        const roadConnected = [edge.a, edge.b].some((vertex) => ownBuildingVertices.has(vertex) || (!opponentBuildingVertices.has(vertex) && ownRoadVertices.has(vertex)));
        const buildSelectable = regularBuildTurn && buildMode === "road" && !built && roadConnected;
        const selectable = setupSelectable || buildSelectable;
        if (!built && !selectable) return null;
        return <button key={`edge-${edge.id}`} className={`setup-edge ${selectable ? "selectable" : "built"}`} style={{ left: edge.x, top: edge.y, transform: `translate(-50%,-50%) rotate(${edge.angle}deg)`, background: built ? colors[built.player] : undefined }} onClick={() => selectable && onEdge?.(edge)} aria-label="Straße setzen" />;
      })}
      {room && topology.vertices.filter((vertex) => visibleVertices.has(vertex.id)).map((vertex) => {
        const built = settlements.find((settlement) => settlement.vertex === vertex.id);
        const setupSelectable = mySetupTurn && state?.phase === "setup_settlement" && !blockedVertices.has(vertex.id);
        const settlementSelectable = regularBuildTurn && buildMode === "settlement" && !built && !blockedVertices.has(vertex.id) && ownRoadVertices.has(vertex.id);
        const citySelectable = Boolean(regularBuildTurn && buildMode === "city" && built && built.player === myIndex && built.building !== "city");
        const selectable = setupSelectable || settlementSelectable || citySelectable;
        if (!built && !selectable) return null;
        return <button key={`vertex-${vertex.id}`} className={`setup-vertex ${selectable ? "selectable" : "built"} ${built?.building === "city" ? "city" : ""}`} style={{ left: vertex.x, top: vertex.y, background: built ? colors[built.player] : undefined }} onClick={() => selectable && onVertex?.(vertex)} aria-label={citySelectable ? "Zur Stadt ausbauen" : "Siedlung setzen"}>{built ? built.building === "city" ? "♜" : "⌂" : "+"}</button>;
      })}
    </div>
  );
}

export default function Home() {
  const [name, setName] = useState("");
  const [fishTiles, setFishTiles] = useState<FishTile[]>([]);
  const [victoryTarget, setVictoryTarget] = useState(10);
  const [code, setCode] = useState(() => typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase());
  const [userId, setUserId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [error, setError] = useState(supabase ? "" : "Supabase ist noch nicht mit der App verbunden.");

  const isHost = room?.created_by === userId;
  const me = players.find((player) => player.user_id === userId);
  const activePlayer = players.find((player) => player.player_index === room?.state?.active_player);
  const isMyTurn = me?.player_index === room?.state?.active_player;
  const myResources = me?.resources ?? { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  const canBuildRoad = myResources.wood >= 1 && myResources.brick >= 1;
  const canBuildSettlement = myResources.wood >= 1 && myResources.brick >= 1 && myResources.wool >= 1 && myResources.grain >= 1;
  const canBuildCity = myResources.ore >= 3 && myResources.grain >= 2;
  const shareUrl = useMemo(() => room && typeof window !== "undefined" ? `${window.location.origin}?room=${room.join_code}` : "", [room]);

  function cycleFishTiles() {
    if (fishTiles.length === 4) {
      setFishTiles([]);
      return;
    }
    const freeSlots = fishCenters.map((_, slot) => slot).filter((slot) => !fishTiles.some((fish) => fish.slot === slot));
    const slot = freeSlots[Math.floor(Math.random() * freeSlots.length)];
    const number = fishNumbers[Math.floor(Math.random() * fishNumbers.length)];
    setFishTiles((current) => [...current, { slot, number }]);
  }

  function cycleVictoryTarget() {
    setVictoryTarget((current) => current >= 15 ? 10 : current + 1);
  }

  useEffect(() => {
    const client = supabase;
    if (!client) {
      return;
    }
    client.auth.getSession().then(async ({ data }) => {
      if (data.session?.user.id) {
        setUserId(data.session.user.id);
        return;
      }
      const { data: authData, error: authError } = await client.auth.signInAnonymously();
      if (authError) setError(authError.message);
      else setUserId(authData.user?.id ?? "");
    });
  }, []);

  const roomId = room?.id;

  useEffect(() => {
    const client = supabase;
    if (!roomId || !client) return;
    const loadPlayers = async () => {
      const { data, error: playersError } = await client.rpc("get_game_players", { p_game_id: roomId });
      if (playersError) {
        setError(playersError.message);
        return;
      }
      setPlayers((data as Player[]) ?? []);
    };
    const loadRoom = async () => {
      const { data } = await client.rpc("get_game_room", { p_game_id: roomId });
      const freshRoom = Array.isArray(data) ? data[0] : data;
      if (freshRoom) setRoom(freshRoom as Room);
    };
    loadPlayers();
    const refreshTimer = window.setInterval(() => {
      void loadPlayers();
      void loadRoom();
    }, 2000);
    const channel = client.channel(`room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${roomId}` }, loadPlayers)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${roomId}` }, (payload) => setRoom(payload.new as Room))
      .subscribe();
    return () => {
      window.clearInterval(refreshTimer);
      client.removeChannel(channel);
    };
  }, [roomId]);

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim()) return;
    setBusy(true); setError("");
    const { data, error: rpcError } = await supabase.rpc("create_game_room_with_options", { p_player_name: name.trim(), p_fish_tiles: fishTiles, p_victory_target: victoryTarget });
    if (rpcError) setError(rpcError.message);
    else {
      const result = data[0];
      setRoom({ id: result.game_id, join_code: result.join_code, status: "waiting", created_by: userId, fish_tiles: fishTiles, victory_target: victoryTarget });
      window.history.replaceState({}, "", `?room=${result.join_code}`);
    }
    setBusy(false);
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim() || code.length !== 6) return;
    setBusy(true); setError("");
    const { data, error: rpcError } = await supabase.rpc("join_game_room", { p_join_code: code.toUpperCase(), p_player_name: name.trim() });
    if (rpcError) setError(rpcError.message);
    else {
      const result = data?.[0];
      if (!result?.game_id) {
        setError("Der Beitritt wurde nicht bestätigt. Bitte versuche es erneut.");
      } else {
        const { data: gameData, error: gameError } = await supabase.rpc("get_game_room", { p_game_id: result.game_id });
        const game = Array.isArray(gameData) ? gameData[0] : gameData;
        if (gameError) setError(gameError.message);
        else if (!game) setError("Der Spielraum konnte nach dem Beitritt nicht geladen werden.");
        else {
          setRoom(game as Room);
          window.history.replaceState({}, "", `?room=${code.toUpperCase()}`);
        }
      }
    }
    setBusy(false);
  }

  function normalizedRoom(data: unknown) {
    return (Array.isArray(data) ? data[0] : data) as Room;
  }

  async function startGame() {
    if (!supabase || !room || players.length < 2) return;
    setError("");
    const { data, error: setupError } = await supabase.rpc("start_game_setup", { p_game_id: room.id });
    if (setupError) setError(setupError.message); else setRoom(normalizedRoom(data));
  }

  async function placeSettlement(vertex: Vertex) {
    if (!supabase || !room) return;
    setBusy(true); setError("");
    const rpcName = room.state?.phase === "setup_settlement"
      ? "place_setup_settlement"
      : buildMode === "city" ? "upgrade_game_city" : "build_game_settlement";
    const parameters = rpcName === "place_setup_settlement"
      ? { p_game_id: room.id, p_vertex: vertex.id, p_neighbor_vertices: vertex.neighbors }
      : { p_game_id: room.id, p_vertex: vertex.id };
    const { data, error: placementError } = await supabase.rpc(rpcName, parameters);
    if (placementError) setError(placementError.message);
    else {
      const { data: winnerData, error: winnerError } = await supabase.rpc("check_game_winner", { p_game_id: room.id });
      if (winnerError) setError(winnerError.message);
      setRoom(normalizedRoom(winnerData ?? data));
      setBuildMode(null);
    }
    setBusy(false);
  }

  async function placeRoad(edge: Edge) {
    if (!supabase || !room) return;
    setBusy(true); setError("");
    const rpcName = room.state?.phase === "setup_road" ? "place_setup_road" : "build_game_road";
    const { data, error: placementError } = await supabase.rpc(rpcName, { p_game_id: room.id, p_edge: edge.id, p_vertex_a: edge.a, p_vertex_b: edge.b });
    if (placementError) setError(placementError.message);
    else { setRoom(normalizedRoom(data)); setBuildMode(null); }
    setBusy(false);
  }

  async function rollDice() {
    if (!supabase || !room || !isMyTurn) return;
    setBusy(true); setError("");
    const { data, error: rollError } = await supabase.rpc("roll_turn_dice", { p_game_id: room.id });
    if (rollError) setError(rollError.message); else setRoom(normalizedRoom(data));
    setBusy(false);
  }

  async function endTurn() {
    if (!supabase || !room || !isMyTurn) return;
    setBusy(true); setError("");
    const { data, error: turnError } = await supabase.rpc("end_player_turn", { p_game_id: room.id });
    if (turnError) setError(turnError.message); else { setRoom(normalizedRoom(data)); setBuildMode(null); }
    setBusy(false);
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(shareUrl);
  }

  if (!room) {
    return (
      <main className="lobby-shell">
        <section className="lobby-card">
          <div className="lobby-brand"><span>⬡</span> NEW KATAN</div>
          <p className="lobby-kicker">Online-Prototyp · Version 4</p>
          <h1>Katan ohne Klaus.<span className="lobby-title-line">Teubi muss draußen bleiben.</span></h1>
          <label>Dein Spielername<input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="z. B. Timo" /></label>
          <button className={`fish-option ${fishTiles.length ? "active" : ""}`} type="button" onClick={cycleFishTiles}>
            <span><b>+ Fisch</b><small>Zufälliger Rohstoff beim Würfeln</small></span>
            <strong>{fishTiles.length}/4</strong>
          </button>
          <button className="victory-option" type="button" onClick={cycleVictoryTarget}>
            <span><b>Siegpunkte</b><small>Ziel für den Spielsieg</small></span>
            <strong>{victoryTarget}</strong>
          </button>
          <form onSubmit={createRoom}><button className="lobby-primary" disabled={busy || !name.trim()}>Neues Spiel erstellen</button></form>
          <div className="lobby-divider"><span>oder beitreten</span></div>
          <form className="join-form" onSubmit={joinRoom}>
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase())} placeholder="SPIELCODE" />
            <button disabled={busy || !name.trim() || code.length !== 6}>Beitreten</button>
          </form>
          {error && <p className="lobby-error">{error}</p>}
          <small>Keine Registrierung nötig. Räume sind nur für eingeladene Testspieler gedacht.</small>
        </section>
        <div className="lobby-board"><FullBoard fishTiles={fishTiles} /></div>
      </main>
    );
  }

  return (
    <main className="online-shell">
      <header className="online-topbar">
        <div className="brand"><span className="brand-mark">⬡</span> NEW KATAN</div>
        <div className="room-code">Raum <strong>{room.join_code}</strong></div>
        <button className="copy-button" onClick={copyInvite}>Einladungslink kopieren</button>
      </header>
      <section className="online-layout">
        <aside className="room-panel card">
          <p className="eyebrow">Spieler · {players.length}/4</p>
          {players.map((player) => (
            <div className="room-player" key={player.user_id}>
              <span style={{ background: colors[player.player_index] }}>{player.player_name.slice(0, 1).toUpperCase()}</span>
              <strong>{player.player_name}{player.user_id === userId ? " (Du)" : ""}</strong>
              <small>{room.status === "waiting" ? player.player_index + 1 : `${player.victory_points ?? 2} VP`}</small>
            </div>
          ))}
          {Array.from({ length: 4 - players.length }).map((_, index) => <div className="empty-player" key={index}>Warte auf Spieler …</div>)}
          {room.state?.phase && !room.state.phase.startsWith("setup_") && me && (
            <div className="resource-wallet">
              <p className="eyebrow">Deine Rohstoffe</p>
              <div className="resource-list">
                {resourceCards.map(({ key, label }) => (
                  <div className={`resource-card resource-${key}`} key={key}>
                    <span className="resource-badge"><ResourceIcon kind={key} /></span>
                    <span className="resource-label">{label}</span>
                    <b>{me.resources?.[key] ?? 0}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
        <section className="online-board-area">
          <FullBoard room={room} myIndex={me?.player_index} buildMode={buildMode} isActiveTurn={isMyTurn} onVertex={placeSettlement} onEdge={placeRoad} />
          {room.status === "waiting" ? (
            <div className="waiting-card">
              <strong>{players.length < 2 ? "Warte auf Mitspieler" : "Bereit zum Start"}</strong>
              <span>Teile den Code {room.join_code} oder den Einladungslink · Ziel: {room.victory_target ?? 10} Siegpunkte.</span>
              {isHost && <button onClick={startGame} disabled={players.length < 2}>Spiel starten</button>}
              {error && <span className="setup-error">{error}</span>}
            </div>
          ) : room.status === "finished" ? (
            <div className="waiting-card victory-card">
              <span className="victory-crown">♛</span>
              <strong>{players.find((player) => player.player_index === room.state?.winner_player)?.player_name ?? "Ein Spieler"} gewinnt!</strong>
              <span>Das Ziel von {room.victory_target ?? 10} Siegpunkten wurde erreicht.</span>
            </div>
          ) : room.state?.phase?.startsWith("setup_") ? (
            <div className="waiting-card playing">
              <strong>{room.state.phase === "setup_settlement" ? "Siedlung wählen" : "Angrenzende Straße wählen"}</strong>
              <span>{room.state.setup_order?.[room.state.setup_step ?? 0] === me?.player_index ? "Du bist am Zug – wähle direkt auf dem Spielfeld." : `${players.find((player) => player.player_index === room.state?.setup_order?.[room.state?.setup_step ?? 0])?.player_name ?? "Mitspieler"} ist am Zug.`}</span>
              {error && <span className="setup-error">{error}</span>}
            </div>
          ) : (
            <div className="turn-card">
              <div className="turn-heading">
                <span>Runde {room.state?.round ?? 1}</span>
                <strong>{isMyTurn ? "Du bist am Zug" : `${activePlayer?.player_name ?? "Mitspieler"} ist am Zug`}</strong>
              </div>
              {room.state?.dice ? (
                <div className="online-dice"><PipDie value={room.state.dice[0]} /><PipDie value={room.state.dice[1]} /><b>= {room.state.dice[0] + room.state.dice[1]}</b></div>
              ) : <span className="turn-note">Der aktive Spieler würfelt einmal.</span>}
              {room.state?.phase === "turn" && <button onClick={rollDice} disabled={!isMyTurn || busy}>Würfeln</button>}
              {room.state?.phase === "build" && <>
                <span className="turn-note">{buildMode ? `Wähle jetzt ${buildMode === "road" ? "eine angeschlossene Kante" : buildMode === "settlement" ? "einen erlaubten Bauplatz" : "eine eigene Siedlung"} auf dem Spielfeld.` : "Rohstoffe wurden verteilt. Du kannst mehrere Aktionen ausführen."}</span>
                <div className="build-actions">
                  <button className={buildMode === "road" ? "active" : ""} onClick={() => setBuildMode(buildMode === "road" ? null : "road")} disabled={!isMyTurn || busy || !canBuildRoad}><strong>Straße</strong><small>1 Holz · 1 Lehm</small></button>
                  <button className={buildMode === "settlement" ? "active" : ""} onClick={() => setBuildMode(buildMode === "settlement" ? null : "settlement")} disabled={!isMyTurn || busy || !canBuildSettlement}><strong>Siedlung</strong><small>Holz · Lehm · Wolle · Getreide</small></button>
                  <button className={buildMode === "city" ? "active" : ""} onClick={() => setBuildMode(buildMode === "city" ? null : "city")} disabled={!isMyTurn || busy || !canBuildCity}><strong>Stadt</strong><small>3 Erz · 2 Getreide</small></button>
                </div>
                <button className="end-button" onClick={endTurn} disabled={!isMyTurn || busy}>Zug beenden</button>
              </>}
              {room.state?.phase === "robber" && <><span className="turn-note">Eine 7 wurde gewürfelt. Die interaktive Räuberwahl folgt als nächster Schritt.</span><button className="end-button" onClick={endTurn} disabled={!isMyTurn || busy}>Zug fortsetzen</button></>}
              {error && <span className="setup-error">{error}</span>}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

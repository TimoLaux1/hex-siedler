"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Player = { user_id: string; player_name: string; player_index: number; color: string };
type Settlement = { vertex: number; player: number };
type Road = { edge: number; a: number; b: number; player: number };
type GameState = { round?: number; phase?: string; setup_step?: number; setup_order?: number[]; active_player?: number; settlements?: Settlement[]; roads?: Road[] };
type Room = { id: string; join_code: string; status: string; created_by: string; state?: GameState; version?: number };

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

type Vertex = { id: number; x: number; y: number; neighbors: number[] };
type Edge = { id: number; a: number; b: number; x: number; y: number; angle: number };

function createBoardTopology() {
  const vertices: Array<Omit<Vertex, "neighbors">> = [];
  const vertexKeys = new Map<string, number>();
  const edgePairs = new Map<string, { a: number; b: number }>();
  let tile = 0;
  rows.forEach((count) => {
    for (let column = 0; column < count; column++) {
      const { x: centerX, y: centerY } = tileCenters[tile++];
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
    }
  });
  const neighborSets = vertices.map(() => new Set<number>());
  const edges: Edge[] = [...edgePairs.values()].map(({ a, b }, id) => {
    neighborSets[a].add(b); neighborSets[b].add(a);
    const va = vertices[a], vb = vertices[b];
    return { id, a, b, x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2, angle: Math.atan2(vb.y - va.y, vb.x - va.x) * 180 / Math.PI };
  });
  return { vertices: vertices.map((vertex, id) => ({ ...vertex, neighbors: [...neighborSets[id]] })), edges };
}

const topology = createBoardTopology();

function FullBoard({ room, myIndex, onVertex, onEdge }: { room?: Room | null; myIndex?: number; onVertex?: (vertex: Vertex) => void; onEdge?: (edge: Edge) => void }) {
  const state = room?.state;
  const settlements = state?.settlements ?? [];
  const roads = state?.roads ?? [];
  const step = state?.setup_step ?? 0;
  const currentPlayer = state?.setup_order?.[step];
  const myTurn = myIndex !== undefined && currentPlayer === myIndex;
  const blockedVertices = new Set(settlements.flatMap((item) => [item.vertex, ...(topology.vertices[item.vertex]?.neighbors ?? [])]));
  const latestOwnSettlement = [...settlements].reverse().find((item) => item.player === myIndex)?.vertex;
  return (
    <div className="full-board" aria-label="Spielfeld mit 19 Landschaftsfeldern">
      <svg className="board-svg" viewBox="0 0 610 544" role="img" aria-label="Spielfeld mit 19 bündig verbundenen Landschaftsfeldern">
        <defs>
          <linearGradient id="mountain-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#aeb9b3"/><stop offset=".45" stopColor="#667572"/><stop offset="1" stopColor="#3e4c49"/></linearGradient>
          <linearGradient id="meadow-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b9ce8e"/><stop offset="1" stopColor="#719854"/></linearGradient>
          <linearGradient id="forest-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#4e8062"/><stop offset="1" stopColor="#214d39"/></linearGradient>
          <linearGradient id="field-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#efd06a"/><stop offset="1" stopColor="#bd8e29"/></linearGradient>
          <linearGradient id="clay-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#cd805b"/><stop offset="1" stopColor="#88452f"/></linearGradient>
          <linearGradient id="desert-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dac997"/><stop offset="1" stopColor="#aa945d"/></linearGradient>
        </defs>
        {tileCenters.map(({ x, y }, index) => {
          const [name, className, icon, number] = terrain[index];
          const points = Array.from({ length: 6 }, (_, corner) => {
            const angle = (-90 + corner * 60) * Math.PI / 180;
            return `${x + hexRadius * Math.cos(angle)},${y + hexRadius * Math.sin(angle)}`;
          }).join(" ");
          return <g key={`${name}-${index}`} className={`svg-tile ${className}`}>
            <polygon points={points} fill={`url(#${className}-fill)`} />
            <polygon className="tile-inset" points={points} />
            <text className="svg-symbol" x={x - 27} y={y - 13}>{icon}</text>
            <text className="svg-name" x={x} y={y + 37}>{name}</text>
            {number > 0 && <g className={`svg-token ${number === 6 || number === 8 ? "hot" : ""}`}><circle cx={x} cy={y} r="18"/><text x={x} y={y + 5}>{number}</text></g>}
          </g>;
        })}
      </svg>
      {room && topology.edges.map((edge) => {
        const built = roads.find((road) => road.edge === edge.id);
        const selectable = myTurn && state?.phase === "setup_road" && !built && (edge.a === latestOwnSettlement || edge.b === latestOwnSettlement);
        if (!built && !selectable) return null;
        return <button key={`edge-${edge.id}`} className={`setup-edge ${selectable ? "selectable" : "built"}`} style={{ left: edge.x, top: edge.y, transform: `translate(-50%,-50%) rotate(${edge.angle}deg)`, background: built ? colors[built.player] : undefined }} onClick={() => selectable && onEdge?.(edge)} aria-label="Straße setzen" />;
      })}
      {room && topology.vertices.map((vertex) => {
        const built = settlements.find((settlement) => settlement.vertex === vertex.id);
        const selectable = myTurn && state?.phase === "setup_settlement" && !blockedVertices.has(vertex.id);
        if (!built && !selectable) return null;
        return <button key={`vertex-${vertex.id}`} className={`setup-vertex ${selectable ? "selectable" : "built"}`} style={{ left: vertex.x, top: vertex.y, background: built ? colors[built.player] : undefined }} onClick={() => selectable && onVertex?.(vertex)} aria-label="Siedlung setzen">{built ? "⌂" : "+"}</button>;
      })}
    </div>
  );
}

export default function Home() {
  const [name, setName] = useState("");
  const [code, setCode] = useState(() => typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase());
  const [userId, setUserId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(supabase ? "" : "Supabase ist noch nicht mit der App verbunden.");

  const isHost = room?.created_by === userId;
  const me = players.find((player) => player.user_id === userId);
  const shareUrl = useMemo(() => room && typeof window !== "undefined" ? `${window.location.origin}?room=${room.join_code}` : "", [room]);

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
    loadPlayers();
    const channel = client.channel(`room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${roomId}` }, loadPlayers)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${roomId}` }, (payload) => setRoom(payload.new as Room))
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [roomId]);

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim()) return;
    setBusy(true); setError("");
    const { data, error: rpcError } = await supabase.rpc("create_game_room", { p_player_name: name.trim() });
    if (rpcError) setError(rpcError.message);
    else {
      const result = data[0];
      setRoom({ id: result.game_id, join_code: result.join_code, status: "waiting", created_by: userId });
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
    setError("");
    const { data, error: placementError } = await supabase.rpc("place_setup_settlement", { p_game_id: room.id, p_vertex: vertex.id, p_neighbor_vertices: vertex.neighbors });
    if (placementError) setError(placementError.message); else setRoom(normalizedRoom(data));
  }

  async function placeRoad(edge: Edge) {
    if (!supabase || !room) return;
    setError("");
    const { data, error: placementError } = await supabase.rpc("place_setup_road", { p_game_id: room.id, p_edge: edge.id, p_vertex_a: edge.a, p_vertex_b: edge.b });
    if (placementError) setError(placementError.message); else setRoom(normalizedRoom(data));
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(shareUrl);
  }

  if (!room) {
    return (
      <main className="lobby-shell">
        <section className="lobby-card">
          <div className="lobby-brand"><span>⬡</span> HEXLANDE</div>
          <p className="lobby-kicker">Online-Prototyp · Version 4</p>
          <h1>Baue Deine Welt.<br />Spielt sie gemeinsam.</h1>
          <p className="lobby-copy">Erstelle einen privaten Spielraum oder tritt mit einem sechsstelligen Code bei.</p>
          <label>Dein Spielername<input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="z. B. Timo" /></label>
          <form onSubmit={createRoom}><button className="lobby-primary" disabled={busy || !name.trim()}>Neues Spiel erstellen</button></form>
          <div className="lobby-divider"><span>oder beitreten</span></div>
          <form className="join-form" onSubmit={joinRoom}>
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase())} placeholder="SPIELCODE" />
            <button disabled={busy || !name.trim() || code.length !== 6}>Beitreten</button>
          </form>
          {error && <p className="lobby-error">{error}</p>}
          <small>Keine Registrierung nötig. Räume sind nur für eingeladene Testspieler gedacht.</small>
        </section>
        <div className="lobby-board"><FullBoard /></div>
      </main>
    );
  }

  return (
    <main className="online-shell">
      <header className="online-topbar">
        <div className="brand"><span className="brand-mark">⬡</span> HEXLANDE</div>
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
              <small>{player.player_index + 1}</small>
            </div>
          ))}
          {Array.from({ length: 4 - players.length }).map((_, index) => <div className="empty-player" key={index}>Warte auf Spieler …</div>)}
        </aside>
        <section className="online-board-area">
          <FullBoard room={room} myIndex={me?.player_index} onVertex={placeSettlement} onEdge={placeRoad} />
          {room.status === "waiting" ? (
            <div className="waiting-card">
              <strong>{players.length < 2 ? "Warte auf Mitspieler" : "Bereit zum Start"}</strong>
              <span>Teile den Code {room.join_code} oder den Einladungslink.</span>
              {isHost && <button onClick={startGame} disabled={players.length < 2}>Spiel starten</button>}
            </div>
          ) : room.state?.phase?.startsWith("setup_") ? (
            <div className="waiting-card playing">
              <strong>{room.state.phase === "setup_settlement" ? "Siedlung wählen" : "Angrenzende Straße wählen"}</strong>
              <span>{room.state.setup_order?.[room.state.setup_step ?? 0] === me?.player_index ? "Du bist am Zug – wähle direkt auf dem Spielfeld." : `${players.find((player) => player.player_index === room.state?.setup_order?.[room.state?.setup_step ?? 0])?.player_name ?? "Mitspieler"} ist am Zug.`}</span>
              {error && <span className="setup-error">{error}</span>}
            </div>
          ) : (
            <div className="waiting-card playing"><strong>Startaufstellung abgeschlossen</strong><span>Der ausgeloste Startspieler beginnt den ersten Zug.</span></div>
          )}
        </section>
      </section>
    </main>
  );
}

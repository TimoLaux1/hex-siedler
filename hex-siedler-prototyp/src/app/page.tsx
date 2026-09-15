"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Player = { user_id: string; player_name: string; player_index: number; color: string };
type Room = { id: string; join_code: string; status: string; created_by: string };

const terrain = [
  ["Gebirge", "mountain", "▲", 10], ["Weide", "meadow", "⌁", 2], ["Wald", "forest", "♣", 9],
  ["Feld", "field", "✦", 12], ["Lehm", "clay", "◆", 6], ["Weide", "meadow", "⌁", 4], ["Lehm", "clay", "◆", 10],
  ["Wald", "forest", "♣", 9], ["Gebirge", "mountain", "▲", 11], ["Wüste", "desert", "●", 0], ["Wald", "forest", "♣", 3], ["Feld", "field", "✦", 8],
  ["Wald", "forest", "♣", 8], ["Feld", "field", "✦", 3], ["Weide", "meadow", "⌁", 4], ["Gebirge", "mountain", "▲", 5],
  ["Feld", "field", "✦", 5], ["Weide", "meadow", "⌁", 6], ["Lehm", "clay", "◆", 11],
] as const;

const rows = [3, 4, 5, 4, 3];
const colors = ["#287c91", "#db7558", "#d5a137", "#6f8652"];

function FullBoard() {
  let tileIndex = 0;
  return (
    <div className="full-board" aria-label="Spielfeld mit 19 Landschaftsfeldern">
      {rows.map((count, row) => (
        <div className="hex-row" key={row}>
          {Array.from({ length: count }).map(() => {
            const [name, className, icon, number] = terrain[tileIndex++];
            return (
              <button className={`full-hex ${className}`} key={`${name}-${tileIndex}`} title={name}>
                <span>{icon}</span>
                {number > 0 && <b className={number === 6 || number === 8 ? "hot-number" : ""}>{number}</b>}
              </button>
            );
          })}
        </div>
      ))}
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
      const result = data[0];
      const { data: game } = await supabase.from("games").select("*").eq("id", result.game_id).single();
      setRoom(game as Room);
      window.history.replaceState({}, "", `?room=${code.toUpperCase()}`);
    }
    setBusy(false);
  }

  async function startGame() {
    if (!supabase || !room || players.length < 2) return;
    await supabase.from("games").update({ status: "playing", version: 2 }).eq("id", room.id);
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
          <FullBoard />
          {room.status === "waiting" ? (
            <div className="waiting-card">
              <strong>{players.length < 2 ? "Warte auf Mitspieler" : "Bereit zum Start"}</strong>
              <span>Teile den Code {room.join_code} oder den Einladungslink.</span>
              {isHost && <button onClick={startGame} disabled={players.length < 2}>Spiel starten</button>}
            </div>
          ) : (
            <div className="waiting-card playing"><strong>Spielraum synchronisiert</strong><span>Die vollständige Zug-Engine folgt in Version 5.</span></div>
          )}
        </section>
      </section>
    </main>
  );
}

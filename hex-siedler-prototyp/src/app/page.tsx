"use client";

import { useState } from "react";

type Resource = "wood" | "brick" | "wool" | "grain" | "ore";
type ResourceStock = Record<Resource, number>;

const tiles = [
  { type: "Wald", icon: "♣", value: 5, className: "forest", resource: "wood" },
  { type: "Lehm", icon: "◆", value: 2, className: "clay", resource: "brick" },
  { type: "Feld", icon: "✦", value: 6, className: "field", resource: "grain" },
  { type: "Weide", icon: "⌁", value: 3, className: "meadow", resource: "wool" },
  { type: "Gebirge", icon: "▲", value: 8, className: "mountain", resource: "ore" },
  { type: "Wald", icon: "♣", value: 10, className: "forest", resource: "wood" },
  { type: "Feld", icon: "✦", value: 9, className: "field", resource: "grain" },
];

const players = [
  { name: "Timo", initial: "T", color: "blue", numbers: [3, 8] as number[] },
  { name: "Klara", initial: "K", color: "coral", numbers: [6, 10] as number[] },
] as const;

const initialResources: ResourceStock[] = [
  { wood: 2, brick: 1, wool: 2, grain: 0, ore: 1 },
  { wood: 1, brick: 2, wool: 0, grain: 2, ore: 1 },
];

export default function Home() {
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [round, setRound] = useState(1);
  const [activePlayer, setActivePlayer] = useState(0);
  const [hasRolled, setHasRolled] = useState(false);
  const [resources, setResources] = useState(initialResources);
  const [message, setMessage] = useState("Würfle, um Rohstoffe zu verteilen.");
  const total = dice[0] + dice[1];

  function rollDice() {
    const nextDice: [number, number] = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
    ];
    const nextTotal = nextDice[0] + nextDice[1];
    setDice(nextDice);
    setHasRolled(true);

    const matchingTile = tiles.find((tile) => tile.value === nextTotal);
    if (!matchingTile) {
      setMessage(`Bei ${nextTotal} erhält niemand einen Rohstoff.`);
      return;
    }

    const winners = players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.numbers.includes(nextTotal));

    if (winners.length === 0) {
      setMessage(`Die ${nextTotal} wurde gewürfelt, aber dort steht noch keine Siedlung.`);
      return;
    }

    setResources((current) => current.map((stock, index) => {
      if (!winners.some((winner) => winner.index === index)) return stock;
      return { ...stock, [matchingTile.resource]: stock[matchingTile.resource as Resource] + 1 };
    }));
    setMessage(`${winners.map(({ player }) => player.name).join(" und ")} erhält ${matchingTile.type}.`);
  }

  function endTurn() {
    const nextPlayer = activePlayer === 0 ? 1 : 0;
    if (nextPlayer === 0) setRound((current) => current + 1);
    setActivePlayer(nextPlayer);
    setHasRolled(false);
    setMessage(`${players[nextPlayer].name} ist jetzt am Zug.`);
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Hexlande Startseite">
          <span className="brand-mark">⬡</span>
          <span>HEXLANDE</span>
        </a>
        <div className="turn-label">Runde {round} · {players[activePlayer].name} ist am Zug</div>
        <button className="icon-button" aria-label="Einstellungen">⚙</button>
      </header>

      <section className="game-grid">
        <aside className="player-panel card">
          <p className="eyebrow">Spieler</p>
          {players.map((player, index) => (
            <div className={`player ${activePlayer === index ? "active-player" : ""}`} key={player.name}>
              <span className={`avatar avatar-${player.color}`}>{player.initial}</span>
              <span><strong>{player.name}</strong><small>{activePlayer === index ? "Ist am Zug" : "Wartet"}</small></span>
              <b>2 VP</b>
            </div>
          ))}
          <div className="objective">
            <span>Dein Ziel</span>
            <strong>10 Siegpunkte</strong>
            <div className="progress"><i /></div>
          </div>
        </aside>

        <section className="board-wrap" aria-label="Spielfeld">
          <div className="sea-ring">
            <div className="hex-board">
              {tiles.map((tile, index) => (
                <button className={`hex-tile hex-${index + 1} ${tile.className}`} key={`${tile.type}-${index}`} title={tile.type}>
                  <span className="tile-icon">{tile.icon}</span>
                  <span className="number-token">{tile.value}</span>
                </button>
              ))}
              <span className="settlement settlement-one">◆</span>
              <span className="settlement settlement-two">◆</span>
              <span className="road road-one" />
              <span className="road road-two" />
            </div>
          </div>
          <p className="board-hint">Wähle später Ecken und Wege direkt auf dem Spielfeld.</p>
        </section>

        <aside className="action-panel card">
          <p className="eyebrow">{players[activePlayer].name}s Zug</p>
          <div className="dice-row" aria-live="polite">
            <span className="die">{dice[0]}</span>
            <span className="die">{dice[1]}</span>
            <strong>= {total}</strong>
          </div>
          {!hasRolled ? (
            <button className="primary-button" onClick={rollDice}>Würfeln</button>
          ) : (
            <button className="primary-button end-turn" onClick={endTurn}>Zug beenden</button>
          )}
          <p className="roll-message" aria-live="polite">{message}</p>
          <div className="divider"><span>danach</span></div>
          <button className="secondary-button" disabled>Straße bauen</button>
          <button className="secondary-button" disabled>Siedlung bauen</button>
          <p className="helper">Bauaktionen schalten wir im nächsten Schritt frei.</p>
        </aside>
      </section>

      <section className="resources card" aria-label="Deine Rohstoffe">
        <div><span className="resource-icon wood">♣</span><small>Holz</small><strong>{resources[activePlayer].wood}</strong></div>
        <div><span className="resource-icon brick">◆</span><small>Lehm</small><strong>{resources[activePlayer].brick}</strong></div>
        <div><span className="resource-icon wool">⌁</span><small>Wolle</small><strong>{resources[activePlayer].wool}</strong></div>
        <div><span className="resource-icon grain">✦</span><small>Getreide</small><strong>{resources[activePlayer].grain}</strong></div>
        <div><span className="resource-icon ore">▲</span><small>Erz</small><strong>{resources[activePlayer].ore}</strong></div>
      </section>
    </main>
  );
}

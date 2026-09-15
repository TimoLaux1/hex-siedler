"use client";

import { useState } from "react";

const tiles = [
  { type: "Wald", icon: "♣", value: 5, className: "forest" },
  { type: "Lehm", icon: "◆", value: 2, className: "clay" },
  { type: "Feld", icon: "✦", value: 6, className: "field" },
  { type: "Weide", icon: "⌁", value: 3, className: "meadow" },
  { type: "Gebirge", icon: "▲", value: 8, className: "mountain" },
  { type: "Wald", icon: "♣", value: 10, className: "forest" },
  { type: "Feld", icon: "✦", value: 9, className: "field" },
];

export default function Home() {
  const [dice, setDice] = useState<[number, number]>([3, 4]);
  const [turn, setTurn] = useState(1);
  const total = dice[0] + dice[1];

  function rollDice() {
    setDice([
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
    ]);
    setTurn((current) => current + 1);
  }

  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Hexlande Startseite">
          <span className="brand-mark">⬡</span>
          <span>HEXLANDE</span>
        </a>
        <div className="turn-label">Runde {turn} · Timo ist am Zug</div>
        <button className="icon-button" aria-label="Einstellungen">⚙</button>
      </header>

      <section className="game-grid">
        <aside className="player-panel card">
          <p className="eyebrow">Spieler</p>
          <div className="player active-player">
            <span className="avatar avatar-blue">T</span>
            <span><strong>Timo</strong><small>Du bist am Zug</small></span>
            <b>2 VP</b>
          </div>
          <div className="player">
            <span className="avatar avatar-coral">K</span>
            <span><strong>Klara</strong><small>Wartet</small></span>
            <b>2 VP</b>
          </div>
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
          <p className="eyebrow">Dein Zug</p>
          <div className="dice-row" aria-live="polite">
            <span className="die">{dice[0]}</span>
            <span className="die">{dice[1]}</span>
            <strong>= {total}</strong>
          </div>
          <button className="primary-button" onClick={rollDice}>Würfeln</button>
          <div className="divider"><span>danach</span></div>
          <button className="secondary-button" disabled>Straße bauen</button>
          <button className="secondary-button" disabled>Siedlung bauen</button>
          <p className="helper">Bauaktionen schalten wir im nächsten Schritt frei.</p>
        </aside>
      </section>

      <section className="resources card" aria-label="Deine Rohstoffe">
        <div><span className="resource-icon wood">♣</span><small>Holz</small><strong>2</strong></div>
        <div><span className="resource-icon brick">◆</span><small>Lehm</small><strong>1</strong></div>
        <div><span className="resource-icon wool">⌁</span><small>Wolle</small><strong>2</strong></div>
        <div><span className="resource-icon grain">✦</span><small>Getreide</small><strong>0</strong></div>
        <div><span className="resource-icon ore">▲</span><small>Erz</small><strong>1</strong></div>
      </section>
    </main>
  );
}

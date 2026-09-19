"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Resources = { wood: number; brick: number; wool: number; grain: number; ore: number };
type ResourceKind = keyof Resources;
type Player = { user_id: string; player_name: string; player_index: number; color: string; resources?: Resources; victory_points?: number; knight_points?: number; last_bank_trade_round?: number };
type Settlement = { vertex: number; player: number; building?: "settlement" | "city" | "goldmine" };
type Road = { edge: number; a: number; b: number; player: number };
type FishTile = { slot: number; number: number };
type BoardTile = { name: string; className: string; symbol: string; number: number; resource: ResourceKind | "none" };
type TradeOffer = { from: number; to: number; give: ResourceKind; want: ResourceKind };
type DiscardEntry = { player: number; remaining: number };
type HighScore = { rank: number; display_name: string; wins: number };
type KlausKind = "disappointed" | "angry" | "proud" | "stupid" | "sneaky" | "desert" | "rich";
type KlausCard = { id: string; card_type: KlausKind; must_play: boolean; bought_round?: number; created_at?: string };
type CardEvent = { card_id: string; card_type: KlausKind; player: number; resolve_at: string };
type ActivityKind = "info" | "turn" | "dice" | "build" | "trade" | "klaus" | "win";
type GameActivity = { message: string; kind: ActivityKind; created_at: string };
type GameState = { round?: number; phase?: string; setup_step?: number; setup_order?: number[]; active_player?: number; winner_player?: number; robber_tile?: number; robber_roller?: number; goldmine_unlocked?: boolean; goldmine_queue?: number[]; discard_queue?: DiscardEntry[]; discard_deadline?: string; player_time_remaining?: Record<string, number>; player_timer_started_at?: string; player_timer_active?: number; eliminated_players?: number[]; turn_deadline?: string; timer_player?: number; timer_paused_at?: string; timer_pause_reason?: string; trade_offer?: TradeOffer; dice_stats?: Record<string, number>; longest_road_holder?: number; longest_road_length?: number; largest_army_holder?: number; largest_army_size?: number; card_event?: CardEvent; settlements?: Settlement[]; roads?: Road[]; dice?: number[] };
type Room = { id: string; join_code: string; status: string; created_by: string; state?: GameState; fish_tiles?: FishTile[]; board_tiles?: BoardTile[]; victory_target?: number; version?: number };
type BuildMode = "road" | "settlement" | "city" | "goldmine" | null;
type KlausMapMode = "robber" | "destroy_road" | "sneaky" | "desert" | null;
type CarriageRoute = { vertices: number[]; player: number; run: number };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Language = "de" | "en";

const englishUi: Record<string, string> = {
  "New Katan wird geladen …": "Loading New Katan…",
  "Willkommen bei New Katan.": "Welcome to New Katan.",
  "Code eingeben": "Enter code",
  "Klaus prüft die Gästeliste": "Klaus checks the guest list",
  "Melde dich mit deiner E-Mail-Adresse an. Dein Spielername wird automatisch daraus gebildet.": "Sign in with your email address. Your player name will be created automatically.",
  "Verifizierungscode": "Verification code", "Prüfe …": "Checking…", "Einloggen": "Sign in",
  "Andere E-Mail-Adresse": "Use another email address", "E-Mail-Adresse": "Email address", "E-Mail-Adresse eingeben": "Enter email address", "Sende …": "Sending…", "Code senden": "Send code",
  "Katan ohne Klaus.": "Katan without Klaus.", "Teubi muss draußen bleiben.": "Teubi has to stay outside.", "Eingeloggt als": "Signed in as", "Abmelden": "Sign out",
  "+ Fisch": "+ Fish", "Zufälliger Rohstoff beim Würfeln": "Random resource when rolling", "Siegpunkte": "Victory points", "Ziel für den Spielsieg": "Victory target",
  "Neues Spiel erstellen": "Create new game", "oder beitreten": "or join", "SPIELCODE": "GAME CODE", "Beitreten": "Join",
  "Deine Siege werden dauerhaft deinem Spielerprofil gutgeschrieben.": "Your wins are permanently saved to your player profile.",
  "Highscore Board": "Leaderboard", "Siege aller Spieler": "Wins by all players", "Noch keine Siege eingetragen.": "No wins recorded yet.",
  "Deine Rohstoffe": "Your resources", "Spieler": "Players", "Zug beenden": "End turn", "Zuschauer": "Spectator", "Längste Handelsstraße": "Longest trade route",
  "Warte auf Spieler …": "Waiting for player…", "Deine Klaus-Karten": "Your Klaus cards", "Noch keine Handkarten.": "No cards yet.",
  "Muss sofort gespielt werden": "Must be played immediately", "Karte spielen": "Play card", "Ab deinem nächsten Zug spielbar": "Playable from your next turn",
  "Warte auf Mitspieler": "Waiting for players", "Bereit zum Start": "Ready to start", "Kopiert ✓": "Copied ✓", "Link kopieren": "Copy link",
  "Link kopiert ✓": "Link copied ✓", "Einladungslink kopieren": "Copy invitation link", "Spiel starten": "Start game", "Spiel verlassen": "Leave game",
  "Siedlung wählen": "Choose settlement", "Angrenzende Straße wählen": "Choose adjacent road", "Du bist am Zug – wähle direkt auf dem Spielfeld.": "It is your turn — choose directly on the board.",
  "Du bist am Zug": "It is your turn", "Zeit abgelaufen, Klaus dankt. Ciao": "Time is up. Klaus thanks you. Goodbye.", "Der aktive Spieler würfelt einmal.": "The active player rolls once.",
  "Handelsangebot": "Trade offer", "Annehmen": "Accept", "Ablehnen": "Decline", "Angebot zurückziehen": "Withdraw offer", "Würfeln": "Roll dice",
  "Welcher Mitspieler verliert einen Siegpunkt?": "Which player loses one victory point?", "Welchen Rohstoff soll Klaus einsammeln?": "Which resource should Klaus collect?",
  "Wähle auf dem Spielfeld das neue Ritterfeld.": "Choose the knight's new tile on the board.", "Von welchem betroffenen Spieler soll ein zufälliger Rohstoff gezogen werden?": "Which affected player should lose a random resource?",
  "Von welchem betroffenen Spieler möchtest du einen zufälligen Rohstoff ziehen?": "Which affected player do you want to take a random resource from?", "An diesem Feld ist kein Mitspieler betroffen.": "No other player is affected by this tile.",
  "Ritter hier setzen": "Place knight here", "Anderes Feld": "Different tile", "Wähle auf dem Spielfeld eine deiner Straßen zum Zerstören.": "Choose one of your roads to destroy on the board.",
  "Wähle einen freien, direkt an dein Straßennetz angeschlossenen Knoten. Die normalen Baukosten werden abgezogen.": "Choose a free intersection directly connected to your road network. The normal building cost applies.",
  "Abbrechen": "Cancel", "Rohstoffe wurden verteilt. Du kannst mehrere Aktionen ausführen.": "Resources have been distributed. You may perform several actions.",
  "Straße": "Road", "Siedlung": "Settlement", "Stadt": "City", "Goldmine": "Gold mine", "Klaus rufen": "Call Klaus", "Handeln": "Trade",
  "Holz": "Wood", "Lehm": "Brick", "Wolle": "Wool", "Getreide": "Grain", "Erz": "Ore", "oder Spieler": "or player", "Vorrat": "Supply", "Spieler 1:1": "Player 1:1",
  "Mit wem möchtest du handeln?": "Who do you want to trade with?", "1 Rohstoff anbieten": "Offer 1 resource", "Gewünschten Rohstoff wählen": "Choose requested resource",
  "Diese Runde bereits getauscht": "Already traded this round", "Angebot senden": "Send offer", "Würfelstatistik": "Dice statistics", "Würfe": "rolls",
  "Räuber hierhin setzen": "Place robber here", "Karten wegen der 7 abgeben": "Discard cards because of the 7", "Warte, bis alle betroffenen Spieler ihre Karten abgegeben haben.": "Wait until all affected players have discarded their cards.",
  "Goldmine fördert": "Gold mine produces", "Die 7 aktiviert deine Goldmine. Wähle einen beliebigen Rohstoff.": "The 7 activates your gold mine. Choose any resource.",
  "Goldmine für alle freigeschaltet": "Gold mine unlocked for everyone", "Alle Spieler können sie ab jetzt – unabhängig von ihren eigenen Siegpunkten – aus einer Siedlung an der Wüste entwickeln. Bei einer 7 fördert sie einen frei wählbaren Rohstoff.": "All players can now upgrade a settlement next to the desert into a gold mine, regardless of their own victory points. When a 7 is rolled, it produces a resource of their choice.",
  "Kosten": "Cost", "Verstanden": "Got it", "Fischgrund": "Fishing ground", "Gebirge": "Mountains", "Weide": "Pasture", "Feld": "Fields", "Wald": "Forest", "Wüste": "Desert",
  "Enttäuschter Klaus": "Disappointed Klaus", "Ein Mitspieler verliert 1 Siegpunkt.": "Another player loses 1 victory point.", "Böser Klaus": "Angry Klaus", "Versetzt den Ritter und stiehlt einen zufälligen Rohstoff.": "Moves the knight and steals a random resource.",
  "Stolzer Klaus": "Proud Klaus", "Nimmt einen gewählten Rohstoff von allen Mitspielern.": "Takes one chosen resource from every other player.", "Blöder Klaus": "Silly Klaus", "Zerstört sofort eine eigene Straße.": "Immediately destroys one of your own roads.",
  "Sneaky Klaus": "Sneaky Klaus", "Erlaubt eine Siedlung mit nur einer Straße Abstand.": "Allows a settlement only one road away.",
  "Wüster Klaus": "Desert Klaus", "Verwandelt ein unbebautes Rohstofffeld dauerhaft in eine Wüste.": "Permanently turns an undeveloped resource tile into desert.",
  "Reicher Klaus": "Rich Klaus", "Erhöht deinen Vorrat dauerhaft um 2 Straßen und 1 Siedlung.": "Permanently increases your supply by 2 roads and 1 settlement.",
  "Wähle ein Rohstofffeld, an dem noch niemand gebaut hat.": "Choose a resource tile where nobody has built yet.",
  "Vorrat dauerhaft erweitern": "Permanently expand supply",
  "Musik ausschalten": "Turn music off", "Musik einschalten": "Turn music on", "Ton ausschalten": "Turn sound off", "Ton einschalten": "Turn sound on",
  "New Katan installieren": "Install New Katan", "Tippe in Safari unten auf": "In Safari, tap", "Teilen": "Share", "und danach auf": "and then", "„Zum Home-Bildschirm“": "‘Add to Home Screen’",
  "Zum Homebildschirm hinzufügen?": "Add to Home Screen?", "Starte New Katan künftig direkt wie eine App.": "Launch New Katan directly like an app.", "Lege New Katan für den schnellen Zugriff auf deinem Homebildschirm ab.": "Add New Katan to your Home Screen for quick access.", "Hinzufügen": "Add", "Vollbild": "Fullscreen"
};

function translateUiText(raw: string) {
  const core = raw.trim();
  if (!core) return raw;
  let translated = englishUi[core];
  if (!translated) {
    const rules: Array<[RegExp, (...parts: string[]) => string]> = [
      [/^Runde (\d+)$/, (_, n) => `Round ${n}`],
      [/^(.*) ist am Zug\.$/, (_, name) => `${name} is taking their turn.`],
      [/^(.*) beginnt die Aufbauphase\.$/, (_, name) => `${name} begins the setup phase.`],
      [/^(.*) würfelt(?: eine)? (\d+)\.$/, (_, name, n) => `${name} rolls a ${n}.`],
      [/^(.*) baut eine Straße\.$/, (_, name) => `${name} builds a road.`],
      [/^(.*) baut eine Siedlung\.$/, (_, name) => `${name} builds a settlement.`],
      [/^(.*) baut eine Stadt\.$/, (_, name) => `${name} builds a city.`],
      [/^(.*) baut eine Goldmine\.$/, (_, name) => `${name} builds a gold mine.`],
      [/^(.*) ruft Klaus\.$/, (_, name) => `${name} calls Klaus.`],
      [/^(.*) versetzt den Ritter\.$/, (_, name) => `${name} moves the knight.`],
      [/^(.*) beendet den Zug\.$/, (_, name) => `${name} ends their turn.`],
      [/^(.*) wählt einen Goldminen-Rohstoff\.$/, (_, name) => `${name} chooses a gold-mine resource.`],
      [/^(.*) handelt mit dem Vorrat\.$/, (_, name) => `${name} trades with the supply.`],
      [/^(.*) bietet einen Handel an\.$/, (_, name) => `${name} makes a trade offer.`],
      [/^(.*) nimmt den Handel an\.$/, (_, name) => `${name} accepts the trade.`],
      [/^(.*) lehnt den Handel ab\.$/, (_, name) => `${name} declines the trade.`],
      [/^(.*) gibt einen Rohstoff ab\.$/, (_, name) => `${name} discards a resource.`],
      [/^(.*) spielt „(.+)“\.$/, (_, name, card) => `${name} plays “${englishUi[card] ?? card}”.`],
      [/^(.*) gewinnt das Spiel!$/, (_, name) => `${name} wins the game!`],
      [/^(.*) übernimmt die Größte Rittermacht!$/, (_, name) => `${name} claims the Largest Army!`],
      [/^Teile den Code (.+) oder den Einladungslink · Ziel: (\d+) Siegpunkte\.$/, (_, code, points) => `Share code ${code} or the invitation link · Target: ${points} victory points.`],
      [/^Das Ziel von (\d+) Siegpunkten wurde erreicht\.$/, (_, points) => `The target of ${points} victory points has been reached.`],
      [/^Noch (\d+) Rohstoffe?$/, (_, n) => `${n} resources remaining?`],
      [/^(\d+) Würfe$/, (_, n) => `${n} rolls`],
      [/^Spieler · (\d+)\/4 · Ziel: (\d+) SP$/, (_, count, points) => `Players · ${count}/4 · Target: ${points} VP`],
      [/^Noch (\d+) Sekunden – danach wird zufällig abgegeben\.$/, (_, n) => `${n} seconds left — then cards will be discarded at random.`],
    ];
    for (const [pattern, replace] of rules) {
      const match = core.match(pattern);
      if (match) { translated = replace(...match); break; }
    }
  }
  if (!translated) return raw;
  return raw.replace(core, translated);
}

function LanguageSwitcher({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return <div className="language-switcher" aria-label="Language"><button className={language === "de" ? "active" : ""} onClick={() => onChange("de")} type="button">DE</button><button className={language === "en" ? "active" : ""} onClick={() => onChange("en")} type="button">EN</button></div>;
}

const klausCards: Record<KlausKind, { title: string; face: string; description: string; tone: string }> = {
  disappointed: { title: "Enttäuschter Klaus", face: "😞", description: "Ein Mitspieler verliert 1 Siegpunkt.", tone: "blue" },
  angry: { title: "Böser Klaus", face: "😠", description: "Versetzt den Ritter und stiehlt einen zufälligen Rohstoff.", tone: "red" },
  proud: { title: "Stolzer Klaus", face: "😌", description: "Nimmt einen gewählten Rohstoff von allen Mitspielern.", tone: "gold" },
  stupid: { title: "Blöder Klaus", face: "🤪", description: "Zerstört sofort eine eigene Straße.", tone: "violet" },
  sneaky: { title: "Sneaky Klaus", face: "🥸", description: "Erlaubt eine Siedlung mit nur einer Straße Abstand.", tone: "green" },
  desert: { title: "Wüster Klaus", face: "🏜️", description: "Verwandelt ein unbebautes Rohstofffeld dauerhaft in eine Wüste.", tone: "sand" },
  rich: { title: "Reicher Klaus", face: "🤑", description: "Erhöht deinen Vorrat dauerhaft um 2 Straßen und 1 Siedlung.", tone: "emerald" },
};

const terrainCatalog: Omit<BoardTile, "number">[] = [
  ...Array.from({ length: 3 }, () => ({ name: "Gebirge", className: "mountain", symbol: "▲", resource: "ore" as const })),
  ...Array.from({ length: 4 }, () => ({ name: "Weide", className: "meadow", symbol: "⌁", resource: "wool" as const })),
  ...Array.from({ length: 4 }, () => ({ name: "Wald", className: "forest", symbol: "♣", resource: "wood" as const })),
  ...Array.from({ length: 4 }, () => ({ name: "Feld", className: "field", symbol: "✦", resource: "grain" as const })),
  ...Array.from({ length: 3 }, () => ({ name: "Lehm", className: "clay", symbol: "◆", resource: "brick" as const })),
];
const numberTokens = [10, 2, 9, 12, 6, 4, 10, 9, 11, 3, 8, 8, 3, 4, 5, 5, 6, 11];
const adjacentTilePairs = [
  [0,1],[0,3],[0,4],[1,2],[1,4],[1,5],[2,5],[2,6],[3,4],[3,7],[3,8],
  [4,5],[4,8],[4,9],[5,6],[5,9],[5,10],[6,10],[6,11],[7,8],[7,12],
  [8,9],[8,12],[8,13],[9,10],[9,13],[9,14],[10,11],[10,14],[10,15],
  [11,15],[12,13],[12,16],[13,14],[13,16],[13,17],[14,15],[14,17],
  [14,18],[15,18],[16,17],[17,18],
] as const;

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function displayNameFromEmail(email: string) {
  const parts = email.split("@")[0].toLowerCase().split(/[._-]+/).map((part) => part.replace(/[^a-zäöüß]/gi, "")).filter(Boolean);
  const firstName = parts[0] ? parts[0][0].toUpperCase() + parts[0].slice(1) : "Spieler";
  return parts[1] ? `${firstName} ${parts[1][0].toUpperCase()}.` : firstName;
}

function createRandomBoard(): BoardTile[] {
  const landscapes = shuffled(terrainCatalog);
  let numbersByTile: number[];
  do {
    const shuffledNumbers = shuffled(numberTokens);
    let numberCursor = 0;
    numbersByTile = Array.from({ length: 19 }, (_, index) => index === 9 ? 0 : shuffledNumbers[numberCursor++]);
  } while (adjacentTilePairs.some(([first, second]) =>
    (numbersByTile[first] === 6 || numbersByTile[first] === 8)
      && (numbersByTile[second] === 6 || numbersByTile[second] === 8)
  ));
  let cursor = 0;
  return Array.from({ length: 19 }, (_, index) => {
    if (index === 9) return { name: "Wüste", className: "desert", symbol: "●", number: 0, resource: "none" };
    const tile = landscapes[cursor];
    const result = { ...tile, number: numbersByTile[index] };
    cursor += 1;
    return result;
  });
}

const terrain: BoardTile[] = [
  { name: "Gebirge", className: "mountain", symbol: "▲", number: 10, resource: "ore" },
  { name: "Weide", className: "meadow", symbol: "⌁", number: 2, resource: "wool" },
  { name: "Wald", className: "forest", symbol: "♣", number: 9, resource: "wood" },
  { name: "Feld", className: "field", symbol: "✦", number: 12, resource: "grain" },
  { name: "Lehm", className: "clay", symbol: "◆", number: 6, resource: "brick" },
  { name: "Weide", className: "meadow", symbol: "⌁", number: 4, resource: "wool" },
  { name: "Lehm", className: "clay", symbol: "◆", number: 10, resource: "brick" },
  { name: "Wald", className: "forest", symbol: "♣", number: 9, resource: "wood" },
  { name: "Gebirge", className: "mountain", symbol: "▲", number: 11, resource: "ore" },
  { name: "Wüste", className: "desert", symbol: "●", number: 0, resource: "none" },
  { name: "Wald", className: "forest", symbol: "♣", number: 3, resource: "wood" },
  { name: "Feld", className: "field", symbol: "✦", number: 8, resource: "grain" },
  { name: "Wald", className: "forest", symbol: "♣", number: 8, resource: "wood" },
  { name: "Feld", className: "field", symbol: "✦", number: 3, resource: "grain" },
  { name: "Weide", className: "meadow", symbol: "⌁", number: 4, resource: "wool" },
  { name: "Gebirge", className: "mountain", symbol: "▲", number: 5, resource: "ore" },
  { name: "Feld", className: "field", symbol: "✦", number: 5, resource: "grain" },
  { name: "Weide", className: "meadow", symbol: "⌁", number: 6, resource: "wool" },
  { name: "Lehm", className: "clay", symbol: "◆", number: 11, resource: "brick" },
];

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
const harbors = [
  { id: 0, x: 166.44, y: 28, vertices: [5, 0] },
  { id: 1, x: 443.56, y: 28, vertices: [10, 11] },
  { id: 2, x: 28, y: 272, vertices: [27, 28] },
  { id: 3, x: 582, y: 272, vertices: [35, 36] },
  { id: 4, x: 166.44, y: 516, vertices: [48, 49] },
  { id: 5, x: 443.56, y: 516, vertices: [52, 53] },
];

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

function calculateLongestRoad(playerIndex: number, roads: Road[], settlements: Settlement[]) {
  const playerRoads = roads.filter((road) => road.player === playerIndex);
  if (playerRoads.length === 0) return 0;
  const blockedVertices = new Set(settlements.filter((building) => building.player !== playerIndex).map((building) => building.vertex));
  const connected = new Map<number, Road[]>();
  playerRoads.forEach((road) => {
    connected.set(road.a, [...(connected.get(road.a) ?? []), road]);
    connected.set(road.b, [...(connected.get(road.b) ?? []), road]);
  });
  const walk = (vertex: number, usedEdges: Set<number>, started: boolean): number => {
    if (started && blockedVertices.has(vertex)) return 0;
    let best = 0;
    for (const road of connected.get(vertex) ?? []) {
      if (usedEdges.has(road.edge)) continue;
      const nextUsed = new Set(usedEdges);
      nextUsed.add(road.edge);
      const nextVertex = road.a === vertex ? road.b : road.a;
      best = Math.max(best, 1 + walk(nextVertex, nextUsed, true));
    }
    return best;
  };
  return Math.max(...Array.from(connected.keys(), (vertex) => walk(vertex, new Set<number>(), false)));
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

const resourceCards: { key: ResourceKind; label: string }[] = [
  { key: "wood", label: "Holz" },
  { key: "brick", label: "Lehm" },
  { key: "wool", label: "Wolle" },
  { key: "grain", label: "Getreide" },
  { key: "ore", label: "Erz" },
];

const backgroundTracks = [
  "/audio/greensleeves-acoustic.mp3",
  "/audio/greensleeves-celtic.mp3",
  "/audio/greensleeves-pan-flute.mp3",
  "/audio/greensleeves-fantasia.mp3",
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

function KlausCardView({ kind, compact = false }: { kind: KlausKind; compact?: boolean }) {
  const card = klausCards[kind];
  return <div className={`klaus-card klaus-${card.tone} ${compact ? "compact" : ""}`}>
    <div className="klaus-card-pattern" aria-hidden="true">⬡ ◇ ⬡ ◇</div>
    <span className="klaus-face" aria-hidden="true">{card.face}</span>
    <strong>{card.title}</strong>
    <p>{card.description}</p>
    <small>NEW KATAN · KLAUS-KARTE</small>
  </div>;
}

function FullBoard({ room, fishTiles, previewTiles, myIndex, buildMode, klausMode, robberPreviewTile, isActiveTurn, onVertex, onEdge, onKlausVertex, onKlausEdge, onKlausTile }: { room?: Room | null; fishTiles?: FishTile[]; previewTiles?: BoardTile[]; myIndex?: number; buildMode?: BuildMode; klausMode?: KlausMapMode; robberPreviewTile?: number | null; isActiveTurn?: boolean; onVertex?: (vertex: Vertex) => void; onEdge?: (edge: Edge) => void; onKlausVertex?: (vertex: Vertex) => void; onKlausEdge?: (edge: Edge) => void; onKlausTile?: (tile: number) => void }) {
  const state = room?.state;
  const visibleFish = fishTiles ?? room?.fish_tiles ?? [];
  const visibleTerrain = room?.board_tiles ?? previewTiles ?? terrain;
  const settlements = state?.settlements ?? [];
  const roads = state?.roads ?? [];
  const [carriageRoute, setCarriageRoute] = useState<CarriageRoute | null>(null);
  const carriageCandidates = useMemo(() => {
    const cities = settlements.filter((building) => building.building === "city");
    const candidates: Array<{ vertices: number[]; player: number }> = [];
    for (const player of new Set(cities.map((city) => city.player))) {
      const playerCities = cities.filter((city) => city.player === player);
      const playerRoads = roads.filter((road) => road.player === player);
      const blocked = new Set(settlements.filter((building) => building.player !== player).map((building) => building.vertex));
      const network = new Map<number, number[]>();
      playerRoads.forEach((road) => {
        network.set(road.a, [...(network.get(road.a) ?? []), road.b]);
        network.set(road.b, [...(network.get(road.b) ?? []), road.a]);
      });
      for (let first = 0; first < playerCities.length; first += 1) {
        for (let second = first + 1; second < playerCities.length; second += 1) {
          const start = playerCities[first].vertex;
          const destination = playerCities[second].vertex;
          const queue: number[][] = [[start]];
          const visited = new Set([start]);
          let route: number[] | null = null;
          while (queue.length && !route) {
            const path = queue.shift()!;
            const current = path[path.length - 1];
            for (const next of network.get(current) ?? []) {
              if (visited.has(next) || (blocked.has(next) && next !== destination)) continue;
              const nextPath = [...path, next];
              if (next === destination) { route = nextPath; break; }
              visited.add(next);
              queue.push(nextPath);
            }
          }
          if (route && route.length - 1 >= 4) candidates.push({ vertices: route, player });
        }
      }
    }
    return candidates;
  }, [roads, settlements]);

  useEffect(() => {
    if (!room || room.status !== "playing" || carriageCandidates.length === 0) {
      setCarriageRoute(null);
      return;
    }
    let stopped = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (first = false) => {
      const delay = first ? 9000 + Math.random() * 8000 : 30000 + Math.random() * 45000;
      showTimer = setTimeout(() => {
        if (stopped) return;
        const candidate = carriageCandidates[Math.floor(Math.random() * carriageCandidates.length)];
        const direction = Math.random() < .5 ? candidate.vertices : [...candidate.vertices].reverse();
        setCarriageRoute({ vertices: direction, player: candidate.player, run: Date.now() });
        hideTimer = setTimeout(() => {
          if (stopped) return;
          setCarriageRoute(null);
          schedule();
        }, 22000);
      }, delay);
    };
    schedule(true);
    return () => { stopped = true; if (showTimer) clearTimeout(showTimer); if (hideTimer) clearTimeout(hideTimer); };
  }, [room?.id, room?.status, carriageCandidates]);
  const step = state?.setup_step ?? 0;
  const currentPlayer = state?.setup_order?.[step];
  const mySetupTurn = myIndex !== undefined && currentPlayer === myIndex;
  const regularBuildTurn = Boolean(isActiveTurn && state?.phase === "build");
  const blockedVertices = new Set(settlements.flatMap((item) => [item.vertex, ...(topology.vertices[item.vertex]?.neighbors ?? [])]));
  const latestOwnSettlement = [...settlements].reverse().find((item) => item.player === myIndex)?.vertex;
  const ownBuildingVertices = new Set(settlements.filter((item) => item.player === myIndex).map((item) => item.vertex));
  const opponentBuildingVertices = new Set(settlements.filter((item) => item.player !== myIndex).map((item) => item.vertex));
  const ownRoadVertices = new Set(roads.filter((item) => item.player === myIndex).flatMap((item) => [item.a, item.b]));
  // Das Brett wird pro Spiel neu gemischt. Darum darf die Wüste niemals über
  // eine feste Feldnummer ermittelt werden.
  const desertVertices = new Set(
    visibleTerrain.flatMap((tile, tileIndex) => {
      const isDesert = tile.className === "desert" || tile.name?.toLocaleLowerCase("de-DE") === "wüste";
      return isDesert ? (topology.tileVertices[tileIndex] ?? []) : [];
    }),
  );
  const rolledNumber = state?.dice?.length === 2 ? state.dice[0] + state.dice[1] : null;
  const rollCount = Object.values(state?.dice_stats ?? {}).reduce((total, count) => total + count, 0);
  const tileProduces = (tile: number) => tile !== state?.robber_tile && settlements.some((building) => topology.tileVertices[tile]?.includes(building.vertex));
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
          const tileIndex = terrain.length + fish.slot;
          const produces = rolledNumber === fish.number && tileProduces(tileIndex);
          return <g key={`fish-${fish.slot}-roll-${rollCount}`} className={`svg-tile fish ${produces ? "rolled-tile" : ""}`}>
            <polygon points={points} fill="url(#fish-fill)" />
            <polygon className="tile-inset" points={points} />
            <FishArtwork x={x} y={y} />
            <text className="svg-name" x={x} y={y + 37}>Fischgrund</text>
            <g className="svg-token"><circle cx={x} cy={y} r="18"/><text x={x} y={y + 5}>{fish.number}</text></g>
          </g>;
        })}
        {tileCenters.map(({ x, y }, index) => {
          const tile = visibleTerrain[index] ?? terrain[index];
          const { name, className, number } = tile;
          const points = hexPoints(x, y);
          const produces = number > 0 && rolledNumber === number && tileProduces(index);
          return <g key={`${name}-${index}-roll-${rollCount}`} className={`svg-tile ${className} ${produces ? "rolled-tile" : ""}`}>
            <polygon points={points} fill={`url(#${className}-fill)`} />
            <polygon className="tile-inset" points={points} />
            <TerrainArtwork type={className} x={x} y={y} />
            <text className="svg-name" x={x} y={y + 37}>{name}</text>
            {number > 0 && <g className={`svg-token ${number === 6 || number === 8 ? "hot" : ""}`}><circle cx={x} cy={y} r="18"/><text x={x} y={y + 5}>{number}</text></g>}
            {(robberPreviewTile ?? state?.robber_tile ?? 9) === index && room?.status !== "waiting" && <g className="robber-marker" transform={`translate(${x + 30} ${y - 27})`} aria-label="Räuber">
              <g className="robber-walk">
                <ellipse className="robber-shadow" cx="1" cy="15" rx="16" ry="4"/>
                <ellipse className="robber-sack" cx="10" cy="-1" rx="11" ry="14" transform="rotate(-24 10 -1)"/>
                <path className="robber-sack-knot" d="M3-12 8-17l5 6"/>
                <path className="robber-cloak" d="M-9-5Q-3-14 5-8L10 12H-11Z"/>
                <circle className="robber-head" cx="-5" cy="-14" r="6"/>
                <path className="robber-hood" d="M-13-15Q-7-26 2-18L1-10Q-7-14-13-9Z"/>
                <path className="robber-arm" d="M-2-5 8 3"/>
                <path className="robber-leg leg-one" d="M-5 10-10 18"/>
                <path className="robber-leg leg-two" d="M3 10 7 18"/>
              </g>
            </g>}
            {room && klausMode === "robber" && <circle className="klaus-tile-target" cx={x} cy={y} r="53" onClick={() => onKlausTile?.(index)} />}
            {room && klausMode === "desert" && tile.resource !== "none" && !settlements.some((building) => topology.tileVertices[index]?.includes(building.vertex)) && <circle className="klaus-tile-target klaus-desert-target" cx={x} cy={y} r="53" onClick={() => onKlausTile?.(index)} />}
          </g>;
        })}
        {harbors.map((harbor) => <g className="harbor" key={`harbor-${harbor.id}`} transform={`translate(${harbor.x} ${harbor.y})`}>
          <circle r="23" />
          <text className="harbor-anchor" y="-2">⚓</text>
          <text className="harbor-rate" y="12">3:1</text>
        </g>)}
        {carriageRoute && (() => {
          const routeId = `carriage-route-${carriageRoute.run}`;
          const routePath = carriageRoute.vertices.map((vertexId, index) => {
            const vertex = topology.vertices[vertexId];
            return `${index === 0 ? "M" : "L"}${vertex.x} ${vertex.y}`;
          }).join(" ");
          return <g className="road-carriage" aria-hidden="true">
            <path id={routeId} d={routePath} fill="none" stroke="transparent" />
            <g className="road-carriage-vehicle" style={{ color: colors[carriageRoute.player] }}>
              <ellipse className="carriage-shadow" cx="0" cy="7" rx="18" ry="4" />
              <g className="carriage-horse"><ellipse cx="-14" cy="-1" rx="8" ry="5"/><circle cx="-21" cy="-6" r="4"/><path d="M-23-9l-2-5 5 4M-17 3l-2 9m7-9 1 9"/></g>
              <path className="carriage-shaft" d="M-9 1H2"/>
              <path className="carriage-body" d="M1-9h18l4 14H-2Z"/>
              <path className="carriage-roof" d="M3-11h15l-3-6H7Z"/>
              <circle className="carriage-wheel" cx="4" cy="8" r="5"/><circle className="carriage-wheel" cx="19" cy="8" r="5"/>
              <animateMotion dur="20s" begin="0s" fill="freeze" rotate="auto"><mpath href={`#${routeId}`} /></animateMotion>
            </g>
          </g>;
        })()}
      </svg>
      {room && topology.edges.filter((edge) => visibleVertices.has(edge.a) && visibleVertices.has(edge.b)).map((edge) => {
        const built = roads.find((road) => road.edge === edge.id);
        const setupSelectable = mySetupTurn && state?.phase === "setup_road" && !built && (edge.a === latestOwnSettlement || edge.b === latestOwnSettlement);
        const roadConnected = [edge.a, edge.b].some((vertex) => ownBuildingVertices.has(vertex) || (!opponentBuildingVertices.has(vertex) && ownRoadVertices.has(vertex)));
        const buildSelectable = regularBuildTurn && buildMode === "road" && !built && roadConnected;
        const klausSelectable = klausMode === "destroy_road" && built?.player === myIndex;
        const selectable = setupSelectable || buildSelectable || klausSelectable;
        if (!built && !selectable) return null;
        return <button key={`edge-${edge.id}`} className={`setup-edge ${selectable ? "selectable" : "built"} ${klausSelectable ? "klaus-danger" : ""}`} style={{ left: edge.x, top: edge.y, transform: `translate(-50%,-50%) rotate(${edge.angle}deg)`, background: built && !klausSelectable ? colors[built.player] : undefined }} onClick={() => klausSelectable ? onKlausEdge?.(edge) : selectable && onEdge?.(edge)} aria-label={klausSelectable ? "Straße zerstören" : "Straße setzen"} />;
      })}
      {room && topology.vertices.filter((vertex) => visibleVertices.has(vertex.id)).map((vertex) => {
        const built = settlements.find((settlement) => settlement.vertex === vertex.id);
        const setupSelectable = mySetupTurn && state?.phase === "setup_settlement" && !blockedVertices.has(vertex.id);
        const settlementSelectable = regularBuildTurn && buildMode === "settlement" && !built && !blockedVertices.has(vertex.id) && ownRoadVertices.has(vertex.id);
        const isSettlement = built?.building === undefined || built?.building === "settlement";
        const citySelectable = Boolean(regularBuildTurn && buildMode === "city" && built && built.player === myIndex && isSettlement);
        const goldmineSelectable = Boolean(regularBuildTurn && buildMode === "goldmine" && built && built.player === myIndex && isSettlement && desertVertices.has(vertex.id));
        const klausSelectable = klausMode === "sneaky" && !built && ownRoadVertices.has(vertex.id);
        const selectable = setupSelectable || settlementSelectable || citySelectable || goldmineSelectable || klausSelectable;
        if (!built && !selectable) return null;
        const buildingKind = built?.building === "city" ? "city" : built?.building === "goldmine" ? "goldmine" : "settlement";
        return <button key={`vertex-${vertex.id}`} className={`setup-vertex ${selectable ? "selectable" : ""} ${built ? "built" : ""} ${built?.building === "city" ? "city" : ""} ${built?.building === "goldmine" || goldmineSelectable ? "goldmine" : ""} ${klausSelectable ? "klaus-sneaky" : ""}`} style={{ left: vertex.x, top: vertex.y, color: built ? colors[built.player] : undefined }} onClick={() => klausSelectable ? onKlausVertex?.(vertex) : selectable && onVertex?.(vertex)} aria-label={klausSelectable ? "Sneaky-Siedlung setzen" : citySelectable ? "Zur Stadt ausbauen" : goldmineSelectable ? "Zur Goldmine ausbauen" : "Siedlung setzen"}>{built ? <span className={`building-piece building-${buildingKind}`} aria-hidden="true"><i className="building-halo"/><i className="building-chimney"/><i className="building-smoke smoke-one"/><i className="building-smoke smoke-two"/><i className="building-flagpole"/><i className="building-flag"/><i className="building-roof"/><i className="building-body"/><i className="building-door"/><i className="building-window"/></span> : klausSelectable ? "🥸" : "+"}</button>;
      })}
    </div>
  );
}

function MobileInstallPrompt({
  open,
  showInstructions,
  canInstall,
  onInstall,
  onDismiss,
}: {
  open: boolean;
  showInstructions: boolean;
  canInstall: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  if (!open) return null;
  return (
    <div className="install-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="install-prompt-title">
      <div className="install-prompt-card">
        <span className="install-prompt-icon">⬡</span>
        {showInstructions ? <>
          <strong id="install-prompt-title">New Katan installieren</strong>
          <p>Tippe in Safari unten auf <b>Teilen</b> und danach auf <b>„Zum Home-Bildschirm“</b>.</p>
          <button className="install-primary" onClick={onDismiss}>Verstanden</button>
        </> : <>
          <strong id="install-prompt-title">Zum Homebildschirm hinzufügen?</strong>
          <p>{canInstall ? "Starte New Katan künftig direkt wie eine App." : "Lege New Katan für den schnellen Zugriff auf deinem Homebildschirm ab."}</p>
          <div className="install-prompt-actions">
            <button className="install-primary" onClick={onInstall}>Hinzufügen</button>
            <button className="install-secondary" onClick={onDismiss}>Abbrechen</button>
          </div>
        </>}
      </div>
    </div>
  );
}

function MobileFullscreenButton({ onClick }: { onClick: () => void }) {
  return <button className="mobile-fullscreen-button" type="button" onClick={onClick} aria-label="Vollbild öffnen">⛶ <span>Vollbild</span></button>;
}

function HighScoreBoard({ scores, currentName }: { scores: HighScore[]; currentName: string }) {
  const winningScores = scores.filter((score) => score.wins > 0);
  return (
    <section className="highscore-board" aria-label="Highscore Board">
      <div className="highscore-heading"><span>♛</span><div><strong>Highscore Board</strong><small>Siege aller Spieler</small></div></div>
      <div className="highscore-list">
        {winningScores.length === 0 ? <p>Noch keine Siege eingetragen.</p> : winningScores.map((score) => (
          <div className={`highscore-row ${score.display_name === currentName ? "current" : ""}`} key={`${score.rank}-${score.display_name}`}>
            <b>{score.rank}.</b><span>{score.display_name}</span><strong>{score.wins} {score.wins === 1 ? "Sieg" : "Siege"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("de");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [fishTiles, setFishTiles] = useState<FishTile[]>([]);
  const [boardTiles, setBoardTiles] = useState<BoardTile[]>(terrain);
  const [victoryTarget, setVictoryTarget] = useState(10);
  const [code, setCode] = useState(() => typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase());
  const [userId, setUserId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myCards, setMyCards] = useState<KlausCard[]>([]);
  const [cardCounts, setCardCounts] = useState<Record<number, number>>({});
  const [selectedCard, setSelectedCard] = useState<KlausCard | null>(null);
  const [selectedRobberTile, setSelectedRobberTile] = useState<number | null>(null);
  const [showGoldmineUnlock, setShowGoldmineUnlock] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [tradeMode, setTradeMode] = useState<"bank" | "player" | null>(null);
  const [tradeGive, setTradeGive] = useState<ResourceKind | null>(null);
  const [tradeWant, setTradeWant] = useState<ResourceKind | null>(null);
  const [tradeTarget, setTradeTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [error, setError] = useState(supabase ? "" : "Supabase ist noch nicht mit der App verbunden.");
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [activity, setActivity] = useState<GameActivity>({ message: "Willkommen bei New Katan.", kind: "info", created_at: "" });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const resumeAttemptedForUser = useRef("");
  const playerTimerInitialized = useRef(new Set<string>());
  const audioContext = useRef<AudioContext | null>(null);
  const musicPlayer = useRef<HTMLAudioElement | null>(null);
  const musicTrack = useRef(0);
  const lastPlayedActivity = useRef("");
  const lastPlayedActivityAt = useRef(0);
  const lastSeenRemoteActivity = useRef("");
  const lastKlausVoiceAt = useRef(0);

  useEffect(() => {
    const saved = window.localStorage.getItem("new-katan-language");
    const detected: Language = saved === "de" || saved === "en" ? saved : navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
    setLanguage(detected);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === "en" ? "New Katan – Strategy Game" : "New Katan – Strategiespiel";
    if (language !== "en") return;

    const translateNode = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      if (root.nodeType === Node.TEXT_NODE) nodes.unshift(root as Text);
      nodes.forEach((node) => {
        const parent = node.parentElement;
        if (!parent || parent.closest("script,style")) return;
        const next = translateUiText(node.nodeValue ?? "");
        if (next !== node.nodeValue) node.nodeValue = next;
      });
      if (root instanceof Element) {
        [root, ...Array.from(root.querySelectorAll("[placeholder],[title],[aria-label],[data-mobile-label]"))].forEach((element) => {
          ["placeholder", "title", "aria-label", "data-mobile-label"].forEach((attribute) => {
            const value = element.getAttribute(attribute);
            if (value) element.setAttribute(attribute, translateUiText(value));
          });
        });
      }
    };

    translateNode(document.body);
    const observer = new MutationObserver((mutations) => mutations.forEach((mutation) => {
      if (mutation.type === "characterData") translateNode(mutation.target);
      mutation.addedNodes.forEach(translateNode);
    }));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  function changeLanguage(nextLanguage: Language) {
    window.localStorage.setItem("new-katan-language", nextLanguage);
    if (nextLanguage === language) return;
    window.location.reload();
  }

  const isHost = room?.created_by === userId;
  const me = players.find((player) => player.user_id === userId);
  const activePlayer = players.find((player) => player.player_index === room?.state?.active_player);
  const eliminatedPlayers = room?.state?.eliminated_players ?? [];
  const isEliminated = me?.player_index !== undefined && eliminatedPlayers.includes(me.player_index);
  const isMyTurn = !isEliminated && me?.player_index === room?.state?.active_player;
  const myResources = me?.resources ?? { wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 };
  const canBuildRoad = myResources.wood >= 1 && myResources.brick >= 1;
  const canBuildSettlement = myResources.wood >= 1 && myResources.brick >= 1 && myResources.wool >= 1 && myResources.grain >= 1;
  const canBuildCity = myResources.ore >= 3 && myResources.grain >= 2;
  const goldmineUnlocked = Boolean(room?.state?.goldmine_unlocked) || players.some((player) => (player.victory_points ?? 0) >= 8);
  const canBuildGoldmine = goldmineUnlocked && myResources.wood >= 2 && myResources.brick >= 2;
  const canCallKlaus = myResources.ore >= 1 && myResources.wool >= 1 && myResources.grain >= 1;
  const forcedCard = myCards.find((card) => card.must_play);
  const activeCard = selectedCard ?? forcedCard ?? null;
  const klausMode: KlausMapMode = room?.state?.phase === "robber" && isMyTurn && selectedRobberTile === null
    ? "robber"
    : activeCard?.card_type === "angry" && selectedRobberTile === null
    ? "robber"
    : activeCard?.card_type === "stupid"
      ? "destroy_road"
      : activeCard?.card_type === "sneaky"
        ? "sneaky"
        : activeCard?.card_type === "desert"
          ? "desert"
        : null;
  const shareUrl = useMemo(() => room && typeof window !== "undefined" ? `${window.location.origin}?room=${room.join_code}` : "", [room]);
  const goldmineChooser = room?.state?.goldmine_queue?.[0];
  const isGoldmineChooser = goldmineChooser !== undefined && goldmineChooser === me?.player_index;
  const longestRoadHolder = players.find((player) => player.player_index === room?.state?.longest_road_holder);
  const largestArmyHolder = players.find((player) => player.player_index === room?.state?.largest_army_holder);
  const myDiscard = room?.state?.discard_queue?.find((entry) => entry.player === me?.player_index);
  const tradeOffer = room?.state?.trade_offer;
  const diceSums = Array.from({ length: 11 }, (_, index) => index + 2);
  const diceStats = room?.state?.dice_stats ?? {};
  const totalRolls = diceSums.reduce((total, sum) => total + (diceStats[String(sum)] ?? 0), 0);
  const highestDiceCount = Math.max(1, ...diceSums.map((sum) => diceStats[String(sum)] ?? 0));
  const activePlayerIndex = room?.state?.active_player;
  const playerTimersReady = Boolean(room?.state?.player_time_remaining);
  const playerClockPaused = Boolean(room?.state?.timer_paused_at || room?.state?.card_event || room?.state?.phase === "discard" || room?.state?.phase === "goldmine" || room?.state?.phase?.startsWith("setup_"));
  const storedActiveSeconds = activePlayerIndex === undefined ? 600 : Number(room?.state?.player_time_remaining?.[String(activePlayerIndex)] ?? 600);
  const activeClockElapsed = !playerClockPaused && room?.state?.player_timer_active === activePlayerIndex && room?.state?.player_timer_started_at
    ? Math.max(0, (clockNow - new Date(room.state.player_timer_started_at).getTime()) / 1000)
    : 0;
  const activePlayerSeconds = Math.max(0, storedActiveSeconds - activeClockElapsed);
  const playerSeconds = (playerIndex: number) => {
    if (playerIndex === activePlayerIndex) return activePlayerSeconds;
    return Math.max(0, Number(room?.state?.player_time_remaining?.[String(playerIndex)] ?? 600));
  };
  const discardSeconds = room?.state?.discard_deadline ? Math.max(0, Math.ceil((new Date(room.state.discard_deadline).getTime() - clockNow) / 1000)) : 10;
  const hasHarbor = (room?.state?.settlements ?? []).some((building) => building.player === me?.player_index && harbors.some((harbor) => harbor.vertices.includes(building.vertex)));
  const bankTradeRate = hasHarbor ? 3 : 4;
  const hasBankTradedThisRound = me?.last_bank_trade_round === (room?.state?.round ?? 1);
  const robberVictimsForTile = (tile: number) => players.filter((player) =>
    player.player_index !== me?.player_index && (room?.state?.settlements ?? []).some((settlement) =>
      settlement.player === player.player_index && topology.tileVertices[tile]?.includes(settlement.vertex)
    )
  );
  const robberVictims = selectedRobberTile === null ? [] : robberVictimsForTile(selectedRobberTile);

  function unlockAudio() {
    if (typeof window === "undefined") return null;
    try {
      const context = audioContext.current ?? new AudioContext();
      audioContext.current = context;
      if (context.state !== "running") void context.resume();

      // iOS/Safari schaltet WebAudio erst frei, wenn innerhalb einer echten
      // Berührung ein (lautloser) Ton gestartet wurde.
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.setValueAtTime(.00001, context.currentTime);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + .015);
      return context;
    } catch {
      return null;
    }
  }

  function speakKlaus() {
    if (!soundEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (Date.now() - lastKlausVoiceAt.current < 1800) return;
    lastKlausVoiceAt.current = Date.now();
    window.speechSynthesis.cancel();
    const call = new SpeechSynthesisUtterance("Klaaaus!");
    const germanVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLocaleLowerCase().startsWith("de"));
    if (germanVoice) call.voice = germanVoice;
    call.lang = "de-DE";
    call.rate = .62;
    call.pitch = .72;
    call.volume = .9;
    window.speechSynthesis.speak(call);
  }

  function playActivitySound(kind: ActivityKind, message = "") {
    if (!soundEnabled || typeof window === "undefined") return;
    const notes: Record<ActivityKind, number[]> = {
      info: [440], turn: [440, 590], dice: [230, 290, 360], build: [360, 520],
      trade: [420, 500], klaus: [190, 145, 110], win: [523, 659, 784],
    };
    try {
      const context = unlockAudio();
      if (!context) return;

      const normalizedMessage = message.toLocaleLowerCase("de");
      if (kind === "klaus" && normalizedMessage.includes("ruft klaus")) speakKlaus();
      const woodenHit = (delay: number, pitch = 118, volume = .12) => {
        const start = context.currentTime + delay;
        const oscillator = context.createOscillator();
        const oscillatorGain = context.createGain();
        const noise = context.createBufferSource();
        const noiseFilter = context.createBiquadFilter();
        const noiseGain = context.createGain();
        const noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .055), context.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;

        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(pitch * 1.9, start);
        oscillator.frequency.exponentialRampToValueAtTime(pitch, start + .045);
        oscillatorGain.gain.setValueAtTime(volume, start);
        oscillatorGain.gain.exponentialRampToValueAtTime(.0001, start + .09);
        oscillator.connect(oscillatorGain).connect(context.destination);

        noise.buffer = noiseBuffer;
        noiseFilter.type = "lowpass";
        noiseFilter.frequency.setValueAtTime(1050, start);
        noiseGain.gain.setValueAtTime(volume * .5, start);
        noiseGain.gain.exponentialRampToValueAtTime(.0001, start + .045);
        noise.connect(noiseFilter).connect(noiseGain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + .1);
        noise.start(start);
        noise.stop(start + .06);
      };

      if (kind === "build") {
        if (normalizedMessage.includes("straße")) {
          woodenHit(0, 142, .09);
          woodenHit(.11, 126, .08);
        } else if (normalizedMessage.includes("goldmine")) {
          woodenHit(0, 175, .1);
          woodenHit(.13, 230, .11);
          woodenHit(.27, 155, .09);
        } else {
          woodenHit(0, 112, .12);
          woodenHit(.14, 126, .11);
          woodenHit(.29, normalizedMessage.includes("stadt") ? 158 : 108, .13);
        }
        return;
      }

      if (kind === "dice") {
        [0, .045, .09, .145, .205].forEach((delay, index) => woodenHit(delay, 185 + index * 19, .045));
        return;
      }

      notes[kind].forEach((frequency, index) => {
        const start = context.currentTime + index * .075;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = kind === "klaus" ? "sawtooth" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(kind === "win" ? .1 : .055, start + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .11);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + .12);
      });
    } catch {
      // Manche Browser erlauben Ton erst nach der ersten Berührung der Seite.
    }
  }

  function showActivity(next: GameActivity, playSound = true) {
    setActivity(next);
    const isEcho = next.message === lastPlayedActivity.current && Date.now() - lastPlayedActivityAt.current < 1200;
    if (playSound && !isEcho) {
      lastPlayedActivity.current = next.message;
      lastPlayedActivityAt.current = Date.now();
      playActivitySound(next.kind, next.message);
    }
  }

  function announceActivity(action: string, fallbackMessage: string, kind: ActivityKind, detail?: string) {
    const now = new Date().toISOString();
    showActivity({ message: fallbackMessage, kind, created_at: now });
    if (!supabase || !room) return;
    void supabase.rpc("record_game_activity", { p_game_id: room.id, p_action: action, p_detail: detail ?? null })
      .then(({ data }) => {
        const result = (Array.isArray(data) ? data[0] : data) as GameActivity | null;
        if (result?.message) showActivity(result, false);
      });
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    window.localStorage.setItem("new-katan-sound", next ? "on" : "off");
    if (next) unlockAudio();
  }

  function stopBackgroundMusic() {
    musicPlayer.current?.pause();
  }

  function startBackgroundMusic(force = false) {
    if ((!musicEnabled && !force) || typeof window === "undefined") return;
    let player = musicPlayer.current;
    if (!player) {
      player = new Audio(backgroundTracks[musicTrack.current]);
      player.preload = "auto";
      player.volume = .18;
      const advanceTrack = () => {
        musicTrack.current = (musicTrack.current + 1) % backgroundTracks.length;
        if (!musicPlayer.current) return;
        musicPlayer.current.src = backgroundTracks[musicTrack.current];
        musicPlayer.current.load();
        void musicPlayer.current.play().catch(() => undefined);
      };
      player.onended = advanceTrack;
      player.onerror = () => window.setTimeout(advanceTrack, 400);
      musicPlayer.current = player;
    }
    void player.play().catch(() => undefined);
  }

  function toggleMusic() {
    const next = !musicEnabled;
    setMusicEnabled(next);
    window.localStorage.setItem("new-katan-music", next ? "on" : "off");
    if (next) {
      startBackgroundMusic(true);
    } else {
      stopBackgroundMusic();
    }
  }

  useEffect(() => {
    setSoundEnabled(window.localStorage.getItem("new-katan-sound") !== "off");
    setMusicEnabled(window.localStorage.getItem("new-katan-music") !== "off");
  }, []);

  useEffect(() => {
    if (!musicEnabled) {
      stopBackgroundMusic();
      return;
    }
    const beginMusic = () => startBackgroundMusic();
    window.addEventListener("pointerdown", beginMusic, { capture: true, once: true });
    window.addEventListener("touchend", beginMusic, { capture: true, once: true });
    return () => {
      window.removeEventListener("pointerdown", beginMusic, { capture: true });
      window.removeEventListener("touchend", beginMusic, { capture: true });
    };
  }, [musicEnabled]);

  useEffect(() => () => stopBackgroundMusic(), []);

  useEffect(() => {
    if (!soundEnabled) return;
    const unlockFromGesture = () => { unlockAudio(); };
    window.addEventListener("pointerdown", unlockFromGesture, { capture: true });
    window.addEventListener("touchend", unlockFromGesture, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlockFromGesture, { capture: true });
      window.removeEventListener("touchend", unlockFromGesture, { capture: true });
    };
  }, [soundEnabled]);

  useEffect(() => {
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
    const isMobile = window.matchMedia("(max-width: 900px)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || standaloneNavigator.standalone === true;
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js?v=2", { updateViaCache: "none" });
    if (!isMobile || isStandalone || window.localStorage.getItem("new-katan-install-dismissed")) return;

    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    const timer = window.setTimeout(() => setShowInstallPrompt(true), 700);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
    };
  }, []);

  function dismissInstallPrompt() {
    window.localStorage.setItem("new-katan-install-dismissed", "true");
    setShowInstallPrompt(false);
    setShowInstallInstructions(false);
  }

  async function installToHomeScreen() {
    if (!installPromptEvent) {
      setShowInstallInstructions(true);
      return;
    }
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") dismissInstallPrompt();
    setInstallPromptEvent(null);
  }

  async function openMobileFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        return;
      } catch {
        // iPhone/iPad Safari erlaubt echtes Vollbild nur als installierte Web-App.
      }
    }
    setShowInstallInstructions(true);
    setShowInstallPrompt(true);
  }

  useEffect(() => {
    if (!room || !me || !goldmineUnlocked) return;
    const storageKey = `new-katan-goldmine-${room.id}-${me.user_id}`;
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, "seen");
    const timer = window.setTimeout(() => {
      setShowGoldmineUnlock(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [goldmineUnlocked, room, me]);

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
    const timer = window.setTimeout(() => setBoardTiles(createRandomBoard()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      const timer = window.setTimeout(() => setAuthReady(true), 0);
      return () => window.clearTimeout(timer);
    }
    const applySession = async (session: Awaited<ReturnType<typeof client.auth.getSession>>["data"]["session"]) => {
      const sessionEmail = session?.user.email;
      if (session?.user.id && sessionEmail) {
        setUserId(session.user.id);
        setEmail(sessionEmail);
        setName(displayNameFromEmail(sessionEmail));
      } else {
        setUserId("");
        setName("");
        if (session?.user.is_anonymous) await client.auth.signOut();
      }
      setAuthReady(true);
    };
    void client.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => void applySession(session));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !userId) return;
    const loadHighScores = async () => {
      const { data, error: scoreError } = await client.rpc("get_katan_highscores");
      if (scoreError) {
        if (!scoreError.message.includes("get_katan_highscores")) setError(scoreError.message);
        return;
      }
      setHighScores((data as HighScore[]) ?? []);
    };
    void loadHighScores();
    const timer = window.setInterval(() => void loadHighScores(), 15000);
    return () => window.clearInterval(timer);
  }, [userId]);

  useEffect(() => {
    const client = supabase;
    if (!client || !userId || !name || room || resumeAttemptedForUser.current === userId) return;
    resumeAttemptedForUser.current = userId;

    const resumeRoom = async () => {
      const urlCode = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
      const storedCode = window.localStorage.getItem(`new-katan-last-room-${userId}`)?.trim().toUpperCase() ?? "";
      const requestedCode = urlCode || storedCode || null;
      let { data, error: resumeError } = await client.rpc("resume_my_game_room", { p_join_code: requestedCode });

      if (!resumeError && !data && !urlCode && storedCode) {
        const fallback = await client.rpc("resume_my_game_room", { p_join_code: null });
        data = fallback.data;
        resumeError = fallback.error;
      }

      if (resumeError) {
        if (!resumeError.message.includes("resume_my_game_room")) setError(resumeError.message);
        return;
      }

      const resumedRoom = (Array.isArray(data) ? data[0] : data) as Room | null;
      if (!resumedRoom?.id || !resumedRoom.join_code) return;
      setRoom(resumedRoom);
      setCode(resumedRoom.join_code);
      window.localStorage.setItem(`new-katan-last-room-${userId}`, resumedRoom.join_code);
      window.history.replaceState({}, "", `?room=${resumedRoom.join_code}`);
    };

    void resumeRoom();
  }, [name, room, userId]);

  useEffect(() => {
    if (!room?.join_code || !userId) return;
    window.localStorage.setItem(`new-katan-last-room-${userId}`, room.join_code);
  }, [room?.join_code, userId]);

  const roomId = room?.id;

  async function loadPlayerData(gameId: string) {
    const client = supabase;
    if (!client) return;
    const { data, error: playersError } = await client.rpc("get_game_players_with_cards", { p_game_id: gameId });
    if (playersError) {
      setError(playersError.message);
      return;
    }
    setPlayers((data as Player[]) ?? []);
    const [{ data: handData }, { data: countData }] = await Promise.all([
      client.rpc("get_my_klaus_cards", { p_game_id: gameId }),
      client.rpc("get_game_card_counts", { p_game_id: gameId }),
    ]);
    setMyCards((handData as KlausCard[]) ?? []);
    setCardCounts(Object.fromEntries(((countData as { player_index: number; card_count: number }[]) ?? []).map((item) => [item.player_index, item.card_count])));
  }

  useEffect(() => {
    const client = supabase;
    if (!roomId || !client) return;
    const applyRemoteActivity = (next: GameActivity, playSound: boolean) => {
      if (!next?.message) return;
      const activityKey = `${next.created_at}|${next.message}`;
      if (activityKey === lastSeenRemoteActivity.current) return;
      lastSeenRemoteActivity.current = activityKey;
      showActivity(next, playSound);
    };
    const loadActivity = async () => {
      const { data } = await client.rpc("get_latest_game_activity", { p_game_id: roomId });
      const latest = (Array.isArray(data) ? data[0] : data) as GameActivity | null;
      if (latest?.message) applyRemoteActivity(latest, false);
    };
    void loadActivity();
    const activityPoll = window.setInterval(async () => {
      const { data } = await client.rpc("get_latest_game_activity", { p_game_id: roomId });
      const latest = (Array.isArray(data) ? data[0] : data) as GameActivity | null;
      if (latest?.message) applyRemoteActivity(latest, true);
    }, 1000);
    const channel = client.channel(`activity-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_activity", filter: `game_id=eq.${roomId}` }, (payload) => {
        const next = payload.new as GameActivity;
        if (next?.message) applyRemoteActivity(next, true);
      })
      .subscribe();
    return () => {
      window.clearInterval(activityPoll);
      client.removeChannel(channel);
    };
  }, [roomId, soundEnabled]);

  useEffect(() => {
    const client = supabase;
    if (!roomId || !client) return;
    const loadPlayers = () => loadPlayerData(roomId);
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

  useEffect(() => {
    if (!roomId || room?.status !== "playing") return;
    const clock = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(clock);
  }, [roomId, room?.status]);

  useEffect(() => {
    const client = supabase;
    if (!client || !roomId || room?.status !== "playing" || playerTimersReady || playerTimerInitialized.current.has(roomId)) return;
    playerTimerInitialized.current.add(roomId);
    void client.rpc("ensure_player_game_timer", { p_game_id: roomId }).then(({ data, error: timerError }) => {
      if (timerError) {
        playerTimerInitialized.current.delete(roomId);
        if (!timerError.message.includes("function public.ensure_player_game_timer")) setError(timerError.message);
        return;
      }
      if (data) setRoom(normalizedRoom(data));
    });
  }, [playerTimersReady, roomId, room?.status]);

  useEffect(() => {
    const client = supabase;
    if (!client || !roomId || room?.status !== "playing" || !playerTimersReady) return;
    const synchronize = async () => {
      const { data, error: timerError } = await client.rpc("sync_player_game_timer", { p_game_id: roomId });
      if (timerError) {
        if (!timerError.message.includes("function public.sync_player_game_timer")) setError(timerError.message);
        return;
      }
      if (data) setRoom(normalizedRoom(data));
    };
    void synchronize();
    const timer = window.setInterval(() => void synchronize(), 1000);
    return () => window.clearInterval(timer);
  }, [playerTimersReady, roomId, room?.status]);

  useEffect(() => {
    const client = supabase;
    const event = room?.state?.card_event;
    if (!client || !roomId || !event) return;
    const delay = Math.max(0, new Date(event.resolve_at).getTime() - Date.now() + 120);
    const timer = window.setTimeout(async () => {
      const { data } = await client.rpc("resolve_klaus_card", { p_game_id: roomId, p_card_id: event.card_id });
      if (data) setRoom(normalizedRoom(data));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [room?.state?.card_event, roomId]);

  async function sendLoginCode(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !email.trim()) return;
    setBusy(true);
    setAuthError("");
    const normalizedEmail = email.trim().toLowerCase();
    const { error: loginError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true, data: { display_name: displayNameFromEmail(normalizedEmail) } },
    });
    if (loginError) setAuthError(loginError.message);
    else {
      setEmail(normalizedEmail);
      setOtpSent(true);
    }
    setBusy(false);
  }

  async function verifyLoginCode(event: FormEvent) {
    event.preventDefault();
    if (!supabase || otp.length < 6 || otp.length > 8) return;
    setBusy(true);
    setAuthError("");
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    if (verifyError) setAuthError(verifyError.message);
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    resumeAttemptedForUser.current = "";
    setRoom(null);
    setPlayers([]);
    setHighScores([]);
    setOtp("");
    setOtpSent(false);
    setUserId("");
    setName("");
  }

  function leaveGame() {
    if (typeof window !== "undefined") {
      if (userId) window.localStorage.removeItem(`new-katan-last-room-${userId}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    setRoom(null);
    setPlayers([]);
    setMyCards([]);
    setCardCounts({});
    setSelectedCard(null);
    setSelectedRobberTile(null);
    setTradeMode(null);
    setTradeGive(null);
    setTradeWant(null);
    setTradeTarget(null);
    setError("");
  }

  function confirmLeaveGame() {
    if (typeof window === "undefined") return;
    if (window.confirm("Möchtest du das Spiel wirklich verlassen?")) leaveGame();
  }

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim()) return;
    setBusy(true); setError("");
    const { data, error: rpcError } = await supabase.rpc("create_game_room_with_options", { p_player_name: name.trim(), p_fish_tiles: fishTiles, p_victory_target: victoryTarget, p_board_tiles: boardTiles });
    if (rpcError) setError(rpcError.message);
    else {
      const result = data[0];
      setRoom({ id: result.game_id, join_code: result.join_code, status: "waiting", created_by: userId, fish_tiles: fishTiles, board_tiles: boardTiles, victory_target: victoryTarget });
      window.history.replaceState({}, "", `?room=${result.join_code}`);
    }
    setBusy(false);
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim() || code.length !== 6) return;
    setBusy(true); setError("");

    const normalizedCode = code.toUpperCase();
    const { data: resumedData, error: resumeError } = await supabase.rpc("resume_my_game_room", { p_join_code: normalizedCode });
    const resumedRoom = (Array.isArray(resumedData) ? resumedData[0] : resumedData) as Room | null;
    if (!resumeError && resumedRoom?.id) {
      setRoom(resumedRoom);
      window.localStorage.setItem(`new-katan-last-room-${userId}`, normalizedCode);
      window.history.replaceState({}, "", `?room=${normalizedCode}`);
      setBusy(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("join_game_room", { p_join_code: normalizedCode, p_player_name: name.trim() });
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
          window.localStorage.setItem(`new-katan-last-room-${userId}`, normalizedCode);
          window.history.replaceState({}, "", `?room=${normalizedCode}`);
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
    if (setupError) {
      setError(setupError.message);
      return;
    }
    const startedRoom = normalizedRoom(data);
    setRoom(startedRoom);
    const firstPlayer = players.find((player) => player.player_index === startedRoom.state?.active_player)?.player_name ?? me?.player_name ?? name;
    announceActivity("turn", `${firstPlayer} beginnt die Aufbauphase.`, "turn", firstPlayer);
    const { data: timedRoom, error: timerError } = await supabase.rpc("ensure_player_game_timer", { p_game_id: room.id });
    if (timerError) setError(timerError.message);
    else if (timedRoom) setRoom(normalizedRoom(timedRoom));
  }

  async function placeSettlement(vertex: Vertex) {
    if (!supabase || !room) return;
    setBusy(true); setError("");
    const rpcName = room.state?.phase === "setup_settlement"
      ? "place_setup_settlement"
      : buildMode === "city" ? "upgrade_game_city" : buildMode === "goldmine" ? "upgrade_game_goldmine" : "build_game_settlement";
    const parameters = rpcName === "place_setup_settlement"
      ? { p_game_id: room.id, p_vertex: vertex.id, p_neighbor_vertices: vertex.neighbors }
      : { p_game_id: room.id, p_vertex: vertex.id };
    const { data, error: placementError } = await supabase.rpc(rpcName, parameters);
    if (placementError) setError(placementError.message);
    else {
      const { data: winnerData, error: winnerError } = await supabase.rpc("check_game_winner", { p_game_id: room.id });
      if (winnerError) setError(winnerError.message);
      const nextRoom = normalizedRoom(winnerData ?? data);
      setRoom(nextRoom);
      const building = rpcName === "upgrade_game_city" ? "eine Stadt" : rpcName === "upgrade_game_goldmine" ? "eine Goldmine" : "eine Siedlung";
      if (nextRoom.state?.winner_player === me?.player_index) announceActivity("win", `${me?.player_name ?? name} gewinnt das Spiel!`, "win");
      else announceActivity(rpcName === "upgrade_game_city" ? "city" : rpcName === "upgrade_game_goldmine" ? "goldmine" : "settlement", `${me?.player_name ?? name} baut ${building}.`, "build");
      await loadPlayerData(room.id);
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
    else {
      setRoom(normalizedRoom(data));
      setBuildMode(null);
      announceActivity("road", `${me?.player_name ?? name} baut eine Straße.`, "build");
      await loadPlayerData(room.id);
    }
    setBusy(false);
  }

  async function rollDice() {
    if (!supabase || !room || !isMyTurn) return;
    setBusy(true); setError("");
    const { data, error: rollError } = await supabase.rpc("roll_turn_dice", { p_game_id: room.id });
    if (rollError) setError(rollError.message); else {
      const nextRoom = normalizedRoom(data);
      setRoom(nextRoom);
      const dice = nextRoom.state?.dice ?? [];
      const sum = dice.reduce((total, die) => total + die, 0);
      announceActivity("dice", `${me?.player_name ?? name} würfelt${sum ? ` eine ${sum}` : ""}.`, "dice", sum ? String(sum) : undefined);
      await loadPlayerData(room.id);
    }
    setBusy(false);
  }

  async function moveRobber(targetPlayer?: number, tileOverride?: number) {
    const targetTile = tileOverride ?? selectedRobberTile;
    if (!supabase || !room || !isMyTurn || targetTile === null) return;
    setBusy(true); setError("");
    const { data, error: robberError } = await supabase.rpc("move_turn_robber", {
      p_game_id: room.id,
      p_tile: targetTile,
      p_target_player: targetPlayer ?? null,
    });
    if (robberError) setError(robberError.message);
    else {
      setRoom(normalizedRoom(data));
      setSelectedRobberTile(null);
      announceActivity("robber", `${me?.player_name ?? name} versetzt den Ritter.`, "klaus");
      await loadPlayerData(room.id);
    }
    setBusy(false);
  }

  function selectRobberTile(tile: number) {
    if (activeCard?.card_type === "desert") {
      void playKlausCard({ tile });
      return;
    }
    const victims = robberVictimsForTile(tile);
    if (victims.length > 0) {
      setSelectedRobberTile(tile);
      return;
    }
    if (activeCard?.card_type === "angry") {
      void playKlausCard({ tile });
      return;
    }
    void moveRobber(undefined, tile);
  }

  async function chooseGoldmineResource(resource: ResourceKind) {
    if (!supabase || !room || !isGoldmineChooser) return;
    setBusy(true); setError("");
    const { data, error: goldmineError } = await supabase.rpc("choose_goldmine_resource", { p_game_id: room.id, p_resource: resource });
    if (goldmineError) setError(goldmineError.message); else { setRoom(normalizedRoom(data)); announceActivity("goldmine_resource", `${me?.player_name ?? name} wählt einen Goldminen-Rohstoff.`, "build"); await loadPlayerData(room.id); }
    setBusy(false);
  }

  function resetTradeSelection() {
    setTradeGive(null);
    setTradeWant(null);
    setTradeTarget(null);
  }

  async function tradeWithBank() {
    if (!supabase || !room || !tradeGive || !tradeWant || tradeGive === tradeWant) return;
    setBusy(true); setError("");
    const { data, error: tradeError } = await supabase.rpc("trade_with_bank", { p_game_id: room.id, p_give: tradeGive, p_want: tradeWant });
    if (tradeError) setError(tradeError.message);
    else {
      setRoom(normalizedRoom(data));
      resetTradeSelection();
      setTradeMode(null);
      announceActivity("bank_trade", `${me?.player_name ?? name} handelt mit dem Vorrat.`, "trade");
      await loadPlayerData(room.id);
    }
    setBusy(false);
  }

  async function offerPlayerTrade() {
    if (!supabase || !room || tradeTarget === null || !tradeGive || !tradeWant || tradeGive === tradeWant) return;
    setBusy(true); setError("");
    const { data, error: tradeError } = await supabase.rpc("offer_player_trade", { p_game_id: room.id, p_target_player: tradeTarget, p_give: tradeGive, p_want: tradeWant });
    if (tradeError) setError(tradeError.message);
    else {
      setRoom(normalizedRoom(data));
      resetTradeSelection();
      setTradeMode(null);
      announceActivity("trade_offer", `${me?.player_name ?? name} bietet einen Handel an.`, "trade");
    }
    setBusy(false);
  }

  async function respondToTrade(accept: boolean) {
    if (!supabase || !room) return;
    setBusy(true); setError("");
    const { data, error: tradeError } = await supabase.rpc("respond_player_trade", { p_game_id: room.id, p_accept: accept });
    if (tradeError) setError(tradeError.message); else { setRoom(normalizedRoom(data)); announceActivity(accept ? "trade_accept" : "trade_reject", `${me?.player_name ?? name} ${accept ? "nimmt den Handel an" : "lehnt den Handel ab"}.`, "trade"); await loadPlayerData(room.id); }
    setBusy(false);
  }

  async function cancelTrade() {
    if (!supabase || !room) return;
    setBusy(true); setError("");
    const { data, error: tradeError } = await supabase.rpc("cancel_player_trade", { p_game_id: room.id });
    if (tradeError) setError(tradeError.message); else setRoom(normalizedRoom(data));
    setBusy(false);
  }

  async function discardResource(resource: ResourceKind) {
    if (!supabase || !room || !myDiscard || (myResources[resource] ?? 0) < 1) return;
    setBusy(true); setError("");
    const { data, error: discardError } = await supabase.rpc("discard_seven_resource", { p_game_id: room.id, p_resource: resource });
    if (discardError) setError(discardError.message); else { setRoom(normalizedRoom(data)); announceActivity("discard", `${me?.player_name ?? name} gibt einen Rohstoff ab.`, "klaus"); await loadPlayerData(room.id); }
    setBusy(false);
  }

  async function endTurn() {
    if (!supabase || !room || !isMyTurn) return;
    setBusy(true); setError("");
    const { data, error: turnError } = await supabase.rpc("end_player_turn", { p_game_id: room.id });
    if (turnError) setError(turnError.message); else {
      const nextRoom = normalizedRoom(data);
      setRoom(nextRoom); setBuildMode(null); setTradeMode(null); resetTradeSelection();
      const nextPlayer = players.find((player) => player.player_index === nextRoom.state?.active_player)?.player_name;
      announceActivity(nextPlayer ? "turn" : "end_turn", nextPlayer ? `${nextPlayer} ist am Zug.` : `${me?.player_name ?? name} beendet den Zug.`, "turn", nextPlayer);
    }
    setBusy(false);
  }

  function closeGoldmineMessage() {
    setShowGoldmineUnlock(false);
  }

  async function buyKlausCard() {
    if (!supabase || !room || !isMyTurn) return;
    unlockAudio();
    speakKlaus();
    setBusy(true); setError("");
    const { data, error: cardError } = await supabase.rpc("buy_klaus_card", { p_game_id: room.id });
    if (cardError) setError(cardError.message);
    else {
      const card = (Array.isArray(data) ? data[0] : data) as KlausCard;
      if (card) {
        const boughtCard = { ...card, bought_round: room.state?.round ?? 1 };
        setMyCards((current) => [...current, boughtCard]);
        if (card.must_play) setSelectedCard(card);
        announceActivity("klaus", `${me?.player_name ?? name} ruft Klaus.`, "klaus");
        await loadPlayerData(room.id);
      }
    }
    setBusy(false);
  }

  async function playKlausCard(payload: Record<string, unknown>) {
    if (!supabase || !room || !activeCard || !isMyTurn) return;
    setBusy(true); setError("");
    const playedCard = activeCard;
    const previousArmyHolder = room.state?.largest_army_holder;
    const { data, error: cardError } = await supabase.rpc("play_klaus_card", { p_game_id: room.id, p_card_id: activeCard.id, p_payload: payload });
    if (cardError) setError(cardError.message);
    else {
      let nextRoom = normalizedRoom(data);
      if (playedCard.card_type === "angry") {
        const { data: armyData, error: armyError } = await supabase.rpc("refresh_largest_army", { p_game_id: room.id });
        if (armyError) setError(armyError.message);
        else if (armyData) nextRoom = normalizedRoom(armyData);
      }
      setRoom(nextRoom);
      setMyCards((current) => current.filter((card) => card.id !== activeCard.id));
      setSelectedCard(null);
      setSelectedRobberTile(null);
      const tookLargestArmy = playedCard.card_type === "angry" && nextRoom.state?.largest_army_holder === me?.player_index && previousArmyHolder !== me?.player_index;
      if (nextRoom.state?.winner_player === me?.player_index) announceActivity("win", `${me?.player_name ?? name} gewinnt das Spiel!`, "win");
      else if (tookLargestArmy) announceActivity("largest_army", `${me?.player_name ?? name} übernimmt die Größte Rittermacht!`, "klaus");
      else announceActivity("klaus_card", `${me?.player_name ?? name} spielt „${klausCards[playedCard.card_type].title}“.`, "klaus", klausCards[playedCard.card_type].title);
      await loadPlayerData(room.id);
    }
    setBusy(false);
  }

  function chooseKlausCard(card: KlausCard) {
    setBuildMode(null);
    setSelectedRobberTile(null);
    setSelectedCard(card);
  }

  async function copyInvite() {
    if (!shareUrl) return;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      }
    } catch {
      // Safari kann die Clipboard-API trotz Nutzeraktion ablehnen.
    }
    if (!copied) {
      const field = document.createElement("textarea");
      field.value = shareUrl;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      copied = document.execCommand("copy");
      field.remove();
    }
    if (!copied) {
      setError("Der Einladungslink konnte nicht kopiert werden.");
      return;
    }
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1800);
  }

  if (!authReady) {
    return <main className="auth-shell"><LanguageSwitcher language={language} onChange={changeLanguage} /><div className="auth-card auth-loading"><span>⬡</span><strong>New Katan wird geladen …</strong></div></main>;
  }

  if (!userId) {
    return (
      <main className="auth-shell">
        <LanguageSwitcher language={language} onChange={changeLanguage} />
        <section className="auth-card">
          <div className="auth-brand"><span>⬡</span> NEW KATAN</div>
          <div className="auth-klaus">🧔🏻‍♂️</div>
          <h1>{otpSent ? "Code eingeben" : "Klaus prüft die Gästeliste"}</h1>
          <p>{otpSent ? <>Wir haben einen Verifizierungscode an <b>{email}</b> gesendet.</> : "Melde dich mit deiner E-Mail-Adresse an. Dein Spielername wird automatisch daraus gebildet."}</p>
          {otpSent ? (
            <form className="auth-form" onSubmit={verifyLoginCode}>
              <label>Verifizierungscode<input className="otp-input" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" placeholder="Code eingeben" autoFocus /></label>
              <button disabled={busy || otp.length < 6 || otp.length > 8}>{busy ? "Prüfe …" : "Einloggen"}</button>
              <button className="auth-back" type="button" onClick={() => { setOtpSent(false); setOtp(""); setAuthError(""); }}>Andere E-Mail-Adresse</button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={sendLoginCode}>
              <label>E-Mail-Adresse<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="E-Mail-Adresse eingeben" required autoFocus /></label>
              <button disabled={busy || !email.trim()}>{busy ? "Sende …" : "Code senden"}</button>
            </form>
          )}
          {authError && <p className="auth-error">{authError}</p>}
        </section>
        <MobileFullscreenButton onClick={() => void openMobileFullscreen()} />
        <MobileInstallPrompt open={showInstallPrompt} showInstructions={showInstallInstructions} canInstall={Boolean(installPromptEvent)} onInstall={() => void installToHomeScreen()} onDismiss={dismissInstallPrompt} />
      </main>
    );
  }

  if (!room) {
    return (
      <main className="lobby-shell">
        <div className="frame-vines" aria-hidden="true"><i className="vine-top-right" /><i className="vine-bottom-right" /></div>
        <LanguageSwitcher language={language} onChange={changeLanguage} />
        <section className="lobby-card">
          <div className="lobby-brand"><span>⬡</span> NEW KATAN</div>
          <h1>
            <span className="lobby-title-main">Katan ohne Klaus.</span>
            <span className="lobby-sign-hanger" aria-label="Teubi muss draußen bleiben.">
              <span className="lobby-title-line">Teubi muss draußen bleiben.</span>
            </span>
          </h1>
          <div className="lobby-account"><span><small>Eingeloggt als</small><strong>{name}</strong></span><button type="button" onClick={() => void signOut()}>Abmelden</button></div>
          <div className="lobby-options-grid">
            <button className={`fish-option ${fishTiles.length ? "active" : ""}`} type="button" onClick={cycleFishTiles}>
              <span><b>+ Fisch</b><small>Zufälliger Rohstoff beim Würfeln</small></span>
              <strong>{fishTiles.length}/4</strong>
            </button>
            <button className="victory-option" type="button" onClick={cycleVictoryTarget}>
              <span><b>Siegpunkte</b><small>Ziel für den Spielsieg</small></span>
              <strong>{victoryTarget}</strong>
            </button>
          </div>
          <form onSubmit={createRoom}><button className="lobby-primary" disabled={busy || !name.trim()}>Neues Spiel erstellen</button></form>
          <div className="lobby-divider"><span>oder beitreten</span></div>
          <form className="join-form" onSubmit={joinRoom}>
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase())} placeholder="SPIELCODE" />
            <button disabled={busy || !name.trim() || code.length !== 6}>Beitreten</button>
          </form>
          {error && <p className="lobby-error">{error}</p>}
          <small>Deine Siege werden dauerhaft deinem Spielerprofil gutgeschrieben.</small>
          <HighScoreBoard scores={highScores} currentName={name} />
        </section>
        <div className="lobby-board"><FullBoard fishTiles={fishTiles} previewTiles={boardTiles} /></div>
        <MobileFullscreenButton onClick={() => void openMobileFullscreen()} />
        <MobileInstallPrompt open={showInstallPrompt} showInstructions={showInstallInstructions} canInstall={Boolean(installPromptEvent)} onInstall={() => void installToHomeScreen()} onDismiss={dismissInstallPrompt} />
      </main>
    );
  }

  return (
    <main className="online-shell">
      <div className="frame-vines" aria-hidden="true"><i className="vine-top-right" /><i className="vine-bottom-right" /></div>
      <header className="online-topbar">
        <div className="brand"><span className="brand-mark">⬡</span> NEW KATAN</div>
        <div className={`game-activity activity-${activity.kind}`} aria-live="polite"><span aria-hidden="true" /><strong>{activity.message}</strong></div>
        <div className="topbar-actions">
          <LanguageSwitcher language={language} onChange={changeLanguage} />
          <button className="music-button" type="button" onClick={toggleMusic} aria-label={musicEnabled ? "Musik ausschalten" : "Musik einschalten"} title={musicEnabled ? "Musik ausschalten" : "Musik einschalten"}>{musicEnabled ? "🎵" : "🎵̸"}</button>
          <button className="sound-button" type="button" onClick={toggleSound} aria-label={soundEnabled ? "Ton ausschalten" : "Ton einschalten"} title={soundEnabled ? "Ton ausschalten" : "Ton einschalten"}>{soundEnabled ? "🔊" : "🔇"}</button>
          <button className="leave-game-topbar-button" type="button" onClick={confirmLeaveGame} aria-label="Spiel verlassen" title="Spiel verlassen">×</button>
        </div>
      </header>
      {room.status !== "waiting" && me && (
        <div className="resource-wallet">
          <p className="eyebrow">Deine Rohstoffe</p>
          <div className="resource-list">
            {resourceCards.map(({ key, label }) => (
              <div
                className={`resource-card resource-${key}`}
                key={key}
                title={`${label}: ${me.resources?.[key] ?? 0}`}
                aria-label={`${label}: ${me.resources?.[key] ?? 0}`}
              >
                <span className="resource-badge"><ResourceIcon kind={key} /></span>
                <span className="resource-label">{label}</span>
                <b>{me.resources?.[key] ?? 0}</b>
              </div>
            ))}
          </div>
        </div>
      )}
      <section className="online-layout">
        <div className="online-sidebar">
        <aside className="room-panel card">
          <p className="eyebrow">Spieler · {players.length}/4{room.status !== "waiting" ? ` · Ziel: ${room.victory_target ?? 10} SP` : ""}</p>
          {room.status !== "waiting" && room.state?.phase === "build" && <button className="end-button room-end-button" onClick={endTurn} disabled={!isMyTurn || busy || Boolean(activeCard) || Boolean(room.state?.card_event)}>Zug beenden</button>}
          {players.map((player) => (
            <div className="room-player" key={player.user_id}>
              <span style={{ background: colors[player.player_index] }}>{player.player_name.slice(0, 1).toUpperCase()}</span>
              <strong>{player.player_name}{player.user_id === userId ? " (Du)" : ""}</strong>
              <small>{room.status === "waiting" ? player.player_index + 1 : <>{player.victory_points ?? 2} SP · 🛣 {calculateLongestRoad(player.player_index, room.state?.roads ?? [], room.state?.settlements ?? [])} · ♞ {player.knight_points ?? 0} · 🂠 {cardCounts[player.player_index] ?? 0} · {eliminatedPlayers.includes(player.player_index) ? <span className="player-out">Zuschauer</span> : <>⏱ {formatClock(playerSeconds(player.player_index))}</>}{room.state?.longest_road_holder === player.player_index ? <span className="road-vp"> · Längste Handelsstraße (+2 SP)</span> : null}{room.state?.largest_army_holder === player.player_index ? <span className="army-vp"> · Größte Rittermacht (+2 SP)</span> : null}</>}</small>
            </div>
          ))}
          {room.status === "waiting" && Array.from({ length: 4 - players.length }).map((_, index) => <div className="empty-player" key={index}>Warte auf Spieler …</div>)}
          {room.status !== "waiting" && me && (
            <div className="klaus-hand">
              <p className="eyebrow">Deine Klaus-Karten · {myCards.length}</p>
              {myCards.length === 0 ? <span className="empty-hand">Noch keine Handkarten.</span> : (
                <div className="klaus-hand-list">
                  {myCards.map((card) => {
                    const playableThisTurn = card.must_play || card.bought_round === undefined || card.bought_round < (room.state?.round ?? 1);
                    return <button key={card.id} className={card.must_play ? "must-play" : ""} onClick={() => chooseKlausCard(card)} disabled={!isMyTurn || room.state?.phase !== "build" || Boolean(room.state?.card_event) || !playableThisTurn}>
                    <KlausCardView kind={card.card_type} compact />
                    <span>{card.must_play ? "Muss sofort gespielt werden" : playableThisTurn ? "Karte spielen" : "Ab deinem nächsten Zug spielbar"}</span>
                  </button>;})}
                </div>
              )}
            </div>
          )}
        </aside>
        <section className="online-control-area">
          {room.status === "waiting" ? (
            <div className="waiting-card">
              <strong>{players.length < 2 ? "Warte auf Mitspieler" : "Bereit zum Start"}</strong>
              <span>Teile den Code {room.join_code} oder den Einladungslink · Ziel: {room.victory_target ?? 10} Siegpunkte.</span>
              <button className="copy-button" data-mobile-label={inviteCopied ? "Kopiert ✓" : "Link kopieren"} type="button" onClick={() => void copyInvite()}>{inviteCopied ? "Link kopiert ✓" : "Einladungslink kopieren"}</button>
              {isHost && <button onClick={startGame} disabled={players.length < 2}>Spiel starten</button>}
              <button className="leave-game-button" type="button" onClick={confirmLeaveGame}>Spiel verlassen</button>
              {error && <span className="setup-error">{error}</span>}
            </div>
          ) : room.status === "finished" ? (
            <div className="waiting-card victory-card">
              <span className="victory-crown">♛</span>
              <strong>{players.find((player) => player.player_index === room.state?.winner_player)?.player_name ?? "Ein Spieler"} gewinnt!</strong>
              <span>Das Ziel von {room.victory_target ?? 10} Siegpunkten wurde erreicht.</span>
              <button className="leave-game-button" type="button" onClick={confirmLeaveGame}>Spiel verlassen</button>
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
                <em className="victory-target-chip">Ziel: {room.victory_target ?? 10} SP</em>
              </div>
              {isEliminated && <>
                <div className="player-eliminated-message">Zeit abgelaufen, Klaus dankt. Ciao</div>
                <button className="leave-game-button" type="button" onClick={confirmLeaveGame}>Spiel verlassen</button>
              </>}
              <div className={`turn-timer ${activePlayerSeconds <= 60 ? "urgent" : ""} ${playerClockPaused ? "paused" : ""}`}>
                <div className="turn-timer-track"><span style={{ width: `${Math.max(0, Math.min(100, activePlayerSeconds / 600 * 100))}%` }} /></div>
                <strong>{formatClock(activePlayerSeconds)}</strong>
              </div>
              {room.state?.dice ? (
                <div className="online-dice"><PipDie value={room.state.dice[0]} /><PipDie value={room.state.dice[1]} /></div>
              ) : <span className="turn-note">Der aktive Spieler würfelt einmal.</span>}
              {tradeOffer && <div className="trade-offer-banner">
                <strong>🤝 Handelsangebot</strong>
                <span>{players.find((player) => player.player_index === tradeOffer.from)?.player_name} bietet 1 {resourceCards.find((resource) => resource.key === tradeOffer.give)?.label} gegen 1 {resourceCards.find((resource) => resource.key === tradeOffer.want)?.label} von {players.find((player) => player.player_index === tradeOffer.to)?.player_name}.</span>
                {tradeOffer.to === me?.player_index && <div className="choice-grid"><button onClick={() => void respondToTrade(true)} disabled={isEliminated || busy || (myResources[tradeOffer.want] ?? 0) < 1}>Annehmen</button><button onClick={() => void respondToTrade(false)} disabled={isEliminated || busy}>Ablehnen</button></div>}
                {tradeOffer.from === me?.player_index && <button className="cancel-card" onClick={() => void cancelTrade()} disabled={isEliminated || busy}>Angebot zurückziehen</button>}
              </div>}
              {room.state?.phase === "turn" && !isEliminated && <button onClick={rollDice} disabled={!isMyTurn || busy}>Würfeln</button>}
              {room.state?.phase === "build" && <>
                {activeCard ? (
                  <div className="klaus-action-panel">
                    <KlausCardView kind={activeCard.card_type} compact />
                    {activeCard.card_type === "disappointed" && <><span>Welcher Mitspieler verliert einen Siegpunkt?</span><div className="choice-grid">{players.filter((player) => player.player_index !== me?.player_index).map((player) => <button key={player.player_index} onClick={() => void playKlausCard({ target_player: player.player_index })}>{player.player_name}</button>)}</div></>}
                    {activeCard.card_type === "proud" && <><span>Welchen Rohstoff soll Klaus einsammeln?</span><div className="choice-grid resources-choice">{resourceCards.map((resource) => <button key={resource.key} onClick={() => void playKlausCard({ resource: resource.key })}><ResourceIcon kind={resource.key} />{resource.label}</button>)}</div></>}
                    {activeCard.card_type === "angry" && selectedRobberTile === null && <span>Wähle auf dem Spielfeld das neue Ritterfeld.</span>}
                    {activeCard.card_type === "angry" && selectedRobberTile !== null && <><span>{robberVictims.length ? "Von welchem betroffenen Spieler soll ein zufälliger Rohstoff gezogen werden?" : "An diesem Feld ist kein Mitspieler betroffen."}</span><div className="choice-grid">{robberVictims.map((player) => <button key={player.player_index} onClick={() => void playKlausCard({ tile: selectedRobberTile, target_player: player.player_index })}>{player.player_name}</button>)}{robberVictims.length === 0 && <button onClick={() => void playKlausCard({ tile: selectedRobberTile })}>Ritter hier setzen</button>}<button onClick={() => setSelectedRobberTile(null)}>Anderes Feld</button></div></>}
                    {activeCard.card_type === "stupid" && <span>Wähle auf dem Spielfeld eine deiner Straßen zum Zerstören.</span>}
                    {activeCard.card_type === "sneaky" && <span>Wähle einen freien, direkt an dein Straßennetz angeschlossenen Knoten. Die normalen Baukosten werden abgezogen.</span>}
                    {activeCard.card_type === "desert" && <span>Wähle ein Rohstofffeld, an dem noch niemand gebaut hat.</span>}
                    {activeCard.card_type === "rich" && <button onClick={() => void playKlausCard({})}>Vorrat dauerhaft erweitern</button>}
                    {!activeCard.must_play && <button className="cancel-card" onClick={() => { setSelectedCard(null); setSelectedRobberTile(null); }}>Abbrechen</button>}
                  </div>
                ) : <>
                  <span className="turn-note">{buildMode ? `Wähle jetzt ${buildMode === "road" ? "eine angeschlossene Kante" : buildMode === "settlement" ? "einen erlaubten Bauplatz" : buildMode === "goldmine" ? "eine eigene Siedlung direkt an der Wüste" : "eine eigene Siedlung"} auf dem Spielfeld.` : "Rohstoffe wurden verteilt. Du kannst mehrere Aktionen ausführen."}</span>
                  <div className="build-actions">
                    <button className={buildMode === "road" ? "active" : ""} onClick={() => setBuildMode(buildMode === "road" ? null : "road")} disabled={!isMyTurn || busy || !canBuildRoad || Boolean(forcedCard)}><strong>Straße</strong><small>1 Holz · 1 Lehm</small></button>
                    <button className={buildMode === "settlement" ? "active" : ""} onClick={() => setBuildMode(buildMode === "settlement" ? null : "settlement")} disabled={!isMyTurn || busy || !canBuildSettlement || Boolean(forcedCard)}><strong>Siedlung</strong><small>Holz · Lehm · Wolle · Getreide</small></button>
                    <button className={buildMode === "city" ? "active" : ""} onClick={() => setBuildMode(buildMode === "city" ? null : "city")} disabled={!isMyTurn || busy || !canBuildCity || Boolean(forcedCard)}><strong>Stadt</strong><small>3 Erz · 2 Getreide</small></button>
                    {goldmineUnlocked && <button className={`goldmine-build ${buildMode === "goldmine" ? "active" : ""}`} onClick={() => setBuildMode(buildMode === "goldmine" ? null : "goldmine")} disabled={!isMyTurn || busy || !canBuildGoldmine || Boolean(forcedCard)}><strong>Goldmine</strong><small>2 Lehm · 2 Holz</small></button>}
                    <button className="klaus-buy" onClick={() => void buyKlausCard()} disabled={!isMyTurn || busy || !canCallKlaus || Boolean(forcedCard) || Boolean(room.state?.card_event)}><strong>Klaus rufen</strong><small>1 Erz · 1 Wolle · 1 Getreide</small></button>
                    <button className={tradeMode ? "active trade-toggle" : "trade-toggle"} onClick={() => { setTradeMode(tradeMode ? null : "bank"); resetTradeSelection(); }} disabled={!isMyTurn || busy || Boolean(forcedCard) || Boolean(tradeOffer)}><strong>Handeln</strong><small>{hasHarbor ? "Hafen 3:1" : "Bank 4:1"} · oder Spieler</small></button>
                  </div>
                  {tradeMode && <div className="trade-panel">
                    <div className="trade-tabs"><button className={tradeMode === "bank" ? "active" : ""} onClick={() => { setTradeMode("bank"); resetTradeSelection(); }}>Vorrat {bankTradeRate}:1</button><button className={tradeMode === "player" ? "active" : ""} onClick={() => { setTradeMode("player"); resetTradeSelection(); }}>Spieler 1:1</button></div>
                    {tradeMode === "player" && <div className="trade-step"><span>Mit wem möchtest du handeln?</span><div className="choice-grid">{players.filter((player) => player.player_index !== me?.player_index).map((player) => <button className={tradeTarget === player.player_index ? "selected" : ""} key={player.player_index} onClick={() => setTradeTarget(player.player_index)}>{player.player_name}</button>)}</div></div>}
                    <div className="trade-step"><span>{tradeMode === "bank" ? `${bankTradeRate} gleiche Rohstoffe abgeben` : "1 Rohstoff anbieten"}</span><div className="choice-grid resources-choice">{resourceCards.map((resource) => <button className={tradeGive === resource.key ? "selected" : ""} key={resource.key} onClick={() => setTradeGive(resource.key)} disabled={(myResources[resource.key] ?? 0) < (tradeMode === "bank" ? bankTradeRate : 1)}><ResourceIcon kind={resource.key} />{resource.label} ({myResources[resource.key] ?? 0})</button>)}</div></div>
                    <div className="trade-step"><span>Gewünschten Rohstoff wählen</span><div className="choice-grid resources-choice">{resourceCards.map((resource) => <button className={tradeWant === resource.key ? "selected" : ""} key={resource.key} onClick={() => setTradeWant(resource.key)} disabled={tradeGive === resource.key}><ResourceIcon kind={resource.key} />{resource.label}</button>)}</div></div>
                    {tradeMode === "bank" ? <button className="trade-confirm" onClick={() => void tradeWithBank()} disabled={busy || hasBankTradedThisRound || !tradeGive || !tradeWant}>{hasBankTradedThisRound ? "Diese Runde bereits getauscht" : `${bankTradeRate}:1 mit Vorrat tauschen`}</button> : <button className="trade-confirm" onClick={() => void offerPlayerTrade()} disabled={busy || tradeTarget === null || !tradeGive || !tradeWant}>Angebot senden</button>}
                  </div>}
                </>}
                <div className="dice-statistics">
                  <div className="dice-statistics-heading"><strong>Würfelstatistik</strong><span>{totalRolls} Würfe</span></div>
                  <div className="dice-chart">
                    {diceSums.map((sum) => {
                      const count = diceStats[String(sum)] ?? 0;
                      return <div className={`dice-column ${sum === 6 || sum === 8 ? "hot" : ""}`} key={sum} title={`${sum}: ${count}× gewürfelt`}>
                        <b>{count}</b>
                        <span style={{ height: `${count === 0 ? 2 : Math.max(12, count / highestDiceCount * 100)}%` }} />
                        <small>{sum}</small>
                      </div>;
                    })}
                  </div>
                </div>
              </>}
              {room.state?.phase === "robber" && <div className="robber-action-panel">
                {selectedRobberTile === null ? <span className="turn-note">Eine 7 wurde gewürfelt. {isMyTurn ? "Versetze den Räuber auf ein anderes Feld. Danach ist dein Zug beendet." : `${activePlayer?.player_name ?? "Der aktive Spieler"} versetzt den Räuber und setzt anschließend aus.`}</span> : <>
                  <span className="turn-note">{robberVictims.length ? "Von welchem betroffenen Spieler möchtest du einen zufälligen Rohstoff ziehen?" : "An diesem Feld ist kein Mitspieler betroffen."}</span>
                  <div className="choice-grid">
                    {robberVictims.map((player) => <button key={player.player_index} onClick={() => void moveRobber(player.player_index)} disabled={busy}>{player.player_name}</button>)}
                    {robberVictims.length === 0 && <button onClick={() => void moveRobber()} disabled={busy}>Räuber hierhin setzen</button>}
                    <button onClick={() => setSelectedRobberTile(null)}>Anderes Feld</button>
                  </div>
                </>}
              </div>}
              {room.state?.phase === "discard" && <div className="discard-panel">
                <strong>🃏 Karten wegen der 7 abgeben</strong>
                <span className={`discard-countdown ${discardSeconds <= 3 ? "urgent" : ""}`}>Noch {discardSeconds} Sekunden – danach wird zufällig abgegeben.</span>
                {myDiscard ? <><span>Du musst noch {myDiscard.remaining} Rohstoff{myDiscard.remaining === 1 ? "" : "e"} abgeben. Tippe die Karten einzeln an.</span><div className="discard-resources">{resourceCards.map((resource) => <button key={resource.key} onClick={() => void discardResource(resource.key)} disabled={busy || (myResources[resource.key] ?? 0) < 1}><ResourceIcon kind={resource.key} /><b>{resource.label}</b><span>{myResources[resource.key] ?? 0}</span></button>)}</div></> : <span>Warte, bis alle betroffenen Spieler ihre Karten abgegeben haben.</span>}
              </div>}
              {room.state?.phase === "goldmine" && <div className="goldmine-choice-panel">
                <strong>⛏ Goldmine fördert</strong>
                <span>{isGoldmineChooser ? "Die 7 aktiviert deine Goldmine. Wähle einen beliebigen Rohstoff." : `${players.find((player) => player.player_index === goldmineChooser)?.player_name ?? "Ein Spieler"} wählt einen Goldminen-Rohstoff.`}</span>
                {isGoldmineChooser && <div className="choice-grid resources-choice">{resourceCards.map((resource) => <button key={resource.key} onClick={() => void chooseGoldmineResource(resource.key)} disabled={busy}><ResourceIcon kind={resource.key} />{resource.label}</button>)}</div>}
              </div>}
              {error && <span className="setup-error">{error}</span>}
            </div>
          )}
        </section>
        </div>
        <section className="online-board-area">
          <FullBoard
            room={room}
            myIndex={me?.player_index}
            buildMode={buildMode}
            klausMode={klausMode}
            robberPreviewTile={selectedRobberTile}
            isActiveTurn={isMyTurn}
            onVertex={placeSettlement}
            onEdge={placeRoad}
            onKlausVertex={(vertex) => void playKlausCard({ vertex: vertex.id })}
            onKlausEdge={(edge) => void playKlausCard({ edge: edge.id })}
            onKlausTile={selectRobberTile}
          />
          {longestRoadHolder && <div className="longest-road-badge">🛣 Längste Handelsstraße: <strong>{longestRoadHolder.player_name}</strong> · {room.state?.longest_road_length ?? 5} Straßen · +2 SP</div>}
          {largestArmyHolder && <div className="largest-army-badge">♞ Größte Rittermacht: <strong>{largestArmyHolder.player_name}</strong> · {room.state?.largest_army_size ?? largestArmyHolder.knight_points ?? 3} Ritter · +2 SP</div>}
        </section>
      </section>
      {room.state?.card_event && <div className="klaus-reveal-overlay"><div className="klaus-reveal"><span>{players.find((player) => player.player_index === room.state?.card_event?.player)?.player_name ?? "Ein Spieler"} spielt</span><KlausCardView kind={room.state.card_event.card_type} /></div></div>}
      {showGoldmineUnlock && <div className="goldmine-unlock-overlay"><div className="goldmine-unlock-card"><span className="goldmine-icon">⛏</span><strong>Goldmine für alle freigeschaltet</strong><p>Alle Spieler können sie ab jetzt – unabhängig von ihren eigenen Siegpunkten – aus einer Siedlung an der Wüste entwickeln. Bei einer 7 fördert sie einen frei wählbaren Rohstoff.</p><small>Kosten: 2 Lehm · 2 Holz</small><button onClick={closeGoldmineMessage}>Verstanden</button></div></div>}
      <MobileFullscreenButton onClick={() => void openMobileFullscreen()} />
      <MobileInstallPrompt open={showInstallPrompt} showInstructions={showInstallInstructions} canInstall={Boolean(installPromptEvent)} onInstall={() => void installToHomeScreen()} onDismiss={dismissInstallPrompt} />
    </main>
  );
}

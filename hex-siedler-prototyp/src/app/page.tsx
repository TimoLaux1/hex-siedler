"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";

type Resources = { wood: number; brick: number; wool: number; grain: number; ore: number };
type ResourceKind = keyof Resources;
type Player = { user_id: string | null; player_name: string; player_index: number; color: string; resources?: Resources; victory_points?: number; knight_points?: number; last_bank_trade_round?: number; is_bot?: boolean; road_limit_bonus?: number; settlement_limit_bonus?: number };
type Settlement = { vertex: number; player: number; building?: "settlement" | "city" | "goldmine" };
type Road = { edge: number; a: number; b: number; player: number };
type FishTile = { slot: number; number: number };
type BoardTile = { name: string; className: string; symbol: string; number: number; resource: ResourceKind | "none" };
type TradeOffer = { from: number; to?: number | null; give: ResourceKind; want: ResourceKind; rejected_by?: number[] };
type DiscardEntry = { player: number; remaining: number };
type HighScore = { rank: number; display_name: string; wins: number };
type KlausKind = "disappointed" | "angry" | "proud" | "stupid" | "sneaky" | "desert" | "rich";
type KlausCard = { id: string; card_type: KlausKind; must_play: boolean; bought_round?: number; created_at?: string };
type CardEvent = { card_id: string; card_type: KlausKind; player: number; resolve_at: string };
type BotCardReveal = { card_type: KlausKind; player: number; resolve_at: string };
type GameSoundEvent = { id: number; player_index: number | null; kind: "build" | "klaus"; message: string; card_type?: KlausKind | null };
type ActivityKind = "info" | "turn" | "dice" | "build" | "trade" | "klaus" | "win";
type GameActivity = { message: string; kind: ActivityKind; created_at: string };
type GameState = { round?: number; phase?: string; setup_step?: number; setup_order?: number[]; active_player?: number; winner_player?: number; robber_tile?: number; robber_roller?: number; goldmine_unlocked?: boolean; goldmine_queue?: number[]; discard_queue?: DiscardEntry[]; discard_deadline?: string; player_time_remaining?: Record<string, number>; player_timer_started_at?: string; player_timer_active?: number; eliminated_players?: number[]; turn_deadline?: string; timer_player?: number; timer_paused_at?: string; timer_pause_reason?: string; trade_offer?: TradeOffer; trade_expires_at?: string; dice_stats?: Record<string, number>; longest_road_holder?: number; longest_road_length?: number; largest_army_holder?: number; largest_army_size?: number; card_event?: CardEvent; bot_card_reveal?: BotCardReveal; settlements?: Settlement[]; roads?: Road[]; dice?: number[] };
type Room = { id: string; join_code: string; status: string; created_by: string; state?: GameState; fish_tiles?: FishTile[]; board_tiles?: BoardTile[]; victory_target?: number; version?: number };
type BuildMode = "road" | "settlement" | "city" | "goldmine" | null;
type KlausMapMode = "robber" | "destroy_road" | "sneaky" | "desert" | null;
type CarriageRoute = { vertices: number[]; player: number; run: number; duration: number };
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
  "Eingeloggt als": "Signed in as", "Abmelden": "Sign out",
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
  "Du bist am Zug": "It is your turn", "Zeit abgelaufen. Du bist jetzt Zuschauer": "Time is up. You are now a spectator.", "Der aktive Spieler würfelt einmal.": "The active player rolls once.",
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
  "Goldmine für alle freigeschaltet": "Gold mine unlocked for everyone", "Sobald ein Spieler 8 Siegpunkte erreicht, wird die Goldmine für alle freigeschaltet. Jeder Spieler darf nun eine eigene Siedlung direkt an der Wüste zur Goldmine ausbauen. Wird eine 7 gewürfelt, wählt der Besitzer der Goldmine einen Rohstoff.": "As soon as one player reaches 8 victory points, the gold mine is unlocked for everyone. Each player may then upgrade one of their own settlements directly next to the desert into a gold mine. When a 7 is rolled, the gold mine's owner chooses one resource.",
  "Kosten": "Cost", "Verstanden": "Got it", "Fisch": "Fish", "Gebirge": "Mountains", "Weide": "Pasture", "Feld": "Fields", "Wald": "Forest", "Wüste": "Desert",
  "Enttäuschter Klaus": "Disappointed Klaus", "Ein Mitspieler verliert 1 Siegpunkt.": "Another player loses 1 victory point.", "Böser Klaus": "Angry Klaus", "Versetzt den Ritter und stiehlt einen zufälligen Rohstoff.": "Moves the knight and steals a random resource.",
  "Stolzer Klaus": "Proud Klaus", "Nimmt einen gewählten Rohstoff von allen Mitspielern.": "Takes one chosen resource from every other player.", "Blöder Klaus": "Silly Klaus", "Zerstört sofort eine eigene Straße.": "Immediately destroys one of your own roads.",
  "Sneaky Klaus": "Sneaky Klaus", "Erlaubt eine Siedlung mit nur einer Straße Abstand.": "Allows a settlement only one road away.",
  "Wüster Klaus": "Desert Klaus", "Verwandelt ein unbebautes Rohstofffeld dauerhaft in eine Wüste.": "Permanently turns an undeveloped resource tile into desert.",
  "Reicher Klaus": "Rich Klaus", "Erhöht deinen Vorrat dauerhaft um 2 Straßen und 1 Siedlung.": "Permanently increases your supply by 2 roads and 1 settlement.",
  "Wähle ein Rohstofffeld, an dem noch niemand gebaut hat.": "Choose a resource tile where nobody has built yet.",
  "Vorrat dauerhaft erweitern": "Permanently expand supply",
  "Musik ausschalten": "Turn music off", "Musik einschalten": "Turn music on", "Ton ausschalten": "Turn sound off", "Ton einschalten": "Turn sound on",
  "New Katan installieren": "Install New Katan", "Tippe in Safari unten auf": "In Safari, tap", "Teilen": "Share", "und danach auf": "and then", "„Zum Home-Bildschirm“": "‘Add to Home Screen’",
  "Zum Homebildschirm hinzufügen?": "Add to Home Screen?", "Starte New Katan künftig direkt wie eine App.": "Launch New Katan directly like an app.", "Lege New Katan für den schnellen Zugriff auf deinem Homebildschirm ab.": "Add New Katan to your Home Screen for quick access.", "Hinzufügen": "Add", "Vollbild": "Fullscreen",
  "Die Rache des Klaus Teuber.": "The Revenge of Klaus Teuber."
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

function calculateLongestRoadPath(playerIndex: number, roads: Road[], settlements: Settlement[]) {
  const playerRoads = roads.filter((road) => road.player === playerIndex);
  if (playerRoads.length === 0) return [] as number[];
  const blockedVertices = new Set(settlements.filter((building) => building.player !== playerIndex).map((building) => building.vertex));
  const connected = new Map<number, Road[]>();
  playerRoads.forEach((road) => {
    connected.set(road.a, [...(connected.get(road.a) ?? []), road]);
    connected.set(road.b, [...(connected.get(road.b) ?? []), road]);
  });
  let longest: number[] = [];
  const walk = (vertex: number, usedEdges: Set<number>, path: number[], started: boolean) => {
    if (path.length > longest.length) longest = path;
    if (started && blockedVertices.has(vertex)) return;
    for (const road of connected.get(vertex) ?? []) {
      if (usedEdges.has(road.edge)) continue;
      const nextUsed = new Set(usedEdges);
      nextUsed.add(road.edge);
      const nextVertex = road.a === vertex ? road.b : road.a;
      walk(nextVertex, nextUsed, [...path, nextVertex], true);
    }
  };
  connected.forEach((_, vertex) => walk(vertex, new Set<number>(), [vertex], false));
  return longest;
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
  const fish = (x: number, y: number, scale = 1, flip = false, motion = 1) => <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
    <g className={`ocean-fish ocean-fish-swimmer fish-motion-${motion}`}>
      <path d="M-18 0C-8-13 11-13 23 0 11 13-8 13-18 0Z" />
      <path d="m-17 0-14-11v22Z" />
      <circle cx="15" cy="-2" r="2" />
    </g>
  </g>;
  const dolphin = (x: number, y: number, scale = 1, flip = false) => <g className="ocean-dolphin" transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
    <path d="M-36 9C-17-17 17-22 42-5 27-5 22 2 12 9 0 18-15 18-28 14l-13 10 4-15Z" />
    <path d="M4-10 16-27 19-7M-5 11 8 25 10 8" />
    <circle cx="29" cy="-7" r="1.8" />
  </g>;
  return <svg className="ocean-decorations" viewBox="0 0 610 544" aria-hidden="true">
    {fish(-72, 98, .78, false, 1)}{fish(-118, 145, .48, false, 3)}{fish(-88, 195, .58, true, 2)}
    {fish(686, 92, .65, true, 2)}{fish(724, 142, .46, true, 4)}{fish(692, 205, .52, false, 1)}
    {fish(-98, 455, .62, false, 4)}{fish(701, 462, .7, true, 3)}
    {fish(105, -78, .55, false, 2)}{fish(505, -92, .48, true, 1)}
    {fish(118, 637, .55, true, 3)}{fish(495, 648, .62, false, 4)}
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

function PipDie({ value }: { value?: number }) {
  const visiblePips = value === undefined ? [] : (diePips[value] ?? []);
  return <span className={`pip-die ${value === undefined ? "pending" : ""}`} role="img" aria-label={value === undefined ? "Noch nicht gewürfelt" : `Würfel zeigt ${value}`}>
    {Array.from({ length: 9 }, (_, index) => (
      <span
        aria-hidden="true"
        className={`pip ${visiblePips.includes(index + 1) ? "visible" : ""}`}
        key={index}
      />
    ))}
    {value === undefined && <b aria-hidden="true">?</b>}
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

function BoardFit({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(.8);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => {
      const { width, height } = frame.getBoundingClientRect();
      const padding = Math.min(12, Math.max(4, Math.min(width, height) * .012));
      setScale(Math.max(.2, Math.min(1.55, (width - padding * 2) / 610, (height - padding * 2) / 544)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  return <div className="board-fit" ref={frameRef}>
    <div className="board-fit-stage" style={{ width: 610 * scale, height: 544 * scale, "--board-fit-scale": scale } as CSSProperties}>{children}</div>
  </div>;
}

function SeaVisitor() {
  const [visitor, setVisitor] = useState<{ id: number; kind: "fish" | "whale"; left: number; top: number; flip: boolean } | null>(null);
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const showVisitor = () => {
      const verticalSide = Math.random() < .72;
      const left = verticalSide ? (Math.random() < .5 ? 4 + Math.random() * 13 : 83 + Math.random() * 12) : 20 + Math.random() * 60;
      const top = verticalSide ? 14 + Math.random() * 70 : (Math.random() < .5 ? 5 + Math.random() * 10 : 85 + Math.random() * 9);
      setVisitor({ id: Date.now(), kind: Math.random() < .65 ? "fish" : "whale", left, top, flip: Math.random() < .5 });
      hideTimer = setTimeout(() => setVisitor(null), 10500);
    };
    const firstTimer = setTimeout(showVisitor, 12000);
    const interval = setInterval(showVisitor, 30000);
    return () => { clearTimeout(firstTimer); if (hideTimer) clearTimeout(hideTimer); clearInterval(interval); };
  }, []);
  if (!visitor) return null;
  return <div key={visitor.id} className={`sea-visitor sea-${visitor.kind} ${visitor.flip ? "sea-flip" : ""}`} style={{ left: `${visitor.left}%`, top: `${visitor.top}%` }} aria-hidden="true">
    {visitor.kind === "fish" ? <svg viewBox="0 0 90 48"><path d="M18 24C32 7 59 7 72 24 59 41 32 41 18 24Z"/><path d="M19 24 3 9v30Z"/><circle cx="61" cy="20" r="2.5"/></svg> : <svg viewBox="0 0 150 70"><path d="M20 39C38 12 95 8 125 31 118 55 78 64 43 55 31 52 24 47 20 39Z"/><path d="M24 39 5 23l5 25Z"/><path d="M111 24q15-22 29-8-10 2-13 13Z"/><path className="whale-spout" d="M104 16q-4-12 3-16m2 16q5-11 13-11"/><circle cx="109" cy="34" r="2.7"/></svg>}
  </div>;
}

function SwimmingFishLayer() {
  const swimmers = [
    { left: "8%", top: "18%", size: 34, motion: 1, flip: false },
    { left: "88%", top: "15%", size: 25, motion: 2, flip: true },
    { left: "13%", top: "43%", size: 23, motion: 3, flip: false },
    { left: "91%", top: "39%", size: 31, motion: 4, flip: true },
    { left: "7%", top: "72%", size: 28, motion: 2, flip: false },
    { left: "87%", top: "76%", size: 22, motion: 3, flip: true },
    { left: "24%", top: "88%", size: 19, motion: 4, flip: false },
    { left: "76%", top: "89%", size: 27, motion: 1, flip: true },
  ];
  return <div className="swimming-fish-layer" aria-hidden="true">
    {swimmers.map((fish, index) => <svg
      className={`water-swimmer fish-motion-${fish.motion} ${fish.flip ? "water-swimmer-flip" : ""}`}
      key={index}
      viewBox="0 0 64 34"
      style={{ left: fish.left, top: fish.top, width: fish.size }}
    >
      <path d="M13 17C22 5 43 5 53 17 43 29 22 29 13 17Z" />
      <path d="M14 17 2 6v22Z" />
      <circle cx="45" cy="14" r="1.7" />
    </svg>)}
  </div>;
}

function RoadCarriage({ route }: { route: CarriageRoute }) {
  const points = route.vertices.map((vertexId) => topology.vertices[vertexId]).filter(Boolean);
  const [motion, setMotion] = useState(() => ({ x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, angle: 0 }));
  useEffect(() => {
    if (points.length < 2) return;
    const segments = points.slice(0,-1).map((point,index) => {
      const next = points[index+1];
      return { from: point, to: next, length: Math.hypot(next.x-point.x,next.y-point.y) };
    });
    const totalLength = segments.reduce((sum,segment) => sum+segment.length,0);
    const startedAt = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const progress = Math.min(1,(now-startedAt)/(route.duration*1000));
      let distance = progress*totalLength;
      let segment = segments[segments.length-1];
      for (const candidate of segments) {
        if (distance <= candidate.length) { segment=candidate; break; }
        distance-=candidate.length;
      }
      const part = segment.length ? Math.min(1,distance/segment.length) : 0;
      setMotion({
        x: segment.from.x+(segment.to.x-segment.from.x)*part,
        y: segment.from.y+(segment.to.y-segment.from.y)*part,
        angle: Math.atan2(segment.to.y-segment.from.y,segment.to.x-segment.from.x)*180/Math.PI,
      });
      if (progress<1) frame=requestAnimationFrame(animate);
    };
    frame=requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [route.run]);
  if (points.length<2) return null;
  return <svg className="road-carriage-html" viewBox="-28 -20 56 40" aria-hidden="true" style={{ left: motion.x, top: motion.y, transform: `translate(-50%,-50%) rotate(${motion.angle + 180}deg)` }}>
    <ellipse className="carriage-shadow" cx="0" cy="9" rx="18" ry="4" />
    <g className="carriage-horse"><ellipse cx="-14" cy="-1" rx="8" ry="5"/><circle cx="-21" cy="-6" r="4"/><path d="M-23-9l-2-5 5 4"/></g>
    <path className="carriage-shaft" d="M-9 1H2"/>
    <path className="carriage-body" d="M1-9h18l4 14H-2Z"/>
    <path className="carriage-roof" d="M3-11h15l-3-6H7Z"/>
    <circle className="carriage-wheel" cx="4" cy="8" r="5"/><circle className="carriage-wheel" cx="19" cy="8" r="5"/>
  </svg>;
}

function FullBoard({ room, fishTiles, previewTiles, myIndex, buildMode, klausMode, robberPreviewTile, isActiveTurn, onVertex, onEdge, onKlausVertex, onKlausEdge, onKlausTile }: { room?: Room | null; fishTiles?: FishTile[]; previewTiles?: BoardTile[]; myIndex?: number; buildMode?: BuildMode; klausMode?: KlausMapMode; robberPreviewTile?: number | null; isActiveTurn?: boolean; onVertex?: (vertex: Vertex) => void; onEdge?: (edge: Edge) => void; onKlausVertex?: (vertex: Vertex) => void; onKlausEdge?: (edge: Edge) => void; onKlausTile?: (tile: number) => void }) {
  const state = room?.state;
  const visibleFish = fishTiles ?? room?.fish_tiles ?? [];
  const visibleTerrain = room?.board_tiles ?? previewTiles ?? terrain;
  const settlements = state?.settlements ?? [];
  const roads = state?.roads ?? [];
  const [carriageRoute, setCarriageRoute] = useState<CarriageRoute | null>(null);
  const carriageHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousRoads = useRef<Road[]>(roads);
  const initialRoadHolder = typeof state?.longest_road_holder === "number" ? state.longest_road_holder : undefined;
  const previousLongestRoadHolder = useRef<number | undefined>(initialRoadHolder);
  useEffect(() => {
    if (!room || room.status !== "playing") {
      previousRoads.current = roads;
      previousLongestRoadHolder.current = typeof state?.longest_road_holder === "number" ? state.longest_road_holder : undefined;
      setCarriageRoute(null);
      return;
    }
    const newRoad = roads.find((road) => !previousRoads.current.some((previous) => previous.edge === road.edge));
    const holder = typeof state?.longest_road_holder === "number" ? state.longest_road_holder : undefined;
    const holderChanged = holder !== undefined && holder !== previousLongestRoadHolder.current;
    let route: number[] = [];
    let player: number | undefined;
    let duration = 50;
    if (holderChanged) {
      route = calculateLongestRoadPath(holder, roads, settlements);
      if (route.length - 1 >= 5) {
        player = holder;
        duration = 60;
      }
    }
    if (player === undefined && newRoad) {
      const builtRoute = calculateLongestRoadPath(newRoad.player, roads, settlements);
      if (builtRoute.length - 1 >= 3) {
        route = builtRoute;
        player = newRoad.player;
        duration = 50;
      }
    }
    previousRoads.current = roads;
    previousLongestRoadHolder.current = holder;
    if (player === undefined) return;
    const direction = Math.random() < .5 ? route : [...route].reverse();
    const run = Date.now();
    setCarriageRoute({ vertices: direction, player, run, duration });
    if (carriageHideTimer.current) clearTimeout(carriageHideTimer.current);
    carriageHideTimer.current = setTimeout(() => setCarriageRoute((active) => active?.run === run ? null : active), duration * 1000 + 500);
  }, [room?.id, room?.status, roads, settlements, state?.longest_road_holder]);
  useEffect(() => () => { if (carriageHideTimer.current) clearTimeout(carriageHideTimer.current); }, []);
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
            <text className="svg-name" x={x} y={y + 37}>Fisch</text>
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
            {room && (robberPreviewTile ?? state?.robber_tile ?? 9) === index && room.status !== "waiting" && <g className="robber-marker" transform={`translate(${x + 16} ${y - 13})`} aria-label="Räuber">
              <g className="robber-walk">
                <animateTransform attributeName="transform" type="translate" values="-7 1;-7 1;7 1;7 1;-7 1" keyTimes="0;.2857;.5;.7857;1" dur="70s" repeatCount="indefinite"/>
                <ellipse className="robber-shadow" cx="1" cy="15" rx="16" ry="4"/>
                <ellipse className="robber-sack" cx="10" cy="-1" rx="11" ry="14" transform="rotate(-24 10 -1)"/>
                <path className="robber-cloak" d="M-9-5Q-3-14 5-8L10 12H-11Z"/>
                <circle className="robber-head" cx="-5" cy="-14" r="6"/>
                <path className="robber-hood" d="M-13-15Q-7-26 2-18L1-10Q-7-14-13-9Z"/>
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
      </svg>
      {carriageRoute && <RoadCarriage route={carriageRoute} />}
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
        return <button key={`vertex-${vertex.id}`} className={`setup-vertex ${selectable ? "selectable" : ""} ${built ? "built" : ""} ${built?.building === "city" ? "city" : ""} ${built?.building === "goldmine" || goldmineSelectable ? "goldmine" : ""} ${klausSelectable ? "klaus-sneaky" : ""}`} style={{ left: vertex.x, top: vertex.y, color: built ? colors[built.player] : undefined }} onClick={() => klausSelectable ? onKlausVertex?.(vertex) : selectable && onVertex?.(vertex)} aria-label={klausSelectable ? "Sneaky-Siedlung setzen" : citySelectable ? "Zur Stadt ausbauen" : goldmineSelectable ? "Zur Goldmine ausbauen" : "Siedlung setzen"}>{built ? <span className={`building-piece building-${buildingKind}`} aria-hidden="true"><i className="building-halo"/><i className="building-chimney"/><i className="building-smoke smoke-one"/><i className="building-smoke smoke-two"/><i className="building-flagpole"/><i className="building-flag"/><i className="building-roof"/><i className="building-body"/><i className="building-door"/><i className="building-window"/><i className="city-hut-roof"/><i className="city-hut-body"/><i className="city-hut-door"/></span> : klausSelectable ? "🥸" : "+"}</button>;
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

function OrientationPrompt() {
  return (
    <aside className="orientation-overlay" role="status" aria-label="Smartphone ins Querformat drehen">
      <div className="orientation-card">
        <div className="orientation-brand"><span>⬡</span><b>NEW KATAN</b></div>
        <div className="orientation-illustration" aria-hidden="true">
          <i className="orientation-arrow">↻</i>
          <i className="orientation-phone"><span>⬡</span><span>⬡</span><span>⬡</span></i>
        </div>
        <div className="orientation-copy">
          <span className="orientation-kicker">BEREIT ZUM SPIELEN</span>
          <strong>Smartphone drehen</strong>
          <p>Wechsle ins Querformat, damit du das gesamte Spielfeld und alle Bedienelemente siehst.</p>
        </div>
        <small>Die Ansicht öffnet sich anschließend automatisch.</small>
      </div>
    </aside>
  );
}

const introFishTiles: FishTile[] = [
  { slot: 0, number: 4 },
  { slot: 1, number: 9 },
  { slot: 2, number: 10 },
  { slot: 3, number: 5 },
];

const introRoom: Room = {
  id: "intro",
  join_code: "INTRO",
  status: "playing",
  created_by: "",
  board_tiles: terrain,
  fish_tiles: introFishTiles,
  state: {
    robber_tile: 9,
    settlements: [
      { vertex: 7, player: 0, building: "settlement" },
      { vertex: 20, player: 1, building: "city" },
      { vertex: 31, player: 2, building: "goldmine" },
      { vertex: 44, player: 3, building: "settlement" },
    ],
    roads: [],
  },
};

function OpeningIntro({ fading }: { fading: boolean }) {
  return (
    <main className={`opening-intro ${fading ? "is-fading" : ""}`} aria-label="New Katan Intro">
      <div className="opening-intro-water" aria-hidden="true">
        <SwimmingFishLayer />
        <div className="opening-intro-board"><BoardFit><FullBoard room={introRoom} fishTiles={introFishTiles} /></BoardFit></div>
        <div className="opening-intro-glow" />
      </div>
      <section className="opening-intro-title">
        <span className="opening-intro-mark">⬡</span>
        <h1>New Katan.</h1>
        <p>Die Rache des Klaus Teuber.</p>
      </section>
      <div className="opening-intro-mist" aria-hidden="true" />
    </main>
  );
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
  const [showOpeningIntro, setShowOpeningIntro] = useState(true);
  const [openingIntroFading, setOpeningIntroFading] = useState(false);
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
  const [joinedAsSpectator, setJoinedAsSpectator] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myCards, setMyCards] = useState<KlausCard[]>([]);
  const [cardCounts, setCardCounts] = useState<Record<number, number>>({});
  const [resourceCounts, setResourceCounts] = useState<Record<number, number>>({});
  const [resourceGains, setResourceGains] = useState<Partial<Record<ResourceKind, { amount: number; nonce: number }>>>({});
  const previousResources = useRef<{ gameId: string; values: Resources } | null>(null);
  const resourceGainTimers = useRef<Partial<Record<ResourceKind, ReturnType<typeof setTimeout>>>>({});
  const [selectedCard, setSelectedCard] = useState<KlausCard | null>(null);
  const [selectedRobberTile, setSelectedRobberTile] = useState<number | null>(null);
  const [showGoldmineUnlock, setShowGoldmineUnlock] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [localDiscardDeadline, setLocalDiscardDeadline] = useState<number | null>(null);
  const [tradeMode, setTradeMode] = useState<"bank" | "player" | null>(null);
  const [tradeGive, setTradeGive] = useState<ResourceKind | null>(null);
  const [tradeWant, setTradeWant] = useState<ResourceKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildMode, setBuildMode] = useState<BuildMode>(null);
  const [error, setError] = useState(supabase ? "" : "Supabase ist noch nicht mit der App verbunden.");
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [activity, setActivity] = useState<GameActivity>({ message: "Willkommen bei New Katan.", kind: "info", created_at: "" });
  const [showLongestRoadAward, setShowLongestRoadAward] = useState(false);
  const [showLargestArmyAward, setShowLargestArmyAward] = useState(false);
  const [botDiagnostic, setBotDiagnostic] = useState("");
  const [showBotDiagnostic, setShowBotDiagnostic] = useState(false);
  const [remoteCardReveal, setRemoteCardReveal] = useState<BotCardReveal | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const playerTimerInitialized = useRef(new Set<string>());
  const audioContext = useRef<AudioContext | null>(null);
  const musicPlayer = useRef<HTMLAudioElement | null>(null);
  const musicTrack = useRef(0);
  const lastPlayedActivity = useRef("");
  const lastPlayedActivityAt = useRef(0);
  const lastSeenRemoteActivity = useRef("");
  const lastKlausVoiceAt = useRef(0);
  const playedGameEndSound = useRef<string | null>(null);
  const lastSoundEventId = useRef<Record<string, number>>({});
  const remoteCardRevealTimer = useRef<number | null>(null);
  const botActionPending = useRef(false);
  const automaticDiscardPending = useRef(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setOpeningIntroFading(true), 7000);
    const hideTimer = window.setTimeout(() => setShowOpeningIntro(false), 8000);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

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
  const botCount = players.filter((player) => player.is_bot).length;
  const diagnosticSetupStep = room?.state?.setup_step ?? 0;
  const diagnosticSetupPlayer = room?.state?.setup_order?.[diagnosticSetupStep];
  const diagnosticExpectedPlayer = players.find((player) => player.player_index === diagnosticSetupPlayer);
  const diagnosticActivePlayer = players.find((player) => player.player_index === room?.state?.active_player);
  useEffect(() => {
    if (!room?.id || !me?.resources) {
      previousResources.current = null;
      setResourceGains({});
      return;
    }
    const current: Resources = {
      wood: Number(me.resources.wood ?? 0),
      brick: Number(me.resources.brick ?? 0),
      wool: Number(me.resources.wool ?? 0),
      grain: Number(me.resources.grain ?? 0),
      ore: Number(me.resources.ore ?? 0),
    };
    const previous = previousResources.current;
    previousResources.current = { gameId: room.id, values: current };
    if (!previous || previous.gameId !== room.id) return;

    const gains: Partial<Record<ResourceKind, { amount: number; nonce: number }>> = {};
    resourceCards.forEach(({ key }) => {
      const amount = current[key] - previous.values[key];
      if (amount === 0) return;
      const nonce = Date.now() + resourceCards.findIndex((resource) => resource.key === key);
      gains[key] = { amount, nonce };
      const oldTimer = resourceGainTimers.current[key];
      if (oldTimer) clearTimeout(oldTimer);
      resourceGainTimers.current[key] = setTimeout(() => {
        setResourceGains((active) => {
          if (active[key]?.nonce !== nonce) return active;
          const next = { ...active };
          delete next[key];
          return next;
        });
        delete resourceGainTimers.current[key];
      }, 5400);
    });
    if (Object.keys(gains).length) setResourceGains((active) => ({ ...active, ...gains }));
  }, [room?.id, me?.resources?.wood, me?.resources?.brick, me?.resources?.wool, me?.resources?.grain, me?.resources?.ore]);

  useEffect(() => () => {
    Object.values(resourceGainTimers.current).forEach((timer) => timer && clearTimeout(timer));
  }, []);
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
  const activeRoadLimit = (room?.victory_target ?? 10) >= 13 ? 17 : 15;
  const activeSettlementLimit = (room?.victory_target ?? 10) >= 13 ? 6 : 5;
  const activeRoadsBuilt = (room?.state?.roads ?? []).filter((road) => road.player === activePlayerIndex).length;
  const activeSettlementsBuilt = (room?.state?.settlements ?? []).filter((building) =>
    building.player === activePlayerIndex && (building.building === undefined || building.building === "settlement")
  ).length;
  const activeCitiesBuilt = (room?.state?.settlements ?? []).filter((building) =>
    building.player === activePlayerIndex && building.building === "city"
  ).length;
  const activeRoadsRemaining = Math.max(0, activeRoadLimit + (activePlayer?.road_limit_bonus ?? 0) - activeRoadsBuilt);
  const activeSettlementsRemaining = Math.max(0, activeSettlementLimit + (activePlayer?.settlement_limit_bonus ?? 0) - activeSettlementsBuilt);
  const activeCitiesRemaining = Math.max(0, 4 - activeCitiesBuilt);
  const playerTimersReady = Boolean(room?.state?.player_time_remaining);
  const activePlayerIsBot = Boolean(activePlayer?.is_bot);
  const playerClockPaused = Boolean(activePlayerIsBot || room?.state?.timer_paused_at || room?.state?.card_event || room?.state?.phase === "discard" || room?.state?.phase === "goldmine" || room?.state?.phase?.startsWith("setup_"));
  const storedActiveSeconds = activePlayerIndex === undefined ? 600 : Number(room?.state?.player_time_remaining?.[String(activePlayerIndex)] ?? 600);
  const activeClockElapsed = !playerClockPaused && room?.state?.player_timer_active === activePlayerIndex && room?.state?.player_timer_started_at
    ? Math.max(0, (clockNow - new Date(room.state.player_timer_started_at).getTime()) / 1000)
    : 0;
  const activePlayerSeconds = Math.max(0, storedActiveSeconds - activeClockElapsed);
  const playerSeconds = (playerIndex: number) => {
    if (players.find((player) => player.player_index === playerIndex)?.is_bot) return 600;
    if (playerIndex === activePlayerIndex) return activePlayerSeconds;
    return Math.max(0, Number(room?.state?.player_time_remaining?.[String(playerIndex)] ?? 600));
  };
  const discardDeadline = room?.state?.discard_deadline
    ? new Date(room.state.discard_deadline).getTime()
    : localDiscardDeadline;
  const discardSeconds = discardDeadline ? Math.max(0, Math.ceil((discardDeadline - clockNow) / 1000)) : 10;
  const hasHarbor = (room?.state?.settlements ?? []).some((building) => building.player === me?.player_index && harbors.some((harbor) => harbor.vertices.includes(building.vertex)));
  const bankTradeRate = hasHarbor ? 3 : 4;
  const robberVictimsForTile = (tile: number) => players.filter((player) =>
    player.player_index !== me?.player_index && (resourceCounts[player.player_index] ?? 0) > 0 && (room?.state?.settlements ?? []).some((settlement) =>
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
    call.volume = 1;
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
      if (kind === "klaus" && (
        normalizedMessage.includes("ruft klaus")
        || normalizedMessage.includes("kauft eine klaus-karte")
        || normalizedMessage.includes("buys a klaus card")
      )) speakKlaus();

      if (kind === "win") {
        const endSoundKey = room?.id ?? normalizedMessage;
        if (playedGameEndSound.current === endSoundKey) return;
        playedGameEndSound.current = endSoundKey;

        const ownName = me?.player_name?.toLocaleLowerCase("de") ?? "";
        const didIWin = room?.state?.winner_player !== undefined
          ? room.state.winner_player === me?.player_index
          : Boolean(ownName && normalizedMessage.startsWith(ownName));
        const endNotes = didIWin
          ? [523.25, 659.25, 783.99, 1046.5]
          : [392, 349.23, 293.66, 261.63];

        endNotes.forEach((frequency, index) => {
          const start = context.currentTime + index * (didIWin ? .14 : .2);
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = didIWin ? "triangle" : "sine";
          oscillator.frequency.setValueAtTime(frequency, start);
          gain.gain.setValueAtTime(.0001, start);
          gain.gain.exponentialRampToValueAtTime(didIWin ? .16 : .105, start + .025);
          gain.gain.exponentialRampToValueAtTime(.0001, start + (didIWin ? .24 : .34));
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + (didIWin ? .25 : .35));
        });
        return;
      }
      const woodenHit = (delay: number, pitch = 118, volume = .16) => {
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
          woodenHit(0, 142, .13);
          woodenHit(.11, 126, .12);
        } else if (normalizedMessage.includes("goldmine")) {
          woodenHit(0, 175, .14);
          woodenHit(.13, 230, .15);
          woodenHit(.27, 155, .13);
        } else {
          woodenHit(0, 112, .16);
          woodenHit(.14, 126, .15);
          woodenHit(.29, normalizedMessage.includes("stadt") ? 158 : 108, .17);
        }
        return;
      }

      if (kind === "dice") {
        [0, .045, .09, .145, .205].forEach((delay, index) => woodenHit(delay, 185 + index * 19, .075));
        return;
      }

      notes[kind].forEach((frequency, index) => {
        const start = context.currentTime + index * .075;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = kind === "klaus" ? "sawtooth" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.085, start + .012);
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
      player.volume = .09;
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

  function toggleFishTiles() {
    if (fishTiles.length === 4) {
      setFishTiles([]);
      return;
    }
    const slots = fishCenters.map((_, slot) => slot).sort(() => Math.random() - .5).slice(0, 4);
    setFishTiles(slots.map((slot) => ({
      slot,
      number: fishNumbers[Math.floor(Math.random() * fishNumbers.length)],
    })));
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
    if (typeof window === "undefined") return;
    // Ein Einladungslink darf den Code vorbelegen, soll aber weder den Raum
    // automatisch oeffnen noch beim naechsten Seitenaufruf erhalten bleiben.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const roomId = room?.id;

  useEffect(() => {
    setActivity({ message: "Willkommen bei New Katan.", kind: "info", created_at: "" });
    lastSeenRemoteActivity.current = "";
    lastPlayedActivity.current = "";
    lastPlayedActivityAt.current = 0;
  }, [roomId]);

  useEffect(() => {
    if (room?.state?.longest_road_holder === undefined || room?.state?.longest_road_holder === null) {
      setShowLongestRoadAward(false);
      return;
    }
    setShowLongestRoadAward(true);
    const timer = window.setTimeout(() => setShowLongestRoadAward(false), 30000);
    return () => window.clearTimeout(timer);
  }, [roomId, room?.state?.longest_road_holder]);

  useEffect(() => {
    if (room?.state?.largest_army_holder === undefined || room?.state?.largest_army_holder === null) {
      setShowLargestArmyAward(false);
      return;
    }
    setShowLargestArmyAward(true);
    const timer = window.setTimeout(() => setShowLargestArmyAward(false), 30000);
    return () => window.clearTimeout(timer);
  }, [roomId, room?.state?.largest_army_holder]);

  async function loadPlayerData(gameId: string) {
    const client = supabase;
    if (!client) return;
    const { data, error: playersError } = await client.rpc("get_game_players_with_bots", { p_game_id: gameId });
    if (playersError) {
      setError(playersError.message);
      return;
    }
    setPlayers((data as Player[]) ?? []);
    const [{ data: handData }, { data: countData }, { data: resourceCountData }] = await Promise.all([
      client.rpc("get_my_klaus_cards", { p_game_id: gameId }),
      client.rpc("get_game_card_counts", { p_game_id: gameId }),
      client.rpc("get_game_resource_counts", { p_game_id: gameId }),
    ]);
    setMyCards((handData as KlausCard[]) ?? []);
    setCardCounts(Object.fromEntries(((countData as { player_index: number; card_count: number }[]) ?? []).map((item) => [item.player_index, item.card_count])));
    setResourceCounts(Object.fromEntries(((resourceCountData as { player_index: number; resource_count: number }[]) ?? []).map((item) => [item.player_index, item.resource_count])));
  }

  useEffect(() => {
    const isSetupPhase = room?.state?.phase?.startsWith("setup_") ?? false;
    const setupJustFinished = room?.status === "setup" && ["turn", "build", "robber", "discard", "goldmine"].includes(room?.state?.phase ?? "");
    if (!supabase || !room?.id || (room.status !== "playing" && !isSetupPhase && !setupJustFinished)) {
      setBotDiagnostic("");
      return;
    }
    const gameId = room.id;
    // Der Host stößt den Bot robust alle drei Sekunden an. Die RPC selbst
    // verändert das Spiel nur, wenn tatsächlich eine Bot-Aktion ansteht.
    const runBotTick = async () => {
      if (!supabase || botActionPending.current) return;
      botActionPending.current = true;
      setBotDiagnostic(`Bot-RPC wird aufgerufen · ${new Date().toLocaleTimeString("de-DE")}`);
      try {
        const { data, error: botError } = await supabase.rpc("run_game_bot_until_human", { p_game_id: gameId });
        if (botError) {
          const diagnostic = `Bot-RPC Fehler: ${botError.message}`;
          setBotDiagnostic(diagnostic);
          setError(diagnostic);
        } else if (data) {
          const nextRoom = normalizedRoom(data);
          setRoom(nextRoom);
          setBotDiagnostic(`Bot-RPC erfolgreich · Phase: ${nextRoom.state?.phase ?? "unbekannt"} · ${new Date().toLocaleTimeString("de-DE")}`);
          setError((current) => current.startsWith("Bot-RPC Fehler:") ? "" : current);
        } else {
          setBotDiagnostic(`Bot-RPC ohne Ergebnis · ${new Date().toLocaleTimeString("de-DE")}`);
        }
        await loadPlayerData(gameId);
      } catch (botFailure) {
        const message = botFailure instanceof Error ? botFailure.message : "Netzwerkfehler";
        setBotDiagnostic(`Bot-RPC Netzwerkfehler: ${message}`);
        setError("Der Bot-Zug konnte nicht geladen werden. Der nächste automatische Versuch läuft gleich.");
      } finally {
        botActionPending.current = false;
      }
    };
    setBotDiagnostic(`Bot-Timer aktiv · Status: ${room.status} · Phase: ${room.state?.phase ?? "unbekannt"}`);
    const timer = window.setInterval(runBotTick, 3000);
    return () => window.clearInterval(timer);
  }, [room?.id, room?.status, room?.state?.phase]);

  async function addBot() {
    if (!supabase || !room || !isHost || botCount >= 2) return;
    setBusy(true); setError("");
    const { data, error: botError } = await supabase.rpc("add_game_bot", { p_game_id: room.id });
    if (botError) setError(botError.message); else if (data) setRoom(normalizedRoom(data));
    await loadPlayerData(room.id);
    setBusy(false);
  }

  async function removeBot(playerIndex: number) {
    if (!supabase || !room || !isHost) return;
    setBusy(true); setError("");
    const { data, error: botError } = await supabase.rpc("remove_game_bot", { p_game_id: room.id, p_player_index: playerIndex });
    if (botError) setError(botError.message); else if (data) setRoom(normalizedRoom(data));
    await loadPlayerData(room.id);
    setBusy(false);
  }

  useEffect(() => {
    const client = supabase;
    if (!roomId || !client) return;
    let cancelled = false;
    const applyRemoteActivity = (next: GameActivity, playSound: boolean) => {
      if (cancelled || !next?.message) return;
      const activityKey = `${next.created_at}|${next.message}`;
      if (activityKey === lastSeenRemoteActivity.current) return;
      lastSeenRemoteActivity.current = activityKey;
      const isKlausPurchase = next.kind === "klaus"
        && /kauft eine klaus-karte|buys a klaus card/i.test(next.message);
      showActivity(next, playSound && next.kind !== "build" && (next.kind !== "klaus" || isKlausPurchase));
    };
    const loadActivity = async () => {
      const { data } = await client.rpc("get_latest_game_activity", { p_game_id: roomId });
      const latest = (Array.isArray(data) ? data[0] : data) as GameActivity | null;
      // Beim Raumwechsel alte/gespeicherte Meldungen nur als Ausgangspunkt
      // merken. Sichtbar bleibt "Willkommen", bis wirklich etwas Neues passiert.
      if (!cancelled && latest?.message) lastSeenRemoteActivity.current = `${latest.created_at}|${latest.message}`;
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
      cancelled = true;
      window.clearInterval(activityPoll);
      client.removeChannel(channel);
    };
  }, [roomId, soundEnabled]);

  useEffect(() => {
    const client = supabase;
    if (!roomId || !client) return;
    let cancelled = false;

    const pollSounds = async (initialize = false) => {
      const afterId = initialize ? -1 : (lastSoundEventId.current[roomId] ?? 0);
      const { data } = await client.rpc("get_game_sound_events", { p_game_id: roomId, p_after_id: afterId });
      if (cancelled || !Array.isArray(data)) return;
      const events = data as GameSoundEvent[];
      if (initialize) {
        lastSoundEventId.current[roomId] = events.reduce((max,event) => Math.max(max,event.id),afterId);
        return;
      }
      for (const event of events) {
        lastSoundEventId.current[roomId] = Math.max(lastSoundEventId.current[roomId] ?? 0,event.id);
        if (event.player_index === me?.player_index) continue;
        if (soundEnabled) playActivitySound(event.kind,event.message);
        if (event.card_type && event.player_index !== null) {
          setRemoteCardReveal({ card_type: event.card_type, player: event.player_index, resolve_at: new Date(Date.now()+3500).toISOString() });
          if (remoteCardRevealTimer.current) window.clearTimeout(remoteCardRevealTimer.current);
          remoteCardRevealTimer.current = window.setTimeout(() => setRemoteCardReveal(null),3500);
        }
      }
    };

    void pollSounds(true);
    const timer = window.setInterval(() => void pollSounds(),500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (remoteCardRevealTimer.current) window.clearTimeout(remoteCardRevealTimer.current);
    };
  }, [roomId, soundEnabled, me?.player_index]);

  useEffect(() => {
    if (!soundEnabled || room?.status !== "finished" || room.state?.winner_player === undefined) return;
    const winnerName = players.find((player) => player.player_index === room.state?.winner_player)?.player_name ?? "Ein Spieler";
    playActivitySound("win", `${winnerName} gewinnt das Spiel!`);
  }, [room?.id, room?.status, room?.state?.winner_player, soundEnabled, me?.player_index, players]);

  useEffect(() => {
    const client = supabase;
    if (!roomId || !client) return;
    const loadPlayers = () => loadPlayerData(roomId);
    const loadRoom = async () => {
      const { data } = await client.rpc(joinedAsSpectator ? "get_spectator_game_room" : "get_game_room", { p_game_id: roomId });
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
  }, [joinedAsSpectator, roomId]);

  useEffect(() => {
    if (!roomId || room?.status !== "playing") return;
    const clock = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(clock);
  }, [roomId, room?.status]);

  useEffect(() => {
    if (room?.state?.phase !== "discard") {
      setLocalDiscardDeadline(null);
      automaticDiscardPending.current = false;
      return;
    }
    if (!room.state.discard_deadline && localDiscardDeadline === null) {
      setLocalDiscardDeadline(Date.now() + 10_000);
    }
  }, [localDiscardDeadline, room?.state?.discard_deadline, room?.state?.phase]);

  useEffect(() => {
    const client = supabase;
    if (!client || !room?.id || room.state?.phase !== "discard" || !myDiscard || discardSeconds > 0 || automaticDiscardPending.current) return;
    automaticDiscardPending.current = true;
    void (async () => {
      try {
        const { data, error: discardError } = await client.rpc("auto_discard_seven_resources", { p_game_id: room.id });
        if (discardError) {
          setError(`Automatische Abgabe fehlgeschlagen: ${discardError.message}`);
          return;
        }
        if (data) setRoom(normalizedRoom(data));
        announceActivity("discard", `${me?.player_name ?? name} gibt die übrigen Rohstoffe automatisch ab.`, "klaus");
        await loadPlayerData(room.id);
      } finally {
        automaticDiscardPending.current = false;
      }
    })();
  }, [discardSeconds, myDiscard?.remaining, room?.id, room?.state?.phase]);

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
    if (!client || !roomId || room?.status !== "playing" || !playerTimersReady || activePlayer?.is_bot) return;
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
  }, [activePlayer?.is_bot, activePlayerIndex, playerTimersReady, roomId, room?.status]);

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
    setRoom(null);
    setJoinedAsSpectator(false);
    setCode("");
    setPlayers([]);
    setHighScores([]);
    setOtp("");
    setOtpSent(false);
    setUserId("");
    setName("");
  }

  function leaveGame() {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    setRoom(null);
    setJoinedAsSpectator(false);
    setCode("");
    setPlayers([]);
    setMyCards([]);
    setCardCounts({});
    setResourceCounts({});
    setSelectedCard(null);
    setSelectedRobberTile(null);
    setTradeMode(null);
    setTradeGive(null);
    setTradeWant(null);
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
      setJoinedAsSpectator(false);
      setRoom({ id: result.game_id, join_code: result.join_code, status: "waiting", created_by: userId, fish_tiles: fishTiles, board_tiles: boardTiles, victory_target: victoryTarget });
    }
    setBusy(false);
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !name.trim() || code.length !== 6) return;
    setBusy(true); setError("");

    const normalizedCode = code.toUpperCase();
    // Abgelaufene Räume werden vor einem erneuten Beitrittsversuch geschlossen.
    // Auf Installationen ohne v39 ist der optionale Aufruf rückwärtskompatibel.
    await supabase.rpc("expire_game_room_by_code", { p_join_code: normalizedCode });
    const { data: resumedData, error: resumeError } = await supabase.rpc("resume_my_game_room", { p_join_code: normalizedCode });
    const resumedRoom = (Array.isArray(resumedData) ? resumedData[0] : resumedData) as Room | null;
    if (!resumeError && resumedRoom?.id) {
      setJoinedAsSpectator(false);
      setRoom(resumedRoom);
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
        const spectator = result.player_index === -1;
        const { data: gameData, error: gameError } = await supabase.rpc(spectator ? "get_spectator_game_room" : "get_game_room", { p_game_id: result.game_id });
        const game = Array.isArray(gameData) ? gameData[0] : gameData;
        if (gameError) setError(gameError.message);
        else if (!game) setError("Der Spielraum konnte nach dem Beitritt nicht geladen werden.");
        else {
          setJoinedAsSpectator(spectator);
          setRoom(game as Room);
        }
      }
    }
    setBusy(false);
  }

  function normalizedRoom(data: unknown) {
    return (Array.isArray(data) ? data[0] : data) as Room;
  }

  async function startGame() {
    if (!supabase || !room || players.length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: setupError } = await supabase.rpc("start_game_setup_random", { p_game_id: room.id });
      if (setupError) {
        setError(setupError.message);
        return;
      }
      const startedRoom = normalizedRoom(data);
      if (!startedRoom?.id) {
        setError("Das Spiel konnte nicht gestartet werden. Bitte versuche es erneut.");
        return;
      }
      setRoom(startedRoom);
      const firstPlayer = players.find((player) => player.player_index === startedRoom.state?.active_player)?.player_name ?? me?.player_name ?? name;
      announceActivity("turn", `${firstPlayer} beginnt die Aufbauphase.`, "turn", firstPlayer);
      const { data: timedRoom, error: timerError } = await supabase.rpc("ensure_player_game_timer", { p_game_id: room.id });
      if (timerError) setError(timerError.message);
      else if (timedRoom) setRoom(normalizedRoom(timedRoom));
      await loadPlayerData(room.id);
    } finally {
      setBusy(false);
    }
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
    else if (rpcName === "place_setup_settlement") {
      const nextRoom = normalizedRoom(data);
      if (nextRoom?.id) {
        setRoom(nextRoom);
        announceActivity("settlement", `${me?.player_name ?? name} baut eine Siedlung.`, "build");
        await loadPlayerData(room.id);
      } else {
        setError("Die Startsiedlung wurde nicht bestätigt. Bitte versuche es erneut.");
      }
    } else {
      const { data: roadAwardData, error: roadAwardError } = await supabase.rpc("refresh_longest_road", { p_game_id: room.id });
      if (roadAwardError) setError(roadAwardError.message);
      const { data: winnerData, error: winnerError } = await supabase.rpc("check_game_winner", { p_game_id: room.id });
      if (winnerError) setError(winnerError.message);
      const nextRoom = normalizedRoom(winnerData ?? roadAwardData ?? data);
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
    else if (rpcName === "place_setup_road") {
      const nextRoom = normalizedRoom(data);
      if (nextRoom?.id) {
        setRoom(nextRoom);
        announceActivity("road", `${me?.player_name ?? name} baut eine Straße.`, "build");
        await loadPlayerData(room.id);
      } else {
        setError("Die Startstraße wurde nicht bestätigt. Bitte versuche es erneut.");
      }
    } else {
      const { data: roadAwardData, error: roadAwardError } = await supabase.rpc("refresh_longest_road", { p_game_id: room.id });
      if (roadAwardError) setError(roadAwardError.message);
      const nextRoom = normalizedRoom(roadAwardData ?? data);
      setRoom(nextRoom);
      setBuildMode(null);
      if (nextRoom.state?.winner_player === me?.player_index) announceActivity("win", `${me?.player_name ?? name} gewinnt das Spiel!`, "win");
      else announceActivity("road", `${me?.player_name ?? name} baut eine Straße.`, "build");
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
    if (victims.length === 1) {
      if (activeCard?.card_type === "angry") {
        void playKlausCard({ tile, target_player: victims[0].player_index });
      } else {
        void moveRobber(victims[0].player_index, tile);
      }
      return;
    }
    if (victims.length > 1) {
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
    if (!supabase || !room || !tradeGive || !tradeWant || tradeGive === tradeWant) return;
    setBusy(true); setError("");
    const { data, error: tradeError } = await supabase.rpc("offer_player_trade", { p_game_id: room.id, p_target_player: null, p_give: tradeGive, p_want: tradeWant });
    if (tradeError) setError(tradeError.message);
    else {
      let nextRoom = normalizedRoom(data);
      const offerMessage = `${me?.player_name ?? name} bietet einen Handel an.`;
      showActivity({ message: offerMessage, kind: "trade", created_at: new Date().toISOString() });
      await supabase.rpc("record_game_activity", { p_game_id: room.id, p_action: "trade_offer", p_detail: null });
      if (players.some((player) => player.is_bot)) {
        const { data: botTradeData, error: botTradeError } = await supabase.rpc("resolve_bot_trade_offer", { p_game_id: room.id });
        if (botTradeError) setError(`Bot-Handel fehlgeschlagen: ${botTradeError.message}`);
        else nextRoom = normalizedRoom(botTradeData);
      }
      setRoom(nextRoom);
      resetTradeSelection();
      setTradeMode(null);
      await loadPlayerData(room.id);
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
        announceActivity("klaus_buy", `${me?.player_name ?? name} kauft eine Klaus-Karte.`, "klaus");
        await loadPlayerData(room.id);
      }
    }
    setBusy(false);
  }

  async function playKlausCard(payload: Record<string, unknown>) {
    if (!supabase || !room || !activeCard || !isMyTurn) return;
    setBusy(true); setError("");
    const playedCard = activeCard;
    const { data, error: cardError } = await supabase.rpc("play_klaus_card", { p_game_id: room.id, p_card_id: activeCard.id, p_payload: payload });
    if (cardError) setError(cardError.message);
    else {
      const nextRoom = normalizedRoom(data);
      setRoom(nextRoom);
      setMyCards((current) => current.filter((card) => card.id !== activeCard.id));
      setSelectedCard(null);
      setSelectedRobberTile(null);
      if (nextRoom.state?.winner_player === me?.player_index) announceActivity("win", `${me?.player_name ?? name} gewinnt das Spiel!`, "win");
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

  if (showOpeningIntro) return <OpeningIntro fading={openingIntroFading} />;

  if (!authReady) {
    return <main className="auth-shell"><OrientationPrompt /><LanguageSwitcher language={language} onChange={changeLanguage} /><div className="auth-card auth-loading"><span>⬡</span><strong>New Katan wird geladen …</strong></div></main>;
  }

  if (!userId) {
    return (
      <main className="auth-shell">
        <OrientationPrompt />
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
        <OrientationPrompt />
        <div className="frame-vines" aria-hidden="true"><i className="vine-top-right" /><i className="vine-bottom-right" /></div>
        <LanguageSwitcher language={language} onChange={changeLanguage} />
        <section className="lobby-card">
          <div className="lobby-brand"><span>⬡</span> NEW KATAN</div>
          <div className="lobby-account"><span><small>Eingeloggt als</small><strong>{name}</strong></span><button type="button" onClick={() => void signOut()}>Abmelden</button></div>
          <div className="lobby-options-grid">
            <button className={`fish-option ${fishTiles.length === 4 ? "active" : ""}`} type="button" onClick={toggleFishTiles}>
              <span><b>+ Fisch</b><small>Zufälliger Rohstoff beim Würfeln</small></span>
              <strong>{fishTiles.length === 4 ? "Aktiv" : "Aus"}</strong>
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
        <div className="lobby-board"><BoardFit><FullBoard fishTiles={fishTiles} previewTiles={boardTiles} /></BoardFit></div>
        <MobileFullscreenButton onClick={() => void openMobileFullscreen()} />
        <MobileInstallPrompt open={showInstallPrompt} showInstructions={showInstallInstructions} canInstall={Boolean(installPromptEvent)} onInstall={() => void installToHomeScreen()} onDismiss={dismissInstallPrompt} />
      </main>
    );
  }

  return (
    <main className="online-shell">
      <OrientationPrompt />
      <div className="frame-vines" aria-hidden="true"><i className="vine-top-right" /><i className="vine-bottom-right" /></div>
      <header className="online-topbar">
        <div className="topbar-actions">
          <button className="music-button" type="button" onClick={toggleMusic} aria-label={musicEnabled ? "Musik ausschalten" : "Musik einschalten"} title={musicEnabled ? "Musik ausschalten" : "Musik einschalten"}>{musicEnabled ? "🎵" : "🎵̸"}</button>
          <button className="sound-button" type="button" onClick={toggleSound} aria-label={soundEnabled ? "Ton ausschalten" : "Ton einschalten"} title={soundEnabled ? "Ton ausschalten" : "Ton einschalten"}>{soundEnabled ? "🔊" : "🔇"}</button>
          <button className="leave-game-topbar-button" type="button" onClick={confirmLeaveGame} aria-label="Spiel verlassen" title="Spiel verlassen">×</button>
        </div>
      </header>
      {botCount > 0 && room.status !== "waiting" && <button className="bot-debug-toggle" type="button" onClick={() => setShowBotDiagnostic((open) => !open)} aria-expanded={showBotDiagnostic} title="Bot-Diagnose">🤖?</button>}
      {botCount > 0 && room.status !== "waiting" && showBotDiagnostic && (
        <aside className="bot-debug-panel" aria-live="polite">
          <strong>BOT-DIAGNOSE v30</strong>
          <span>Spielstatus: <b>{room.status || "FEHLT"}</b></span>
          <span>Phase: <b>{room.state?.phase || "FEHLT"}</b></span>
          <span>Setup-Schritt: <b>{diagnosticSetupStep}</b></span>
          <span>Setup-Spieler: <b>{diagnosticExpectedPlayer?.player_name ?? `Index ${diagnosticSetupPlayer ?? "FEHLT"}`}</b> · Bot: <b>{diagnosticExpectedPlayer?.is_bot ? "JA" : "NEIN"}</b></span>
          <span>active_player: <b>{diagnosticActivePlayer?.player_name ?? `Index ${room.state?.active_player ?? "FEHLT"}`}</b> · Bot: <b>{diagnosticActivePlayer?.is_bot ? "JA" : "NEIN"}</b></span>
          <span>RPC: <b>{botDiagnostic || "Timer noch nicht gestartet"}</b></span>
          {error && <span title={error}>Fehler: <b>{error.length > 500 ? `${error.slice(0, 500)}…` : error}</b></span>}
        </aside>
      )}
      {room.status !== "waiting" && me && (
        <div className="resource-wallet">
          <p className="eyebrow">Deine Rohstoffe</p>
          <div className="resource-list">
            {resourceCards.map(({ key, label }) => {
              const gain = resourceGains[key];
              return (
              <div
                className={`resource-card resource-${key} ${gain ? gain.amount > 0 ? "gaining" : "losing" : ""}`}
                key={`${key}-${gain?.nonce ?? 0}`}
                title={`${label}: ${me.resources?.[key] ?? 0}`}
                aria-label={`${label}: ${me.resources?.[key] ?? 0}`}
              >
                <span className="resource-badge"><ResourceIcon kind={key} /></span>
                <span className="resource-label">{label}</span>
                <b>{me.resources?.[key] ?? 0}</b>
                {gain && <span className={`resource-gain ${gain.amount < 0 ? "resource-loss" : ""}`}>{gain.amount > 0 ? `+${gain.amount}` : `−${Math.abs(gain.amount)}`}</span>}
              </div>
            )})}
          </div>
        </div>
      )}
      <section className="online-layout">
        <div className="online-sidebar">
        <div className="game-command-stack sidebar-command-stack">
          <div className="brand"><span className="brand-mark">⬡</span> NEW KATAN</div>
          <div className={`game-activity activity-${activity.kind}`} aria-live="polite"><span aria-hidden="true" /><strong>{activity.message}</strong></div>
          {room.status === "playing" && (
            <button
              type="button"
              className={`end-button topbar-end-button ${room.state?.phase === "turn" ? "roll-action" : ""}`}
              onClick={room.state?.phase === "turn" ? rollDice : endTurn}
              disabled={
                !isMyTurn || busy || isEliminated ||
                (room.state?.phase !== "turn" && room.state?.phase !== "build") ||
                (room.state?.phase === "build" && (Boolean(activeCard) || Boolean(room.state?.card_event)))
              }
            >
              {room.state?.phase === "turn" ? "Würfeln" : "Zug beenden"}
            </button>
          )}
        </div>
        {room.status === "waiting" && isHost && botCount < 2 && <span className="mobile-scroll-cue" aria-hidden="true">⌄</span>}
        <section className="sidebar-game-section">
        <p className="eyebrow sidebar-section-title">Spielsteuerung</p>
        <aside className="room-panel card">
          <div className="sidebar-player-list">
          {players.map((player) => (
            <div className={`room-player ${player.is_bot ? "bot-player" : ""}`} key={player.user_id ?? `bot-${player.player_index}`}>
              <span style={{ background: colors[player.player_index] }}>{player.player_name.slice(0, 1).toUpperCase()}</span>
              <strong>{player.player_name}{player.is_bot ? " 🤖" : player.user_id === userId ? " (Du)" : ""}</strong>
              {room.status === "waiting" && player.is_bot && isHost && <button className="remove-bot-button" type="button" onClick={() => void removeBot(player.player_index)} disabled={busy} aria-label={`${player.player_name} entfernen`}>×</button>}
              <small>{room.status === "waiting" ? player.player_index + 1 : <>{player.victory_points ?? 2} SP · 🛣 {calculateLongestRoad(player.player_index, room.state?.roads ?? [], room.state?.settlements ?? [])} · ♞ {player.knight_points ?? 0} · 🂠 {cardCounts[player.player_index] ?? 0} · <span className={`player-resource-count ${(resourceCounts[player.player_index] ?? 0) >= 8 ? "danger" : ""}`}>{resourceCounts[player.player_index] ?? 0}</span> · {eliminatedPlayers.includes(player.player_index) ? <span className="player-out">Zuschauer</span> : player.is_bot ? <>⏱ ∞</> : <>⏱ {formatClock(playerSeconds(player.player_index))}</>}{room.state?.longest_road_holder === player.player_index ? <span className="road-vp"> · Längste Handelsstraße (+2 SP)</span> : null}{room.state?.largest_army_holder === player.player_index ? <span className="army-vp"> · Größte Rittermacht (+2 SP)</span> : null}</>}</small>
            </div>
          ))}
          {room.status === "waiting" && Array.from({ length: 4 - players.length }).map((_, index) => isHost && botCount < 2
            ? <button className="empty-player add-bot-button" type="button" key={index} onClick={() => void addBot()} disabled={busy}>+ Bot hinzufügen</button>
            : <div className="empty-player" key={index}>Warte auf Spieler …</div>)}
          </div>
        </aside>
        <section className="online-control-area">
          {room.status === "waiting" ? (
            <div className="waiting-card">
              {players.length >= 2 && <strong>Bereit zum Start</strong>}
              <span>Teile den Code {room.join_code} oder den Einladungslink · Ziel: {room.victory_target ?? 10} Siegpunkte.</span>
              <button className="copy-button" data-mobile-label={inviteCopied ? "Kopiert ✓" : "Link kopieren"} type="button" onClick={() => void copyInvite()}>{inviteCopied ? "Link kopiert ✓" : "Einladungslink kopieren"}</button>
              {isHost && <button type="button" onClick={() => void startGame()} disabled={players.length < 2 || busy}>{busy ? "Spiel wird gestartet …" : "Spiel starten"}</button>}
              <button className="leave-game-button" type="button" onClick={confirmLeaveGame}>Spiel verlassen</button>
              {error && !error.startsWith("Bot-RPC Fehler:") && <span className="setup-error" title={error}>{error.length > 180 ? `${error.slice(0, 180)}…` : error}</span>}
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
              {error && !error.startsWith("Bot-RPC Fehler:") && <span className="setup-error" title={error}>{error.length > 180 ? `${error.slice(0, 180)}…` : error}</span>}
            </div>
          ) : (
            <div className="turn-card">
              <div className="turn-heading">
                <span>Runde {room.state?.round ?? 1}</span>
                <strong>{isMyTurn ? "Du bist am Zug" : `${activePlayer?.player_name ?? "Mitspieler"} ist am Zug`}</strong>
                <em className="victory-target-chip">Ziel: {room.victory_target ?? 10} SP</em>
              </div>
              {isEliminated && <>
                <div className="player-eliminated-message">Zeit abgelaufen. Du bist jetzt Zuschauer</div>
                <button className="leave-game-button" type="button" onClick={confirmLeaveGame}>Spiel verlassen</button>
              </>}
              <div className={`turn-timer ${activePlayerSeconds <= 60 ? "urgent" : ""} ${playerClockPaused ? "paused" : ""}`}>
                <div className="turn-timer-track"><span style={{ width: `${Math.max(0, Math.min(100, activePlayerSeconds / 600 * 100))}%` }} /></div>
                <strong>{activePlayerIsBot ? "∞" : formatClock(activePlayerSeconds)}</strong>
              </div>
              {room.state?.dice ? (
                <div className="online-dice"><PipDie value={room.state.dice[0]} /><PipDie value={room.state.dice[1]} /></div>
              ) : <><div className="online-dice pending"><PipDie /><PipDie /></div><span className="turn-note">Der aktive Spieler würfelt einmal.</span></>}
              {tradeOffer && <div className="trade-offer-banner">
                <strong>🤝 Handelsangebot</strong>
                <span>{players.find((player) => player.player_index === tradeOffer.from)?.player_name} bietet {tradeOffer.to == null ? "allen" : players.find((player) => player.player_index === tradeOffer.to)?.player_name} 1 {resourceCards.find((resource) => resource.key === tradeOffer.give)?.label} gegen 1 {resourceCards.find((resource) => resource.key === tradeOffer.want)?.label}.</span>
                {tradeOffer.from !== me?.player_index && (tradeOffer.to == null || tradeOffer.to === me?.player_index) && !tradeOffer.rejected_by?.includes(me?.player_index ?? -1) && <div className="choice-grid"><button onClick={() => void respondToTrade(true)} disabled={isEliminated || busy || (myResources[tradeOffer.want] ?? 0) < 1}>Annehmen</button><button onClick={() => void respondToTrade(false)} disabled={isEliminated || busy}>Ablehnen</button></div>}
                {tradeOffer.from !== me?.player_index && (tradeOffer.to == null || tradeOffer.to === me?.player_index) && tradeOffer.rejected_by?.includes(me?.player_index ?? -1) && <small>Du hast dieses Angebot abgelehnt.</small>}
                {tradeOffer.from === me?.player_index && <button className="cancel-card" onClick={() => void cancelTrade()} disabled={isEliminated || busy}>Angebot zurückziehen</button>}
              </div>}
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
                    {tradeMode === "player" && <div className="trade-step"><span>Das Angebot wird allen Mitspielern und Bots angezeigt. Die erste Annahme zählt.</span></div>}
                    <div className="trade-step"><span>{tradeMode === "bank" ? `${bankTradeRate} gleiche Rohstoffe abgeben` : "1 Rohstoff anbieten"}</span><div className="choice-grid resources-choice">{resourceCards.map((resource) => <button className={tradeGive === resource.key ? "selected" : ""} key={resource.key} onClick={() => setTradeGive(resource.key)} disabled={(myResources[resource.key] ?? 0) < (tradeMode === "bank" ? bankTradeRate : 1)}><ResourceIcon kind={resource.key} />{resource.label} ({myResources[resource.key] ?? 0})</button>)}</div></div>
                    <div className="trade-step"><span>Gewünschten Rohstoff wählen</span><div className="choice-grid resources-choice">{resourceCards.map((resource) => <button className={tradeWant === resource.key ? "selected" : ""} key={resource.key} onClick={() => setTradeWant(resource.key)} disabled={tradeGive === resource.key}><ResourceIcon kind={resource.key} />{resource.label}</button>)}</div></div>
                    {tradeMode === "bank" ? <button className="trade-confirm" onClick={() => void tradeWithBank()} disabled={busy || !tradeGive || !tradeWant}>{`${bankTradeRate}:1 mit Vorrat tauschen`}</button> : <button className="trade-confirm" onClick={() => void offerPlayerTrade()} disabled={busy || !tradeGive || !tradeWant}>Angebot an alle senden</button>}
                  </div>}
                </>}
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
              {error && !error.startsWith("Bot-RPC Fehler:") && <span className="setup-error" title={error}>{error.length > 180 ? `${error.slice(0, 180)}…` : error}</span>}
            </div>
          )}
        </section>
        </section>
        {room.status !== "waiting" && me && (
          <section className="klaus-hand sidebar-klaus-hand">
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
          </section>
        )}
        {room.status !== "waiting" && <div className="dice-statistics sidebar-dice-statistics">
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
        </div>}
        {room.status !== "waiting" && activePlayer && <div className="active-piece-reserve">
          <div><strong>Vorrat · {activePlayer.player_name}</strong><span>aktiver Spieler</span></div>
          <ul>
            <li><span>🛣</span><b>{activeRoadsRemaining}</b><small>Straßen</small></li>
            <li><span>🏠</span><b>{activeSettlementsRemaining}</b><small>Siedlungen</small></li>
            <li><span>🏰</span><b>{activeCitiesRemaining}</b><small>Städte</small></li>
          </ul>
        </div>}
        </div>
        <section className="online-board-area">
          <SeaVisitor />
          <SwimmingFishLayer />
          <BoardFit><FullBoard
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
          /></BoardFit>
          {showLongestRoadAward && longestRoadHolder && <div className="longest-road-badge">🛣 Längste Handelsstraße: <strong>{longestRoadHolder.player_name}</strong> · {room.state?.longest_road_length ?? 5} Straßen · +2 SP</div>}
          {showLargestArmyAward && largestArmyHolder && <div className="largest-army-badge">♞ Größte Rittermacht: <strong>{largestArmyHolder.player_name}</strong> · {room.state?.largest_army_size ?? largestArmyHolder.knight_points ?? 3} Ritter · +2 SP</div>}
        </section>
      </section>
      {room.state?.card_event && <div className="klaus-reveal-overlay"><div className="klaus-reveal"><span>{players.find((player) => player.player_index === room.state?.card_event?.player)?.player_name ?? "Ein Spieler"} spielt</span><KlausCardView kind={room.state.card_event.card_type} /></div></div>}
      {room.state?.bot_card_reveal && <div className="klaus-reveal-overlay"><div className="klaus-reveal"><span>{players.find((player) => player.player_index === room.state?.bot_card_reveal?.player)?.player_name ?? "Ein Bot"} spielt</span><KlausCardView kind={room.state.bot_card_reveal.card_type} /></div></div>}
      {remoteCardReveal && !room.state?.card_event && !room.state?.bot_card_reveal && <div className="klaus-reveal-overlay"><div className="klaus-reveal"><span>{players.find((player) => player.player_index === remoteCardReveal.player)?.player_name ?? "Ein Spieler"} spielt</span><KlausCardView kind={remoteCardReveal.card_type} /></div></div>}
      {showGoldmineUnlock && <div className="goldmine-unlock-overlay"><div className="goldmine-unlock-card"><span className="goldmine-icon">⛏</span><strong>Goldmine für alle freigeschaltet</strong><p>Sobald ein Spieler 8 Siegpunkte erreicht, wird die Goldmine für alle freigeschaltet. Jeder Spieler darf nun eine eigene Siedlung direkt an der Wüste zur Goldmine ausbauen. Wird eine 7 gewürfelt, wählt der Besitzer der Goldmine einen Rohstoff.</p><small>Kosten: 2 Lehm · 2 Holz</small><button onClick={closeGoldmineMessage}>Verstanden</button></div></div>}
      <MobileFullscreenButton onClick={() => void openMobileFullscreen()} />
      <MobileInstallPrompt open={showInstallPrompt} showInstructions={showInstallInstructions} canInstall={Boolean(installPromptEvent)} onInstall={() => void installToHomeScreen()} onDismiss={dismissInstallPrompt} />
    </main>
  );
}

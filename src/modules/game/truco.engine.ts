// ─────────────────────────────────────────────────────────────────────────────
//  Truco Argentino – Game Engine
//  Pure functions + types. No side-effects, no I/O.
// ─────────────────────────────────────────────────────────────────────────────

export type Suit = 'espadas' | 'bastos' | 'copas' | 'oros';

export interface TrucoCard {
  suit: Suit;
  value: number; // 1-7, 10, 11, 12
}

export type TrucoGameMode = '1v1' | '2v2' | '3v3';

export interface TrucoConfig {
  mode: TrucoGameMode;
  maxPoints: 15 | 30;
  florEnabled: boolean;
  contraFlorEnabled: boolean;
  tableTheme: TableTheme;
}

export type TableTheme = 'green' | 'wood' | 'plastic' | 'night';

export type EnvidoCallType =
  | 'envido'
  | 'realenvido'
  | 'faltaenvido'
  | 'flor'
  | 'contraflor'
  | 'contrafloralresto';

export type TrucoCallType = 'truco' | 'retruco' | 'valecuatro';

export interface EnvidoCallEntry {
  socketId: string;
  alias: string;
  type: EnvidoCallType;
}

export interface TrucoCallEntry {
  socketId: string;
  alias: string;
  type: TrucoCallType;
}

export interface EnvidoResult {
  winnerTeam: 'A' | 'B';
  pts: number;
  reveals: { socketId: string; alias: string; value: number }[];
  // pendingShow: socketIds who must show/hide their envido cards
  pendingShow: string[];
}

export interface HandEndResult {
  trucoWinnerTeam: 'A' | 'B' | null;
  mazoTeam: 'A' | 'B' | null;
  envPts: { A: number; B: number };
  trucoPts: { A: number; B: number };
  allCards: Record<string, TrucoCard[]>; // revealed cards per socketId (only those who showed)
  newTeamAScore: number;
  newTeamBScore: number;
}

export interface TrucoGameState {
  config: TrucoConfig;
  aliases: Record<string, string>; // socketId -> alias

  // Teams
  seatOrder: string[]; // socketIds in seat order (alternating: A,B,A,B,...)
  teamA: string[];
  teamB: string[];
  teamAScore: number;
  teamBScore: number;

  // Current hand
  handNum: number;
  dealerIdx: number; // index into seatOrder
  manoSocketId: string; // first to act this hand
  currentTurnSocketId: string;

  // Cards
  hands: Record<string, TrucoCard[]>; // remaining hand (played cards removed)
  originalHands: Record<string, TrucoCard[]>; // full original hand (for reveal at end)

  // Sub-rounds (0=primera, 1=segunda, 2=tercera)
  round: number;
  playedInRound: Record<string, TrucoCard | null>; // who played what this sub-round
  roundOrder: string[]; // seat order starting from current round leader
  roundWinners: ('A' | 'B' | 'tie')[]; // result per sub-round
  lastPlayedCards: Record<string, TrucoCard>; // last card each player played (for display)

  // Envido
  envidoStatus: 'available' | 'pending' | 'resolved' | 'expired';
  envidoChain: EnvidoCallEntry[];
  envidoCallerTeam: 'A' | 'B' | null;
  envidoResponderTeam: 'A' | 'B' | null;
  envidoResult: EnvidoResult | null;
  // After quiero: winner team must show cards in pendingShowEnvido window
  pendingShowEnvido: string[]; // socketIds who must show/hide

  // Flor
  florMustDeclare: string[]; // socketIds with flor who haven't declared
  florDeclaredBy: string[];
  florStatus: 'none' | 'pending' | 'resolved';
  florCallerSocketId: string | null;
  florResponderTeam: 'A' | 'B' | null;

  // Truco
  trucoStatus: 'available' | 'pending' | 'resolved';
  trucoChain: TrucoCallEntry[];
  trucoCallerTeam: 'A' | 'B' | null;
  trucoResponderTeam: 'A' | 'B' | null;
  trucoPtsIfWon: number; // current stakes (if 'quiero' is accepted)
  trucoAccepted: boolean; // whether truco was accepted (quiero)

  // Me voy al mazo
  mazoTeam: 'A' | 'B' | null;

  // Phase
  phase: 'playing' | 'show_envido' | 'hand_end' | 'game_over';
  handEndResult: HandEndResult | null;
  showEnvidoTimer: number; // timestamp when show-envido phase started (for timeout)
}

// ── Action types ──────────────────────────────────────────────────────────────

export type TrucoAction =
  | { type: 'play-card'; cardIndex: number }
  | { type: 'call-envido'; callType: EnvidoCallType }
  | { type: 'respond-envido'; response: 'quiero' | 'noquiero' | EnvidoCallType }
  | { type: 'call-truco'; callType: TrucoCallType }
  | { type: 'respond-truco'; response: 'quiero' | 'noquiero' | TrucoCallType }
  | { type: 'declare-flor' }
  | { type: 'respond-flor'; response: 'congangamos' | 'conquiero' | 'contraflor' | 'contrafloralresto' }
  | { type: 'ir-al-mazo' }
  | { type: 'show-envido' } // show envido cards (confirm you won)
  | { type: 'hide-envido' } // hide cards (forfeit envido pts)
  | { type: 'change-theme'; theme: TableTheme } // host only
  | { type: 'next-hand' }; // advance to next hand after hand_end

export interface ActionResult {
  newState: TrucoGameState;
  error?: string;
  event?: string; // optional event name to broadcast
}

// ─────────────────────────────────────────────────────────────────────────────
//  Card utilities
// ─────────────────────────────────────────────────────────────────────────────

const SUITS: Suit[] = ['espadas', 'bastos', 'copas', 'oros'];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

function createDeck(): TrucoCard[] {
  const deck: TrucoCard[] = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value });
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Truco card ranking (higher = stronger).
 * 1espadas=14, 1bastos=13, 7espadas=12, 7oros=11, 3=10, 2=9,
 * 1copas=8, 1oros=8, 12=7, 11=6, 10=5, 7copas=4, 7bastos=4,
 * 6=3, 5=2, 4=1
 */
export function trucoRank(card: TrucoCard): number {
  const { suit, value } = card;
  if (value === 1 && suit === 'espadas') return 14;
  if (value === 1 && suit === 'bastos') return 13;
  if (value === 7 && suit === 'espadas') return 12;
  if (value === 7 && suit === 'oros') return 11;
  if (value === 3) return 10;
  if (value === 2) return 9;
  if (value === 1) return 8; // copas or oros
  if (value === 12) return 7;
  if (value === 11) return 6;
  if (value === 10) return 5;
  if (value === 7) return 4; // copas or bastos
  if (value === 6) return 3;
  if (value === 5) return 2;
  if (value === 4) return 1;
  return 0;
}

export function envidoCardValue(card: TrucoCard): number {
  return card.value >= 10 ? 0 : card.value;
}

export function calculateEnvido(cards: TrucoCard[]): number {
  const bySuit: Record<string, TrucoCard[]> = {};
  for (const c of cards) {
    if (!bySuit[c.suit]) bySuit[c.suit] = [];
    bySuit[c.suit].push(c);
  }
  let best = 0;
  for (const suit of Object.keys(bySuit)) {
    const sc = bySuit[suit];
    if (sc.length >= 2) {
      const vals = sc.map(envidoCardValue).sort((a, b) => b - a);
      best = Math.max(best, vals[0] + vals[1] + 20);
    } else {
      best = Math.max(best, envidoCardValue(sc[0]));
    }
  }
  return best;
}

export function hasFlor(cards: TrucoCard[]): boolean {
  return new Set(cards.map((c) => c.suit)).size === 1;
}

export function florValue(cards: TrucoCard[]): number {
  const vals = cards.map(envidoCardValue).sort((a, b) => b - a);
  return vals[0] + vals[1] + 20;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Team utilities
// ─────────────────────────────────────────────────────────────────────────────

export function getTeam(state: TrucoGameState, socketId: string): 'A' | 'B' | null {
  if (state.teamA.includes(socketId)) return 'A';
  if (state.teamB.includes(socketId)) return 'B';
  return null;
}

function opp(team: 'A' | 'B'): 'A' | 'B' {
  return team === 'A' ? 'B' : 'A';
}

function teamPlayers(state: TrucoGameState, team: 'A' | 'B'): string[] {
  return team === 'A' ? state.teamA : state.teamB;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Game initialization
// ─────────────────────────────────────────────────────────────────────────────

export function initTrucoGame(
  socketIds: string[],
  aliases: Record<string, string>,
  config: TrucoConfig,
): TrucoGameState {
  const teamA: string[] = [];
  const teamB: string[] = [];
  for (let i = 0; i < socketIds.length; i++) {
    if (i % 2 === 0) teamA.push(socketIds[i]);
    else teamB.push(socketIds[i]);
  }

  const base: TrucoGameState = {
    config,
    aliases,
    seatOrder: socketIds,
    teamA,
    teamB,
    teamAScore: 0,
    teamBScore: 0,
    handNum: 0,
    dealerIdx: 0,
    manoSocketId: '',
    currentTurnSocketId: '',
    hands: {},
    originalHands: {},
    round: 0,
    playedInRound: {},
    roundOrder: [],
    roundWinners: [],
    lastPlayedCards: {},
    envidoStatus: 'available',
    envidoChain: [],
    envidoCallerTeam: null,
    envidoResponderTeam: null,
    envidoResult: null,
    pendingShowEnvido: [],
    florMustDeclare: [],
    florDeclaredBy: [],
    florStatus: 'none',
    florCallerSocketId: null,
    florResponderTeam: null,
    trucoStatus: 'available',
    trucoChain: [],
    trucoCallerTeam: null,
    trucoResponderTeam: null,
    trucoPtsIfWon: 2,
    trucoAccepted: false,
    mazoTeam: null,
    phase: 'playing',
    handEndResult: null,
    showEnvidoTimer: 0,
  };

  return dealHand(base);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Deal a new hand
// ─────────────────────────────────────────────────────────────────────────────

export function dealHand(state: TrucoGameState): TrucoGameState {
  const players = state.seatOrder;
  const deck = shuffle(createDeck());
  const hands: Record<string, TrucoCard[]> = {};
  for (let i = 0; i < players.length; i++)
    hands[players[i]] = deck.slice(i * 3, i * 3 + 3);

  // mano = player after dealer
  const newDealerIdx = state.handNum === 0 ? 0 : (state.dealerIdx + 1) % players.length;
  const manoIdx = (newDealerIdx + 1) % players.length;
  const manoSocketId = players[manoIdx];

  const roundOrder: string[] = [];
  for (let i = 0; i < players.length; i++)
    roundOrder.push(players[(manoIdx + i) % players.length]);

  const playedInRound: Record<string, TrucoCard | null> = {};
  for (const sid of players) playedInRound[sid] = null;

  // Flor detection
  const florMustDeclare: string[] = [];
  if (state.config.florEnabled) {
    for (const sid of players)
      if (hasFlor(hands[sid])) florMustDeclare.push(sid);
  }

  return {
    ...state,
    hands,
    originalHands: { ...hands },
    round: 0,
    playedInRound,
    roundOrder,
    roundWinners: [],
    lastPlayedCards: {},
    envidoStatus: 'available',
    envidoChain: [],
    envidoCallerTeam: null,
    envidoResponderTeam: null,
    envidoResult: null,
    pendingShowEnvido: [],
    florMustDeclare,
    florDeclaredBy: [],
    florStatus: florMustDeclare.length > 0 ? 'pending' : 'none',
    florCallerSocketId: florMustDeclare.length > 0 ? florMustDeclare[0] : null,
    florResponderTeam: florMustDeclare.length > 0 ? opp(getTeamSafe(state, florMustDeclare[0]) ?? 'A') : null,
    trucoStatus: 'available',
    trucoChain: [],
    trucoCallerTeam: null,
    trucoResponderTeam: null,
    trucoPtsIfWon: 2,
    trucoAccepted: false,
    mazoTeam: null,
    manoSocketId,
    currentTurnSocketId: manoSocketId,
    dealerIdx: newDealerIdx,
    handNum: state.handNum + 1,
    phase: 'playing',
    handEndResult: null,
    showEnvidoTimer: 0,
  };
}

function getTeamSafe(state: TrucoGameState, sid: string): 'A' | 'B' | null {
  if (state.teamA.includes(sid)) return 'A';
  if (state.teamB.includes(sid)) return 'B';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main action dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export function handleAction(
  state: TrucoGameState,
  socketId: string,
  action: TrucoAction,
): ActionResult {
  if (!state.seatOrder.includes(socketId))
    return { newState: state, error: 'No sos parte de esta partida.' };

  switch (action.type) {
    case 'play-card': return handlePlayCard(state, socketId, action.cardIndex);
    case 'call-envido': return handleCallEnvido(state, socketId, action.callType);
    case 'respond-envido': return handleRespondEnvido(state, socketId, action.response);
    case 'call-truco': return handleCallTruco(state, socketId, action.callType);
    case 'respond-truco': return handleRespondTruco(state, socketId, action.response);
    case 'declare-flor': return handleDeclareFlor(state, socketId);
    case 'respond-flor': return handleRespondFlor(state, socketId, action.response);
    case 'ir-al-mazo': return handleIrAlMazo(state, socketId);
    case 'show-envido': return handleShowEnvido(state, socketId, true);
    case 'hide-envido': return handleShowEnvido(state, socketId, false);
    case 'change-theme': return handleChangeTheme(state, socketId, action.theme);
    case 'next-hand': return handleNextHand(state, socketId);
    default: return { newState: state, error: 'Acción desconocida.' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Play card
// ─────────────────────────────────────────────────────────────────────────────

function handlePlayCard(state: TrucoGameState, socketId: string, cardIndex: number): ActionResult {
  if (state.phase !== 'playing')
    return { newState: state, error: 'No se puede jugar en este momento.' };
  if (state.currentTurnSocketId !== socketId)
    return { newState: state, error: 'No es tu turno.' };
  if (state.envidoStatus === 'pending')
    return { newState: state, error: 'Hay un envido pendiente de respuesta.' };
  if (state.trucoStatus === 'pending')
    return { newState: state, error: 'Hay un truco pendiente de respuesta.' };
  if (state.florStatus === 'pending')
    return { newState: state, error: 'Hay una flor pendiente de respuesta.' };

  const hand = state.hands[socketId];
  if (!hand || cardIndex < 0 || cardIndex >= hand.length)
    return { newState: state, error: 'Carta inválida.' };

  // Force flor declaration before playing
  if (state.config.florEnabled && state.florMustDeclare.includes(socketId) && !state.florDeclaredBy.includes(socketId))
    return { newState: state, error: '¡Tenés flor! Debés declararla antes de jugar.' };

  const card = hand[cardIndex];
  const newHand = hand.filter((_, i) => i !== cardIndex);
  const newPlayedInRound = { ...state.playedInRound, [socketId]: card };
  const newLastPlayed = { ...state.lastPlayedCards, [socketId]: card };

  // Expire envido if truco was already resolved or if we're past round 0
  let newEnvidoStatus = state.envidoStatus;
  if (state.envidoStatus === 'available') {
    if (state.trucoStatus === 'resolved' || state.round > 0) newEnvidoStatus = 'expired';
  }

  const newState: TrucoGameState = {
    ...state,
    hands: { ...state.hands, [socketId]: newHand },
    playedInRound: newPlayedInRound,
    lastPlayedCards: newLastPlayed,
    envidoStatus: newEnvidoStatus,
  };

  // Check if all players in this round have played
  const allPlayed = state.roundOrder.every((sid) => newPlayedInRound[sid] !== null);

  if (!allPlayed) {
    // Next player in round order
    const curIdx = state.roundOrder.indexOf(socketId);
    const nextIdx = (curIdx + 1) % state.roundOrder.length;
    return { newState: { ...newState, currentTurnSocketId: state.roundOrder[nextIdx] } };
  }

  return resolveRound(newState);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Resolve a sub-round
// ─────────────────────────────────────────────────────────────────────────────

function resolveRound(state: TrucoGameState): ActionResult {
  const played = state.playedInRound;
  let bestA = -1, bestB = -1;
  let winnerSidA = '', winnerSidB = '';

  for (const sid of state.seatOrder) {
    const card = played[sid];
    if (!card) continue;
    const rank = trucoRank(card);
    const team = getTeamSafe(state, sid);
    if (team === 'A' && rank > bestA) { bestA = rank; winnerSidA = sid; }
    if (team === 'B' && rank > bestB) { bestB = rank; winnerSidB = sid; }
  }

  let roundWinner: 'A' | 'B' | 'tie';
  if (bestA > bestB) roundWinner = 'A';
  else if (bestB > bestA) roundWinner = 'B';
  else roundWinner = 'tie';

  const newRoundWinners = [...state.roundWinners, roundWinner];

  // Check if hand is decided
  const manoTeam = getTeamSafe(state, state.manoSocketId) ?? 'A';

  if (state.round >= 2 || isHandDecided(newRoundWinners)) {
    const trucoWinnerTeam = state.trucoAccepted
      ? determineHandWinner(newRoundWinners, manoTeam)
      : (state.trucoChain.length === 0 ? determineHandWinner(newRoundWinners, manoTeam) : null);
    return finalizeHand(
      { ...state, roundWinners: newRoundWinners },
      trucoWinnerTeam,
      null,
    );
  }

  // Next sub-round: winner of this round leads, or mano if tie
  let nextLeader: string;
  if (roundWinner === 'tie') {
    nextLeader = state.manoSocketId;
  } else {
    nextLeader = roundWinner === 'A' ? winnerSidA : winnerSidB;
  }

  const leadIdx = state.seatOrder.indexOf(nextLeader);
  const newRoundOrder = state.seatOrder.map((_, i) =>
    state.seatOrder[(leadIdx + i) % state.seatOrder.length],
  );

  const newPlayedInRound: Record<string, TrucoCard | null> = {};
  for (const sid of state.seatOrder) newPlayedInRound[sid] = null;

  const newEnvido =
    state.envidoStatus === 'available' ? 'expired' : state.envidoStatus;

  return {
    newState: {
      ...state,
      round: state.round + 1,
      roundWinners: newRoundWinners,
      playedInRound: newPlayedInRound,
      roundOrder: newRoundOrder,
      currentTurnSocketId: nextLeader,
      envidoStatus: newEnvido,
    },
  };
}

function isHandDecided(rw: ('A' | 'B' | 'tie')[]): boolean {
  const a = rw.filter((r) => r === 'A').length;
  const b = rw.filter((r) => r === 'B').length;
  if (a >= 2 || b >= 2) return true;
  // primera+tie → primera wins immediately; tie+segunda → segunda wins immediately
  if (rw.length >= 2 && rw[0] !== 'tie' && rw[1] === 'tie') return true;
  if (rw.length >= 2 && rw[0] === 'tie' && rw[1] !== 'tie') return true;
  return false;
}

function determineHandWinner(rw: ('A' | 'B' | 'tie')[], manoTeam: 'A' | 'B'): 'A' | 'B' {
  const a = rw.filter((r) => r === 'A').length;
  const b = rw.filter((r) => r === 'B').length;
  if (a >= 2) return 'A';
  if (b >= 2) return 'B';
  if (a > b) return 'A';
  if (b > a) return 'B';
  return manoTeam; // tie → mano wins
}

// ─────────────────────────────────────────────────────────────────────────────
//  Finalize hand (compute points, transition to show_envido or hand_end)
// ─────────────────────────────────────────────────────────────────────────────

function finalizeHand(
  state: TrucoGameState,
  trucoWinnerTeam: 'A' | 'B' | null,
  mazoTeam: 'A' | 'B' | null,
): ActionResult {
  // Truco pts
  const trucoPts = { A: 0, B: 0 };
  const effectiveTrucoWinner = mazoTeam ? opp(mazoTeam) : trucoWinnerTeam;

  if (effectiveTrucoWinner) {
    if (state.trucoAccepted) {
      trucoPts[effectiveTrucoWinner] = state.trucoPtsIfWon;
    } else if (state.trucoChain.length > 0) {
      // was called but no quiero (or mazo)
      trucoPts[effectiveTrucoWinner] = Math.max(1, state.trucoPtsIfWon - 1);
    } else {
      // no truco called → 1 pt for winning the hand (standard rule)
      trucoPts[effectiveTrucoWinner] = 1;
    }
  }

  // Envido pts (provisional – may change in show_envido phase)
  const envPts = { A: 0, B: 0 };
  if (state.envidoResult) {
    envPts[state.envidoResult.winnerTeam] = state.envidoResult.pts;
  }

  const newTeamAScore = state.teamAScore + envPts.A + trucoPts.A;
  const newTeamBScore = state.teamBScore + envPts.B + trucoPts.B;

  const isGameOver =
    newTeamAScore >= state.config.maxPoints || newTeamBScore >= state.config.maxPoints;

  const handEndResult: HandEndResult = {
    trucoWinnerTeam: effectiveTrucoWinner,
    mazoTeam,
    envPts,
    trucoPts,
    allCards: {},
    newTeamAScore,
    newTeamBScore,
  };

  // If envido was accepted (quiero), enter show_envido phase
  const needsShow =
    state.envidoResult !== null &&
    state.envidoResult.pts > 0 &&
    state.envidoResult.pendingShow.length > 0;

  if (needsShow) {
    return {
      newState: {
        ...state,
        mazoTeam,
        teamAScore: newTeamAScore,
        teamBScore: newTeamBScore,
        trucoPtsIfWon: state.trucoPtsIfWon,
        trucoAccepted: state.trucoAccepted,
        handEndResult,
        pendingShowEnvido: state.envidoResult!.pendingShow,
        phase: 'show_envido',
        showEnvidoTimer: Date.now(),
      },
    };
  }

  return {
    newState: {
      ...state,
      mazoTeam,
      teamAScore: newTeamAScore,
      teamBScore: newTeamBScore,
      phase: isGameOver ? 'game_over' : 'hand_end',
      handEndResult,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Show / Hide envido cards
// ─────────────────────────────────────────────────────────────────────────────

function handleShowEnvido(state: TrucoGameState, socketId: string, show: boolean): ActionResult {
  if (state.phase !== 'show_envido')
    return { newState: state, error: 'No hay envido pendiente de mostrar.' };
  if (!state.pendingShowEnvido.includes(socketId))
    return { newState: state, error: 'No tenés que mostrar.' };

  const newPending = state.pendingShowEnvido.filter((s) => s !== socketId);

  let newEnvidoResult = state.envidoResult;
  let newHandEndResult = state.handEndResult;

  if (!show) {
    // Player FORFEITS their envido points → opponent team gets them instead
    if (newEnvidoResult) {
      const winnerTeam = newEnvidoResult.winnerTeam;
      const myTeam = getTeamSafe(state, socketId) ?? winnerTeam;
      if (myTeam === winnerTeam) {
        // The winner chose to hide → lose points, give to opponent
        const loserTeam = opp(winnerTeam);
        newEnvidoResult = { ...newEnvidoResult, winnerTeam: loserTeam };
        // Recalculate scores: state.teamAScore already includes the old envPts+trucoPts from finalizeHand
        // so we must subtract them first to get the pre-hand baseline, then add the new allocations
        if (newHandEndResult) {
          const envPts = { A: 0, B: 0 };
          envPts[loserTeam] = newEnvidoResult.pts;
          const preHandA = state.teamAScore - newHandEndResult.envPts.A - newHandEndResult.trucoPts.A;
          const preHandB = state.teamBScore - newHandEndResult.envPts.B - newHandEndResult.trucoPts.B;
          newHandEndResult = {
            ...newHandEndResult,
            envPts,
            newTeamAScore: preHandA + envPts.A + newHandEndResult.trucoPts.A,
            newTeamBScore: preHandB + envPts.B + newHandEndResult.trucoPts.B,
          };
        }
      }
    }
  } else {
    // Show: record revealed cards
    if (newHandEndResult) {
      newHandEndResult = {
        ...newHandEndResult,
        allCards: {
          ...newHandEndResult.allCards,
          [socketId]: state.originalHands[socketId] ?? [],
        },
      };
    }
  }

  const newState: TrucoGameState = {
    ...state,
    envidoResult: newEnvidoResult,
    handEndResult: newHandEndResult,
    pendingShowEnvido: newPending,
  };

  if (newPending.length === 0) {
    // All done → transition to hand_end or game_over
    const finalA = newHandEndResult?.newTeamAScore ?? state.teamAScore;
    const finalB = newHandEndResult?.newTeamBScore ?? state.teamBScore;
    const isOver = finalA >= state.config.maxPoints || finalB >= state.config.maxPoints;
    return {
      newState: {
        ...newState,
        teamAScore: finalA,
        teamBScore: finalB,
        phase: isOver ? 'game_over' : 'hand_end',
      },
    };
  }

  return { newState };
}

// Timeout: auto-hide for all remaining pendingShowEnvido players
export function timeoutShowEnvido(state: TrucoGameState): TrucoGameState {
  let s = state;
  for (const sid of [...state.pendingShowEnvido]) {
    const res = handleShowEnvido(s, sid, false);
    s = res.newState;
  }
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Envido handling
// ─────────────────────────────────────────────────────────────────────────────

function envidoCallValue(type: EnvidoCallType): number {
  switch (type) {
    case 'envido': return 2;
    case 'realenvido': return 3;
    case 'flor': return 3;
    default: return 0; // faltaenvido, contraflor: special
  }
}

function envidoChainQuieroValue(chain: EnvidoCallEntry[]): number {
  return chain.reduce((s, c) => s + envidoCallValue(c.type), 0);
}

function envidoChainNoQuieroValue(chain: EnvidoCallEntry[]): number {
  // No-quiero: caller gets the sum of all calls except the last one (minimum 1 point)
  // e.g. envido alone → 1pt; envido+real-envido → envido's 2pts = 2; envido+envido+real-envido → 4pts
  if (chain.length <= 1) return 1;
  return chain.slice(0, -1).reduce((s, c) => s + envidoCallValue(c.type), 0);
}

function handleCallEnvido(
  state: TrucoGameState,
  socketId: string,
  callType: EnvidoCallType,
): ActionResult {
  const team = getTeamSafe(state, socketId);
  if (!team) return { newState: state, error: 'No sos parte de la partida.' };
  if (state.envidoStatus !== 'available')
    return { newState: state, error: 'No se puede cantar envido ahora.' };
  if (state.trucoStatus === 'resolved')
    return { newState: state, error: 'El truco ya fue resuelto.' };

  const chain = state.envidoChain;

  // Validate sequence
  if (chain.length > 0) {
    const last = chain[chain.length - 1];
    const lastTeam = getTeamSafe(state, last.socketId);
    if (lastTeam === team)
      return { newState: state, error: 'No podés subir tu propia apuesta.' };
    if (!isValidEnvidoRaise(last.type, callType))
      return { newState: state, error: 'Esa llamada no es válida.' };
  } else {
    if (!['envido', 'realenvido', 'faltaenvido'].includes(callType))
      return { newState: state, error: 'Llamada de envido inválida.' };
  }

  const newCall: EnvidoCallEntry = { socketId, alias: state.aliases[socketId] ?? '', type: callType };

  return {
    newState: {
      ...state,
      envidoStatus: 'pending',
      envidoChain: [...chain, newCall],
      envidoCallerTeam: team,
      envidoResponderTeam: opp(team),
    },
  };
}

function isValidEnvidoRaise(current: EnvidoCallType, raise: EnvidoCallType): boolean {
  const order: EnvidoCallType[] = ['envido', 'realenvido', 'faltaenvido'];
  const ci = order.indexOf(current);
  const ri = order.indexOf(raise);
  if (ci < 0 || ri < 0) return false;
  return ri >= ci; // can call same or higher
}

function handleRespondEnvido(
  state: TrucoGameState,
  socketId: string,
  response: 'quiero' | 'noquiero' | EnvidoCallType,
): ActionResult {
  const team = getTeamSafe(state, socketId);
  if (!team) return { newState: state, error: 'No sos parte de la partida.' };
  if (state.envidoStatus !== 'pending')
    return { newState: state, error: 'No hay envido pendiente.' };
  if (state.envidoResponderTeam !== team)
    return { newState: state, error: 'No es tu equipo el que debe responder.' };

  if (response === 'noquiero') {
    const pts = envidoChainNoQuieroValue(state.envidoChain);
    const winnerTeam = state.envidoCallerTeam!;
    return {
      newState: {
        ...state,
        envidoStatus: 'resolved',
        envidoResult: { winnerTeam, pts, reveals: [], pendingShow: [] },
      },
    };
  }

  if (response === 'quiero') {
    // Calculate envido for all players
    const reveals = state.seatOrder.map((sid) => ({
      socketId: sid,
      alias: state.aliases[sid] ?? '',
      value: calculateEnvido(state.originalHands[sid] ?? []),
    }));

    const bestA = Math.max(...teamPlayers(state, 'A').map((sid) => calculateEnvido(state.originalHands[sid] ?? [])));
    const bestB = Math.max(...teamPlayers(state, 'B').map((sid) => calculateEnvido(state.originalHands[sid] ?? [])));

    const manoTeam = getTeamSafe(state, state.manoSocketId) ?? 'A';
    let winnerTeam: 'A' | 'B';
    if (bestA > bestB) winnerTeam = 'A';
    else if (bestB > bestA) winnerTeam = 'B';
    else winnerTeam = manoTeam; // tie → mano wins

    const lastCall = state.envidoChain[state.envidoChain.length - 1];
    let pts: number;
    if (lastCall.type === 'faltaenvido') {
      const loserScore = winnerTeam === 'A' ? state.teamBScore : state.teamAScore;
      pts = Math.max(1, state.config.maxPoints - loserScore);
    } else {
      pts = Math.max(1, envidoChainQuieroValue(state.envidoChain));
    }

    // Winner team's players must show their envido cards
    const pendingShow = teamPlayers(state, winnerTeam);

    return {
      newState: {
        ...state,
        envidoStatus: 'resolved',
        envidoResult: { winnerTeam, pts, reveals, pendingShow },
      },
    };
  }

  // Raise
  return handleCallEnvido(
    { ...state, envidoStatus: 'available', envidoResponderTeam: null },
    socketId,
    response as EnvidoCallType,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Truco handling
// ─────────────────────────────────────────────────────────────────────────────

function handleCallTruco(
  state: TrucoGameState,
  socketId: string,
  callType: TrucoCallType,
): ActionResult {
  const team = getTeamSafe(state, socketId);
  if (!team) return { newState: state, error: 'No sos parte de la partida.' };
  if (state.trucoStatus === 'resolved')
    return { newState: state, error: 'El truco ya fue resuelto.' };
  if (state.trucoStatus === 'pending')
    return { newState: state, error: 'Hay un truco pendiente de respuesta.' };

  const chain = state.trucoChain;

  if (chain.length === 0) {
    if (callType !== 'truco')
      return { newState: state, error: 'Debés llamar "Truco" primero.' };
  } else {
    const last = chain[chain.length - 1];
    const lastTeam = getTeamSafe(state, last.socketId);
    if (lastTeam === team)
      return { newState: state, error: 'No podés subir tu propio truco.' };
    const next: Record<TrucoCallType, TrucoCallType | null> = {
      truco: 'retruco', retruco: 'valecuatro', valecuatro: null,
    };
    if (next[last.type] !== callType)
      return { newState: state, error: 'Llamada de truco inválida.' };
    if (last.type === 'valecuatro')
      return { newState: state, error: 'Vale cuatro es el máximo.' };
  }

  const ptsMap: Record<TrucoCallType, number> = { truco: 2, retruco: 3, valecuatro: 4 };
  const newCall: TrucoCallEntry = { socketId, alias: state.aliases[socketId] ?? '', type: callType };

  // Calling truco expires envido
  const newEnvido = state.envidoStatus === 'available' ? 'expired' : state.envidoStatus;

  return {
    newState: {
      ...state,
      trucoStatus: 'pending',
      trucoChain: [...chain, newCall],
      trucoCallerTeam: team,
      trucoResponderTeam: opp(team),
      trucoPtsIfWon: ptsMap[callType],
      envidoStatus: newEnvido,
    },
  };
}

function handleRespondTruco(
  state: TrucoGameState,
  socketId: string,
  response: 'quiero' | 'noquiero' | TrucoCallType,
): ActionResult {
  const team = getTeamSafe(state, socketId);
  if (!team) return { newState: state, error: 'No sos parte de la partida.' };
  if (state.trucoStatus !== 'pending')
    return { newState: state, error: 'No hay truco pendiente.' };
  if (state.trucoResponderTeam !== team)
    return { newState: state, error: 'No es tu equipo el que debe responder.' };

  if (response === 'noquiero') {
    const winnerTeam = state.trucoCallerTeam!;
    // Hand ends immediately (points calculated by finalizeHand based on trucoPtsIfWon)
    return finalizeHand(
      { ...state, trucoStatus: 'resolved', trucoAccepted: false },
      winnerTeam,
      null,
    );
  }

  if (response === 'quiero') {
    return {
      newState: {
        ...state,
        trucoStatus: 'resolved',
        trucoAccepted: true,
        currentTurnSocketId: state.currentTurnSocketId, // turn continues
      },
    };
  }

  // Raise (retruco / valecuatro)
  return handleCallTruco(
    { ...state, trucoStatus: 'available', trucoResponderTeam: null },
    socketId,
    response as TrucoCallType,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Flor handling
// ─────────────────────────────────────────────────────────────────────────────

function handleDeclareFlor(state: TrucoGameState, socketId: string): ActionResult {
  if (!state.florMustDeclare.includes(socketId))
    return { newState: state, error: 'No tenés flor.' };
  if (state.florDeclaredBy.includes(socketId))
    return { newState: state, error: 'Ya declaraste flor.' };

  const team = getTeamSafe(state, socketId)!;
  const newDeclared = [...state.florDeclaredBy, socketId];

  return {
    newState: {
      ...state,
      florDeclaredBy: newDeclared,
      florStatus: 'pending',
      florCallerSocketId: socketId,
      florResponderTeam: opp(team),
    },
  };
}

function handleRespondFlor(
  state: TrucoGameState,
  socketId: string,
  response: 'congangamos' | 'conquiero' | 'contraflor' | 'contrafloralresto',
): ActionResult {
  const team = getTeamSafe(state, socketId);
  if (!team) return { newState: state, error: 'No sos parte de la partida.' };
  if (state.florStatus !== 'pending')
    return { newState: state, error: 'No hay flor pendiente.' };
  if (state.florResponderTeam !== team)
    return { newState: state, error: 'No es tu equipo el que debe responder.' };

  const callerTeam = getTeamSafe(state, state.florCallerSocketId!)!;

  if (response === 'congangamos') {
    // Opponent doesn't have flor → caller wins 3 pts (Flor)
    return {
      newState: {
        ...state,
        florStatus: 'resolved',
        envidoStatus: 'resolved',
        envidoResult: { winnerTeam: callerTeam, pts: 3, reveals: [], pendingShow: [] },
      },
    };
  }

  if (response === 'conquiero') {
    // Both have flor → compare flor values
    const callerFV = florValue(state.originalHands[state.florCallerSocketId!] ?? []);
    let respBest = 0;
    for (const sid of teamPlayers(state, team)) {
      if (hasFlor(state.originalHands[sid] ?? []))
        respBest = Math.max(respBest, florValue(state.originalHands[sid] ?? []));
    }
    const winnerTeam: 'A' | 'B' = callerFV >= respBest ? callerTeam : team; // tie → caller wins (mano)
    return {
      newState: {
        ...state,
        florStatus: 'resolved',
        envidoStatus: 'resolved',
        envidoResult: { winnerTeam, pts: 3, reveals: [], pendingShow: [] },
      },
    };
  }

  if (response === 'contraflor') {
    if (!state.config.contraFlorEnabled)
      return { newState: state, error: 'Contra Flor no está habilitada.' };
    // Counter: now the responder is the caller
    return {
      newState: {
        ...state,
        florCallerSocketId: socketId,
        florResponderTeam: callerTeam,
      },
    };
  }

  if (response === 'contrafloralresto') {
    if (!state.config.contraFlorEnabled)
      return { newState: state, error: 'Contra Flor al Resto no está habilitada.' };
    // Compare flor values, winner gets remaining pts needed
    const callerFV = florValue(state.originalHands[state.florCallerSocketId!] ?? []);
    let respBest = 0;
    for (const sid of teamPlayers(state, team)) {
      if (hasFlor(state.originalHands[sid] ?? []))
        respBest = Math.max(respBest, florValue(state.originalHands[sid] ?? []));
    }
    const winnerTeam: 'A' | 'B' = respBest >= callerFV ? team : callerTeam;
    const loserScore = winnerTeam === 'A' ? state.teamBScore : state.teamAScore;
    const pts = Math.max(1, state.config.maxPoints - loserScore);
    return {
      newState: {
        ...state,
        florStatus: 'resolved',
        envidoStatus: 'resolved',
        envidoResult: { winnerTeam, pts, reveals: [], pendingShow: [] },
      },
    };
  }

  return { newState: state, error: 'Respuesta inválida.' };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Ir al mazo (fold)
// ─────────────────────────────────────────────────────────────────────────────

function handleIrAlMazo(state: TrucoGameState, socketId: string): ActionResult {
  if (state.phase !== 'playing')
    return { newState: state, error: 'No se puede ir al mazo ahora.' };
  if (state.currentTurnSocketId !== socketId)
    return { newState: state, error: 'No es tu turno.' };
  if (state.trucoStatus === 'pending' || state.envidoStatus === 'pending')
    return { newState: state, error: 'Debés responder antes de irte al mazo.' };

  const team = getTeamSafe(state, socketId)!;

  // Forfeit envido if not resolved
  let newEnvidoResult = state.envidoResult;
  if (!newEnvidoResult && state.envidoChain.length > 0) {
    newEnvidoResult = { winnerTeam: opp(team), pts: 1, reveals: [], pendingShow: [] };
  }

  return finalizeHand(
    { ...state, mazoTeam: team, envidoResult: newEnvidoResult },
    null,
    team,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Theme change (host only – validated in gateway)
// ─────────────────────────────────────────────────────────────────────────────

function handleChangeTheme(state: TrucoGameState, _socketId: string, theme: TableTheme): ActionResult {
  return { newState: { ...state, config: { ...state.config, tableTheme: theme } } };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Advance to next hand
// ─────────────────────────────────────────────────────────────────────────────

function handleNextHand(_state: TrucoGameState, _socketId: string): ActionResult {
  // Called when host wants to deal next hand (or auto-triggered after hand_end)
  if (_state.phase === 'game_over')
    return { newState: _state, error: 'El juego terminó.' };
  if (_state.phase !== 'hand_end')
    return { newState: _state, error: 'La mano no terminó todavía.' };
  return { newState: dealHand(_state) };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Build per-player view (what to send to each client)
// ─────────────────────────────────────────────────────────────────────────────

export interface TrucoPlayerView {
  // Public
  config: TrucoConfig;
  teamAScore: number;
  teamBScore: number;
  teamAMembers: { socketId: string; alias: string }[];
  teamBMembers: { socketId: string; alias: string }[];
  myTeam: 'A' | 'B';
  phase: TrucoGameState['phase'];
  handNum: number;
  dealerAlias: string;
  manoAlias: string;
  currentTurnAlias: string;
  round: number;
  roundWinners: ('A' | 'B' | 'tie')[];
  // Last played card per player (for table display)
  lastPlayedCards: Record<string, TrucoCard>;
  // Cards played in current round (face-up)
  currentRoundCards: Record<string, TrucoCard | null>;
  // Envido
  envidoStatus: TrucoGameState['envidoStatus'];
  envidoChain: EnvidoCallEntry[];
  envidoResponderTeam: 'A' | 'B' | null;
  envidoResult: EnvidoResult | null;
  pendingShowEnvido: string[]; // aliases
  myEnvidoValue: number; // private
  // Flor
  florStatus: TrucoGameState['florStatus'];
  florMustDeclare: boolean; // if this player must declare
  florDeclaredAliases: string[];
  florResponderTeam: 'A' | 'B' | null; // which team must respond when florStatus=pending
  // Truco
  trucoStatus: TrucoGameState['trucoStatus'];
  trucoChain: TrucoCallEntry[];
  trucoResponderTeam: 'A' | 'B' | null;
  trucoPtsIfWon: number;
  trucoAccepted: boolean;
  // Me voy al mazo
  mazoTeam: 'A' | 'B' | null;
  // Private: your own cards
  myHand: TrucoCard[];
  // How many cards each opponent has left (count only)
  opponentCardCounts: Record<string, number>; // alias -> count
  // Hand result
  handEndResult: HandEndResult | null;
  // Opponents' card backs count per player
  allPlayerCardCounts: Record<string, number>; // alias -> remaining card count
}

export function buildPlayerView(state: TrucoGameState, socketId: string): TrucoPlayerView {
  const myTeam = getTeamSafe(state, socketId) ?? 'A';

  const toMember = (sid: string) => ({ socketId: sid, alias: state.aliases[sid] ?? sid });

  const pendingShowAliases = state.pendingShowEnvido.map(
    (sid) => state.aliases[sid] ?? sid,
  );

  const florDeclaredAliases = state.florDeclaredBy.map((sid) => state.aliases[sid] ?? sid);

  const currentRoundCards: Record<string, TrucoCard | null> = {};
  for (const sid of state.seatOrder)
    currentRoundCards[state.aliases[sid] ?? sid] = state.playedInRound[sid] ?? null;

  const lastPlayed: Record<string, TrucoCard> = {};
  for (const [sid, card] of Object.entries(state.lastPlayedCards))
    lastPlayed[state.aliases[sid] ?? sid] = card;

  const opponentCardCounts: Record<string, number> = {};
  for (const sid of state.seatOrder) {
    if (sid !== socketId)
      opponentCardCounts[state.aliases[sid] ?? sid] = (state.hands[sid] ?? []).length;
  }

  const allPlayerCardCounts: Record<string, number> = {};
  for (const sid of state.seatOrder)
    allPlayerCardCounts[state.aliases[sid] ?? sid] = (state.hands[sid] ?? []).length;

  return {
    config: state.config,
    teamAScore: state.teamAScore,
    teamBScore: state.teamBScore,
    teamAMembers: state.teamA.map(toMember),
    teamBMembers: state.teamB.map(toMember),
    myTeam,
    phase: state.phase,
    handNum: state.handNum,
    dealerAlias: state.aliases[state.seatOrder[state.dealerIdx]] ?? '',
    manoAlias: state.aliases[state.manoSocketId] ?? '',
    currentTurnAlias: state.aliases[state.currentTurnSocketId] ?? '',
    round: state.round,
    roundWinners: state.roundWinners,
    lastPlayedCards: lastPlayed,
    currentRoundCards,
    envidoStatus: state.envidoStatus,
    envidoChain: state.envidoChain,
    envidoResponderTeam: state.envidoResponderTeam,
    envidoResult: state.envidoResult,
    pendingShowEnvido: pendingShowAliases,
    myEnvidoValue: calculateEnvido(state.originalHands[socketId] ?? []),
    florStatus: state.florStatus,
    florMustDeclare: state.florMustDeclare.includes(socketId) && !state.florDeclaredBy.includes(socketId),
    florDeclaredAliases,
    florResponderTeam: state.florResponderTeam,
    trucoStatus: state.trucoStatus,
    trucoChain: state.trucoChain,
    trucoResponderTeam: state.trucoResponderTeam,
    trucoPtsIfWon: state.trucoPtsIfWon,
    trucoAccepted: state.trucoAccepted,
    mazoTeam: state.mazoTeam,
    myHand: state.hands[socketId] ?? [],
    opponentCardCounts,
    allPlayerCardCounts,
    handEndResult: state.handEndResult,
  };
}

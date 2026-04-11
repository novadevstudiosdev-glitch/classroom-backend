import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Socket, Namespace } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { MinigameInstance } from '../minigame-instances/entities/minigame-instance.entity';
import { User } from '../users/entities/user.entity';
import { TeacherProfile } from '../teachers/entities/teacher-profile.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { ParentProfile } from '../parents/entities/parent-profile.entity';
import {
  TrucoConfig,
  TrucoGameState,
  TrucoAction,
  TrucoCard,
  initTrucoGame,
  handleAction as trucoHandleAction,
  buildPlayerView,
  timeoutShowEnvido,
  TableTheme,
} from './truco.engine';

// ─────────────────────────────────────────────────────────────────────────────
//  Translate "friendly" frontend actions → engine TrucoAction
//  The frontend sends short keys like { type:'envido' } while the engine
//  uses { type:'call-envido', callType:'envido' }.  Context (state) is
//  needed to disambiguate quiero/no-quiero between envido and truco.
// ─────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function translateTrucoAction(state: TrucoGameState, socketId: string, raw: any): TrucoAction {
  const { type, ...rest } = raw as Record<string, unknown>;

  switch (type) {

    /* ── Play card ── */
    case 'play-card': {
      const card = rest.card as TrucoCard | undefined;
      if (!card) return { type: 'play-card', cardIndex: -1 };
      const hand = state.hands[socketId] ?? [];
      const idx = hand.findIndex(c => c.suit === card.suit && c.value === card.value);
      return { type: 'play-card', cardIndex: idx };
    }

    /* ── Envido calls (context-sensitive: raise vs new call) ── */
    case 'envido':
      // Re-envido raise while pending → respond-envido
      if (state.envidoStatus === 'pending') return { type: 'respond-envido', response: 'envido' };
      return { type: 'call-envido', callType: 'envido' };
    case 'real-envido':
      if (state.envidoStatus === 'pending') return { type: 'respond-envido', response: 'realenvido' };
      return { type: 'call-envido', callType: 'realenvido' };
    case 'falta-envido':
      if (state.envidoStatus === 'pending') return { type: 'respond-envido', response: 'faltaenvido' };
      return { type: 'call-envido', callType: 'faltaenvido' };

    /* ── Truco calls ── */
    case 'truco':      return { type: 'call-truco', callType: 'truco' };
    case 'retruco':
      // As a response to a pending truco → respond-truco; otherwise escalate call
      if (state.trucoStatus === 'pending') return { type: 'respond-truco', response: 'retruco' };
      return { type: 'call-truco', callType: 'retruco' };
    case 'vale-cuatro':
      if (state.trucoStatus === 'pending') return { type: 'respond-truco', response: 'valecuatro' };
      return { type: 'call-truco', callType: 'valecuatro' };

    /* ── Quiero / No Quiero (context-sensitive) ── */
    case 'quiero':
      if (state.florStatus === 'pending')   return { type: 'respond-flor',   response: 'conquiero' };
      if (state.envidoStatus === 'pending') return { type: 'respond-envido', response: 'quiero' };
      if (state.trucoStatus === 'pending')  return { type: 'respond-truco',  response: 'quiero' };
      return { type: 'respond-envido', response: 'quiero' }; // fallback
    case 'no-quiero':
      if (state.florStatus === 'pending')   return { type: 'respond-flor',   response: 'congangamos' };
      if (state.envidoStatus === 'pending') return { type: 'respond-envido', response: 'noquiero' };
      if (state.trucoStatus === 'pending')  return { type: 'respond-truco',  response: 'noquiero' };
      return { type: 'respond-envido', response: 'noquiero' }; // fallback
    case 'son-buenas':
      if (state.envidoStatus === 'pending') return { type: 'respond-envido', response: 'sonbuenas' };
      return { type: 'respond-envido', response: 'sonbuenas' }; // fallback
    case 'decir-puntos':
      if (state.envidoStatus === 'pending') return { type: 'respond-envido', response: 'decirpuntos' };
      return { type: 'respond-envido', response: 'decirpuntos' }; // fallback

    /* ── Flor ── */
    case 'flor':              return { type: 'declare-flor' };
    case 'con-flor-me-gano':  return { type: 'respond-flor', response: 'congangamos' };
    case 'contraflor':        return { type: 'respond-flor', response: 'contraflor' };
    case 'contraflor-al-resto': return { type: 'respond-flor', response: 'contrafloralresto' };

    /* ── Show / hide envido cards ── */
    case 'show-envido': return (rest.show === true) ? { type: 'show-envido' } : { type: 'hide-envido' };
    case 'hide-envido': return { type: 'hide-envido' };

    /* ── Pass-through ── */
    case 'ir-al-mazo':    return { type: 'ir-al-mazo' };
    case 'change-theme':  return { type: 'change-theme', theme: rest.theme as TableTheme };
    case 'next-hand':     return { type: 'next-hand' };

    default: return raw as TrucoAction;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type GameType = 'quiz' | 'wordsearch' | 'anagram' | 'preguntados' | 'truco';

interface Player {
  socketId: string;
  alias: string;
  score: number;
  answeredThisRound: boolean;
  finished: boolean;
}

interface WsCell { r: number; c: number; }
interface WsFoundWord { alias: string; cells: WsCell[]; colorIndex: number; }

interface Room {
  roomCode: string;
  roomName: string;
  maxPlayers: number;
  password: string | null;
  hostSocketId: string;
  players: Map<string, Player>;
  selectedInstanceId: string | null;
  selectedTitle: string;
  gameType: GameType;
  gameData: any;
  questions: any[];
  currentQ: number;
  status: 'waiting' | 'playing' | 'finished';
  timer: ReturnType<typeof setTimeout> | null;
  emptyTimer: ReturnType<typeof setTimeout> | null;
  questionStartedAt: number;
  timeLimitMs: number;
  // wordsearch multiplayer state
  wsGrid: string[][] | null;
  wsPlaced: { word: string; cells: WsCell[] }[];
  wsFoundWords: Map<string, WsFoundWord>;
  wsStartedAt: number;
  // Reconnect support: players who disconnected during active game
  disconnectedPlayers: Map<string, { player: Player; disconnectedAt: number }>;
  // Preguntados N-player
  pqPlayers: string[];
  pqTurn: string | null;
  pqScores: Map<string, { alias: string; score: number; correct: number }>;
  pqCategoryQIdx: number[];
  pqRound: number;
  pqTotalRounds: number;
  pqAwaitingAnswer: boolean;
  pqCurrentQuestion: any;
  pqQuestionTimer: ReturnType<typeof setTimeout> | null;
  // Truco
  trucoConfig: TrucoConfig | null;
  trucoState: TrucoGameState | null;
  trucoShowEnvidoTimer: ReturnType<typeof setTimeout> | null;
  trucoNextHandTimer: ReturnType<typeof setTimeout> | null;
}

interface LobbyUser {
  socketId: string;
  alias: string;
}

// ── Gateway ───────────────────────────────────────────────────────────────────

@WebSocketGateway({
  cors: { origin: '*', credentials: false },
  namespace: '/game',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private rooms = new Map<string, Room>();
  private socketRoom = new Map<string, string>();
  private lobbyUsers = new Map<string, LobbyUser>();

  constructor(
    @InjectRepository(MinigameInstance)
    private readonly instanceRepo: Repository<MinigameInstance>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(TeacherProfile)
    private readonly teacherRepo: Repository<TeacherProfile>,
    @InjectRepository(StudentProfile)
    private readonly studentRepo: Repository<StudentProfile>,
    @InjectRepository(ParentProfile)
    private readonly parentRepo: Repository<ParentProfile>,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) { client.disconnect(); return; }
    try {
      const payload = this.jwtService.verify<any>(token);
      client.data.user = payload; // { sub, email, role }
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Remove from global lobby if was there
    if (this.lobbyUsers.has(client.id)) {
      this.lobbyUsers.delete(client.id);
      this.emitLobbyUpdate();
    }

    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const player = room.players.get(client.id);

    // During active game: save disconnected player for reconnect (60s grace period)
    if (room.status === 'playing' && player) {
      room.disconnectedPlayers.set(player.alias, { player: { ...player }, disconnectedAt: Date.now() });
      setTimeout(() => { room.disconnectedPlayers.delete(player.alias); }, 60000);
    }

    room.players.delete(client.id);
    this.socketRoom.delete(client.id);

    if (room.players.size === 0) {
      if (room.timer) clearTimeout(room.timer);
      // Grace period: keep empty room for 20s (allows page redirect re-join)
      room.emptyTimer = setTimeout(() => {
        if (room.players.size === 0) {
          this.rooms.delete(roomCode);
          this.emitRoomsUpdate();
        }
      }, 20000);
      return;
    }

    if (room.hostSocketId === client.id) {
      room.hostSocketId = room.players.keys().next().value ?? '';
    }

    this.emitRoomUpdate(roomCode, room);
    this.emitRoomsUpdate();
  }

  // ── join-lobby ────────────────────────────────────────────────────────────
  // Payload: { alias: string }

  @SubscribeMessage('join-lobby')
  async handleJoinLobby(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { alias: string },
  ) {
    let alias = await this.resolveAlias(client, data.alias);
    // Auto-suffix if another active lobby user already holds this alias
    const takenLobby = new Set([...this.lobbyUsers.values()].map(u => u.alias.toLowerCase()));
    let suffix = 2;
    const baseAlias = alias;
    while (takenLobby.has(alias.toLowerCase())) {
      alias = `${baseAlias}#${suffix++}`;
    }
    this.lobbyUsers.set(client.id, { socketId: client.id, alias });
    client.join('global-lobby');

    client.emit('lobby-joined', { alias });
    client.emit('rooms-list', { rooms: this.getPublicRooms() });
    this.emitLobbyUpdate();
  }

  // ── get-rooms ─────────────────────────────────────────────────────────────

  @SubscribeMessage('get-rooms')
  handleGetRooms(@ConnectedSocket() client: Socket) {
    client.emit('rooms-list', { rooms: this.getPublicRooms() });
  }

  // ── lobby-chat ────────────────────────────────────────────────────────────
  // Payload: { text: string }

  @SubscribeMessage('lobby-chat')
  handleLobbyChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { text: string },
  ) {
    const user = this.lobbyUsers.get(client.id);
    if (!user) return;
    const text = String(data.text ?? '').trim().slice(0, 200);
    if (!text) return;
    this.server.to('global-lobby').emit('lobby-chat', { alias: user.alias, text });
  }

  // ── create-room ───────────────────────────────────────────────────────────
  // Payload: { alias: string; roomName: string }

  @SubscribeMessage('create-room')
  async handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      alias?: string;
      roomName: string;
      maxPlayers?: number;
      password?: string;
      trucoConfig?: TrucoConfig;
    },
  ) {
    const alias = await this.resolveAlias(client, data.alias);
    const roomName = (data.roomName ?? '').trim().slice(0, 48);
    const isTruco = !!data.trucoConfig;

    // For truco, derive maxPlayers from mode
    let maxPlayers: number;
    if (isTruco) {
      const modePlayerCount: Record<string, number> = { '1v1': 2, '2v2': 4, '3v3': 6 };
      maxPlayers = modePlayerCount[data.trucoConfig!.mode] ?? 2;
    } else {
      const maxPlayersRaw = typeof data.maxPlayers === 'number' ? data.maxPlayers : Number(data.maxPlayers);
      maxPlayers = Number.isFinite(maxPlayersRaw) ? Math.max(2, Math.min(50, Math.floor(maxPlayersRaw))) : 50;
    }

    const password = String(data.password ?? '').trim().slice(0, 32);
    if (!alias || !roomName) {
      client.emit('error', { message: 'Falta el alias o el nombre de sala.' });
      return;
    }
    if (this.rooms.size >= 100) {
      client.emit('error', { message: 'El servidor está al límite de salas activas. Intentá más tarde.' });
      return;
    }

    // Leave global lobby
    this.lobbyUsers.delete(client.id);
    client.leave('global-lobby');
    this.emitLobbyUpdate();

    // Validate truco config
    let trucoConfig: TrucoConfig | null = null;
    if (isTruco) {
      const tc = data.trucoConfig!;
      trucoConfig = {
        mode: ['1v1', '2v2', '3v3'].includes(tc.mode) ? tc.mode : '1v1',
        maxPoints: tc.maxPoints === 30 ? 30 : 15,
        florEnabled: !!tc.florEnabled,
        contraFlorEnabled: !!tc.contraFlorEnabled && !!tc.florEnabled,
        tableTheme: (['green', 'wood', 'plastic', 'night'] as TableTheme[]).includes(tc.tableTheme)
          ? tc.tableTheme
          : 'green',
      };
    }

    const roomCode = this.generateRoomCode();
    const room: Room = {
      roomCode,
      roomName,
      maxPlayers,
      password: password ? password : null,
      hostSocketId: client.id,
      players: new Map(),
      selectedInstanceId: isTruco ? 'truco' : null,
      selectedTitle: isTruco ? `Truco ${trucoConfig!.mode}` : '',
      gameType: isTruco ? 'truco' : 'quiz',
      gameData: null,
      questions: [],
      currentQ: 0,
      status: 'waiting',
      timer: null,
      emptyTimer: null,
      questionStartedAt: 0,
      timeLimitMs: 20000,
      wsGrid: null,
      wsPlaced: [],
      wsFoundWords: new Map(),
      wsStartedAt: 0,
      disconnectedPlayers: new Map(),
      pqPlayers: [],
      pqTurn: null,
      pqScores: new Map(),
      pqCategoryQIdx: [],
      pqRound: 0,
      pqTotalRounds: 6,
      pqAwaitingAnswer: false,
      pqCurrentQuestion: null,
      pqQuestionTimer: null,
      trucoConfig,
      trucoState: null,
      trucoShowEnvidoTimer: null,
      trucoNextHandTimer: null,
    };
    this.rooms.set(roomCode, room);

    const player: Player = { socketId: client.id, alias, score: 0, answeredThisRound: false, finished: false };
    room.players.set(client.id, player);
    this.socketRoom.set(client.id, roomCode);
    client.join(roomCode);

    client.emit('room-created', { roomCode, roomName, alias, isHost: true, trucoConfig: trucoConfig ?? null });
    this.emitRoomUpdate(roomCode, room);
    this.emitRoomsUpdate();
  }

  // ── join-room ─────────────────────────────────────────────────────────────
  // Payload: { roomCode: string; alias: string }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; alias?: string; password?: string },
  ) {
    let alias = await this.resolveAlias(client, data.alias);
    const roomCode = (data.roomCode ?? '').trim().toUpperCase();
    const password = String(data.password ?? '').trim();

    if (!roomCode || !alias) {
      client.emit('error', { message: 'Falta el código o el alias.' });
      return;
    }

    const room = this.rooms.get(roomCode);
    if (!room)                      { client.emit('error', { message: 'Sala no encontrada. Verificá el código.' }); return; }
    if (room.status === 'finished') { client.emit('error', { message: 'Esta partida ya terminó.' }); return; }

    if (room.status === 'playing') {
      // Allow reconnect if player was in the game and disconnected recently
      const dc = room.disconnectedPlayers.get(alias);
      if (dc && Date.now() - dc.disconnectedAt < 60000) {
        const restoredPlayer = { ...dc.player, socketId: client.id };
        room.disconnectedPlayers.delete(alias);
        room.players.set(client.id, restoredPlayer);
        this.socketRoom.set(client.id, roomCode);
        // If the host reconnects, update their socketId
        if (dc.player.socketId === room.hostSocketId) room.hostSocketId = client.id;
        client.join(roomCode);
        client.emit('reconnected', {
          roomCode,
          roomName: room.roomName,
          alias,
          isHost: room.hostSocketId === client.id,
          gameType: room.gameType,
          score: restoredPlayer.score,
        });
        this.emitRoomUpdate(roomCode, room);
        return;
      }
      client.emit('error', { message: 'La partida ya empezó.' });
      return;
    }

    // Resolve alias conflicts: clean up stale sockets, auto-suffix active ones (#2, #3…)
    const takenAliases = () => new Set([...room.players.values()].map(p => p.alias.toLowerCase()));
    let resolvedAlias = alias;
    const conflictEntry = [...room.players.entries()].find(([, p]) => p.alias.toLowerCase() === alias.toLowerCase());
    if (conflictEntry) {
      const [conflictSocketId] = conflictEntry;
      const conflictSocket = this.server.sockets.get(conflictSocketId);
      if (conflictSocket?.connected) {
        // Active player with same name — auto-assign a numeric suffix (#2, #3…)
        let suffix = 2;
        while (takenAliases().has(`${alias}#${suffix}`.toLowerCase())) suffix++;
        resolvedAlias = `${alias}#${suffix}`;
      } else {
        // Stale disconnected entry — clean up and reuse the alias
        room.players.delete(conflictSocketId);
        this.socketRoom.delete(conflictSocketId);
        if (room.hostSocketId === conflictSocketId) room.hostSocketId = client.id;
      }
    }
    alias = resolvedAlias;

    if (room.password && room.password !== password) {
      client.emit('error', { message: 'Contraseña incorrecta.' });
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      client.emit('error', { message: `La sala está llena (máx. ${room.maxPlayers} jugadores).` });
      return;
    }

    // Cancel empty-room grace timer if room was empty
    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = null;
    }

    // Leave global lobby
    this.lobbyUsers.delete(client.id);
    client.leave('global-lobby');
    this.emitLobbyUpdate();

    const player: Player = { socketId: client.id, alias, score: 0, answeredThisRound: false, finished: false };
    room.players.set(client.id, player);
    this.socketRoom.set(client.id, roomCode);
    client.join(roomCode);

    // If the original host socket is no longer in the room (e.g. page navigation
    // disconnected the old socket), transfer host to whoever is joining now.
    if (!room.players.has(room.hostSocketId)) {
      room.hostSocketId = client.id;
    }
    const isHost = room.hostSocketId === client.id;

    client.emit('joined', {
      roomCode,
      roomName: room.roomName,
      alias,
      isHost,
      selectedInstanceId: room.selectedInstanceId,
      selectedTitle: room.selectedTitle,
      gameType: room.gameType,
      trucoConfig: room.trucoConfig ?? null,
    });

    this.server.to(roomCode).emit('chat', {
      system: true,
      alias,
      text: `${alias} se unió 🎉`,
    });
    this.emitRoomUpdate(roomCode, room);
    this.emitRoomsUpdate();
  }

  // ── get-quizzes ───────────────────────────────────────────────────────────

  @SubscribeMessage('get-quizzes')
  async handleGetQuizzes(@ConnectedSocket() client: Socket) {
    // Select only metadata columns — avoids loading full content_json
    const instances = await this.instanceRepo.find({
      select: { id: true, title: true, game_type: true, question_count: true, content_json: true },
      where: { deleted_at: null as any },
    });
    const quizzes = instances.map(i => {
      // Use pre-computed columns when available, fallback to parsing content_json for legacy rows
      let type: GameType = (i.game_type as GameType) ?? 'quiz';
      let questionCount = i.question_count ?? 0;
      if (!i.game_type) {
        const content = i.content_json as any;
        type = content?.type ?? 'quiz';
        if (type === 'quiz') {
          questionCount = Array.isArray(content?.questions) ? content.questions.length : (Array.isArray(content) ? content.length : 0);
        } else if (type === 'preguntados') {
          const cats = content?.categories ?? [];
          questionCount = cats.reduce((sum: number, c: any) => sum + (c.questions?.length ?? 0), 0);
        } else if (type === 'wordsearch') {
          questionCount = Array.isArray(content?.words) ? content.words.length : 0;
        } else if (type === 'anagram') {
          if (Array.isArray(content?.words)) questionCount = content.words.length;
          else questionCount = content?.word ? 1 : 0;
        }
      }
      return {
        id: i.id,
        title: i.title ?? 'Sin título',
        type,
        questionCount,
      };
    });
    client.emit('quizzes-list', { quizzes });
  }

  // ── pick-game ─────────────────────────────────────────────────────────────
  // Payload: { instanceId: string }

  @SubscribeMessage('pick-game')
  async handlePickGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { instanceId: string },
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.hostSocketId !== client.id || room.status !== 'waiting') return;

    const instance = await this.instanceRepo.findOne({ where: { id: data.instanceId } });
    if (!instance) { client.emit('error', { message: 'Juego no encontrado.' }); return; }

    const contentJson = instance.content_json as any;
    const gameType: GameType = contentJson?.type ?? 'quiz';

    room.selectedInstanceId = data.instanceId;
    room.selectedTitle = (instance as any).title ?? 'Juego';
    room.gameType = gameType;
    const defaultMs = gameType === 'quiz' ? 20000 : gameType === 'wordsearch' ? 180000 : gameType === 'preguntados' ? 20000 : 60000;
    room.timeLimitMs = (instance.config_json as any)?.default_time_ms ?? defaultMs;

    if (gameType === 'quiz') {
      const rawQuestions = Array.isArray(contentJson) ? contentJson : (contentJson?.questions ?? []);
      if (rawQuestions.length === 0) { client.emit('error', { message: 'El quiz no tiene preguntas.' }); return; }
      const shuffle = <T>(arr: T[]): T[] => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      const normText = (v: unknown) => String(v ?? '').trim();
      const normAnswer = (v: unknown) =>
        normText(v)
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9 ]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

      room.questions = rawQuestions.map((q: any) => {
        const type = String(q?.type ?? 'mcq') as 'mcq' | 'true_false' | 'fill_blank' | 'order' | 'match';
        const base = {
          type,
          text: q.text ?? q.question ?? '',
          points_correct: q.points_correct ?? 100,
          time_limit_ms: q.time_limit_ms ?? room.timeLimitMs,
        };

        if (type === 'true_false') {
          const correctBool = typeof q.correct === 'boolean'
            ? q.correct
            : String(q.correct_option_id ?? '').toLowerCase() === 'true';
          return {
            ...base,
            options: [
              { id: 'true', text: 'Verdadero' },
              { id: 'false', text: 'Falso' },
            ],
            correct_option_id: correctBool ? 'true' : 'false',
          };
        }

        if (type === 'fill_blank') {
          const answerRaw = normText(q.answer ?? q.correct ?? '');
          return {
            ...base,
            answer_raw: answerRaw,
            answer_norm: normAnswer(answerRaw),
          };
        }

        if (type === 'order') {
          const itemsRaw: string[] = Array.isArray(q.items) ? q.items.map(normText).filter(Boolean) : [];
          return {
            ...base,
            items_client: shuffle(itemsRaw),
            correct_items_raw: itemsRaw,
            correct_items_norm: itemsRaw.map(normAnswer),
          };
        }

        if (type === 'match') {
          const pairsRaw: { left: string; right: string }[] = Array.isArray(q.pairs)
            ? q.pairs.map((p: any) => ({ left: normText(p?.left), right: normText(p?.right) })).filter((p: any) => p.left && p.right)
            : [];
          const left = pairsRaw.map((p) => p.left);
          const right = pairsRaw.map((p) => p.right);
          const correct_map_norm: Record<string, string> = {};
          for (const p of pairsRaw) correct_map_norm[normAnswer(p.left)] = normAnswer(p.right);
          return {
            ...base,
            left,
            right_client: shuffle(right),
            correct_pairs_raw: pairsRaw,
            correct_map_norm,
          };
        }

        // Default: MCQ (backwards compatible)
        const opts: any[] = Array.isArray(q.options) ? q.options : [];
        const normOpts = opts.map((o: any, i: number) =>
          typeof o === 'string' ? { id: String(i), text: o } : o,
        );
        return {
          ...base,
          type: 'mcq',
          options: normOpts,
          correct_option_id: String(q.correct_option_id ?? '0'),
        };
      });
      room.gameData = null;
    } else if (gameType === 'wordsearch') {
      room.questions = [];
      room.gameData = {
        words: contentJson?.words ?? [],
        gridSize: contentJson?.grid_size ?? 10,
      };
    } else if (gameType === 'anagram') {
      room.questions = [];
      const direct = String(contentJson?.word ?? '').trim().toUpperCase();
      const poolRaw: unknown = contentJson?.words;
      const pool: string[] = Array.isArray(poolRaw)
        ? (poolRaw as any[]).map((w) => String(w ?? '').trim().toUpperCase().replace(/[^A-ZÃÃ‰ÃÃ“ÃšÃ‘Ãœ]/g, '')).filter(Boolean)
        : [];
      const words: string[] = [
        ...(direct ? [direct] : []),
        ...pool.filter((w) => w !== direct),
      ];
      if (!words.length) { client.emit('error', { message: 'El anagrama no tiene palabras.' }); return; }
      // Shuffle once on the server so all players share the same word order
      for (let i = words.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [words[i], words[j]] = [words[j], words[i]];
      }
      room.gameData = {
        words,
        hint: contentJson?.hint ?? '',
      };
    } else if (gameType === 'preguntados') {
      room.questions = [];
      room.gameData = {
        categories: (contentJson?.categories ?? []).map((c: any) => ({
          name: c.name ?? '',
          color: c.color ?? '#7c3aed',
          icon: c.icon ?? '❓',
          questions: (c.questions ?? []).map((q: any) => {
            const opts: any[] = Array.isArray(q.options) ? q.options : [];
            return {
              text: q.text ?? q.question ?? '',
              options: opts.map((o: any, i: number) =>
                typeof o === 'string' ? { id: String(i), text: o } : o,
              ),
              correct_option_id: String(q.correct_option_id ?? '0'),
            };
          }),
        })),
        rounds: contentJson?.rounds ?? 6,
      };
    }

    this.server.to(roomCode).emit('game-picked', {
      instanceId: data.instanceId,
      title: room.selectedTitle,
      gameType: room.gameType,
      questionCount: room.questions.length,
    });
    this.emitRoomUpdate(roomCode, room);
  }

  // ── chat-message ──────────────────────────────────────────────────────────

  @SubscribeMessage('chat-message')
  handleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { text: string },
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const player = room.players.get(client.id);
    if (!player) return;

    const text = String(data.text ?? '').trim().slice(0, 200);
    if (!text) return;

    this.server.to(roomCode).emit('chat', { system: false, alias: player.alias, text });
  }

  // ── react ─────────────────────────────────────────────────────────────────

  @SubscribeMessage('react')
  handleReact(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { emoji: string },
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const player = room.players.get(client.id);
    if (!player) return;

    const allowed = ['🔥','❤️','😂','😮','👏','💀'];
    const emoji = allowed.includes(data.emoji) ? data.emoji : '🔥';
    this.server.to(roomCode).emit('reaction', { alias: player.alias, emoji });
  }

  // ── restart-room ──────────────────────────────────────────────────────────

  @SubscribeMessage('restart-room')
  handleRestartRoom(@ConnectedSocket() client: Socket) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.hostSocketId !== client.id) return;

    if (room.timer) clearTimeout(room.timer);
    room.status = 'waiting';
    room.currentQ = 0;
    room.selectedInstanceId = null;
    room.selectedTitle = '';
    room.gameType = 'quiz';
    room.gameData = null;
    room.questions = [];
    room.wsGrid = null;
    room.wsPlaced = [];
    room.wsFoundWords = new Map();
    room.wsStartedAt = 0;
    room.disconnectedPlayers = new Map();
    room.pqPlayers = [];
    room.pqTurn = null;
    room.pqScores = new Map();
    room.pqCategoryQIdx = [];
    room.pqRound = 0;
    room.pqTotalRounds = 6;
    room.pqAwaitingAnswer = false;
    room.pqCurrentQuestion = null;
    if (room.pqQuestionTimer) clearTimeout(room.pqQuestionTimer);
    room.pqQuestionTimer = null;
    // Truco state reset
    if (room.trucoShowEnvidoTimer) clearTimeout(room.trucoShowEnvidoTimer);
    if (room.trucoNextHandTimer) clearTimeout(room.trucoNextHandTimer);
    room.trucoShowEnvidoTimer = null;
    room.trucoNextHandTimer = null;
    room.trucoConfig = null;
    room.trucoState = null;

    for (const p of room.players.values()) {
      p.score = 0;
      p.answeredThisRound = false;
      p.finished = false;
    }

    this.server.to(roomCode).emit('room-restarted', { roomCode, roomName: room.roomName });
    this.emitRoomUpdate(roomCode, room);
    this.emitRoomsUpdate();
  }

  // ── start-game ────────────────────────────────────────────────────────────

  @SubscribeMessage('start-game')
  handleStartGame(@ConnectedSocket() client: Socket) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room) return;

    if (room.hostSocketId !== client.id) {
      client.emit('error', { message: 'Solo el host puede iniciar.' }); return;
    }
    if (room.status !== 'waiting') {
      client.emit('error', { message: 'La partida ya está en curso.' }); return;
    }
    if (!room.selectedInstanceId) {
      client.emit('error', { message: 'Elegí un juego primero.' }); return;
    }

    room.status = 'playing';
    for (const p of room.players.values()) {
      p.score = 0;
      p.answeredThisRound = false;
      p.finished = false;
    }

    if (room.gameType === 'quiz') {
      if (room.questions.length === 0) {
        room.status = 'waiting';
        client.emit('error', { message: 'El quiz no tiene preguntas.' }); return;
      }
      room.currentQ = 0;
      this.server.to(roomCode).emit('game-started', {
        gameType: 'quiz',
        totalQuestions: room.questions.length,
      });
      setTimeout(() => this.sendQuestion(roomCode, room), 1500);
    } else if (room.gameType === 'wordsearch') {
      const words: string[] = (room.gameData?.words ?? []).map((w: string) => w.toUpperCase());
      const gridSize: number = room.gameData?.gridSize ?? 10;
      const { grid, placed } = this.generateWSGrid(words, gridSize);
      room.wsGrid = grid;
      room.wsPlaced = placed;
      room.wsFoundWords = new Map();
      room.wsStartedAt = Date.now();
      this.server.to(roomCode).emit('game-started', {
        gameType: 'wordsearch',
        gameData: { words, grid, placed, gridSize },
        timeLimitMs: room.timeLimitMs,
      });
      room.timer = setTimeout(() => this.endGame(roomCode, room), room.timeLimitMs + 5000);
    } else if (room.gameType === 'anagram') {
      this.server.to(roomCode).emit('game-started', {
        gameType: 'anagram',
        gameData: room.gameData,
        timeLimitMs: room.timeLimitMs,
      });
      room.timer = setTimeout(() => this.endGame(roomCode, room), room.timeLimitMs + 5000);
    } else if (room.gameType === 'preguntados') {
      const playerIds = [...room.players.keys()];
      if (playerIds.length < 2) {
        room.status = 'waiting';
        client.emit('error', { message: 'Se necesitan al menos 2 jugadores para Preguntados.' }); return;
      }
      const cats = room.gameData?.categories ?? [];
      if (cats.length === 0) {
        room.status = 'waiting';
        client.emit('error', { message: 'El juego no tiene categorías.' }); return;
      }
      const n = Math.min(playerIds.length, 10);
      room.pqPlayers = playerIds.slice(0, n);
      room.pqTurn = room.pqPlayers[0];
      room.pqScores = new Map(room.pqPlayers.map(id => [id, {
        alias: room.players.get(id)!.alias, score: 0, correct: 0,
      }]));
      room.pqCategoryQIdx = new Array(cats.length).fill(0);
      room.pqRound = 0;
      const baseRounds = room.gameData?.rounds ?? 6;
      const roundsPerPlayer = Math.max(2, Math.ceil(baseRounds / n));
      room.pqTotalRounds = roundsPerPlayer * n;
      room.pqAwaitingAnswer = false;
      room.pqCurrentQuestion = null;
      const pqPlayers = room.pqPlayers.map(id => ({
        alias: room.pqScores.get(id)!.alias, score: 0,
      }));
      this.server.to(roomCode).emit('game-started', {
        gameType: 'preguntados',
        gameData: {
          categories: cats.map((c: any) => ({ name: c.name, color: c.color, icon: c.icon })),
          rounds: room.pqTotalRounds,
        },
        players: pqPlayers,
        turnAlias: room.players.get(room.pqTurn)?.alias,
      });
    } else if (room.gameType === 'truco') {
      if (!room.trucoConfig) {
        room.status = 'waiting';
        client.emit('error', { message: 'Configuración de Truco faltante.' }); return;
      }
      const modeCount: Record<string, number> = { '1v1': 2, '2v2': 4, '3v3': 6 };
      const required = modeCount[room.trucoConfig.mode] ?? 2;
      if (room.players.size !== required) {
        room.status = 'waiting';
        client.emit('error', {
          message: `Se necesitan exactamente ${required} jugadores para el modo ${room.trucoConfig.mode}.`
        }); return;
      }
      // Initialize truco game
      const seatOrder = [...room.players.keys()];
      const aliases: Record<string, string> = {};
      for (const [sid, p] of room.players.entries()) aliases[sid] = p.alias;
      room.trucoState = initTrucoGame(seatOrder, aliases, room.trucoConfig);
      // Emit game-started to everyone (generic)
      this.server.to(roomCode).emit('game-started', { gameType: 'truco' });
      // Send personalized state to each player
      setTimeout(() => this.emitTrucoState(roomCode, room), 300);
    }
  }

  // ── Truco: broadcast per-player state ─────────────────────────────────────

  private emitTrucoState(roomCode: string, room: Room) {
    if (!room.trucoState) return;
    for (const [socketId] of room.players.entries()) {
      const view = buildPlayerView(room.trucoState, socketId);
      this.server.to(socketId).emit('truco-state', view);
    }
  }

  // ── truco-action ─────────────────────────────────────────────────────────
  // Payload: TrucoAction

  @SubscribeMessage('truco-action')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleTrucoAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() rawData: any,
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.gameType !== 'truco' || !room.trucoState) {
      client.emit('error', { message: 'No hay partida de Truco activa.' }); return;
    }

    // Translate frontend-friendly action names → engine action format
    const data: TrucoAction = translateTrucoAction(room.trucoState, client.id, rawData);

    // Theme change: host only
    if (data.type === 'change-theme') {
      if (room.hostSocketId !== client.id) {
        client.emit('error', { message: 'Solo el anfitrión puede cambiar el tapete.' }); return;
      }
      const res = trucoHandleAction(room.trucoState, client.id, data);
      if (res.error) { client.emit('error', { message: res.error }); return; }
      room.trucoState = res.newState;
      this.emitTrucoState(roomCode, room);
      return;
    }

    const result = trucoHandleAction(room.trucoState, client.id, data);
    if (result.error) {
      client.emit('error', { message: result.error }); return;
    }
    room.trucoState = result.newState;

    // Handle phase transitions
    const phase = room.trucoState.phase;

    if (phase === 'show_envido' || phase === 'show_envido_points') {
      // Broadcast updated state
      this.emitTrucoState(roomCode, room);
      // Start 30s timer for auto-hide
      if (room.trucoShowEnvidoTimer) clearTimeout(room.trucoShowEnvidoTimer);
      room.trucoShowEnvidoTimer = setTimeout(() => {
        if (room.trucoState?.phase === 'show_envido' || room.trucoState?.phase === 'show_envido_points') {
          room.trucoState = timeoutShowEnvido(room.trucoState);
          this.emitTrucoState(roomCode, room);
          this.scheduleTrucoNextHand(roomCode, room);
        }
      }, 30000);
    } else if (phase === 'hand_end') {
      this.emitTrucoState(roomCode, room);
      // Auto-deal next hand after 5 seconds
      this.scheduleTrucoNextHand(roomCode, room);
    } else if (phase === 'game_over') {
      room.status = 'finished';
      this.emitTrucoState(roomCode, room);
    } else {
      this.emitTrucoState(roomCode, room);
    }

    // If show_envido phase resolved → schedule next hand
    if (data.type === 'show-envido' || data.type === 'hide-envido') {
      if (phase === 'hand_end' || phase === 'game_over') {
        if (room.trucoShowEnvidoTimer) { clearTimeout(room.trucoShowEnvidoTimer); room.trucoShowEnvidoTimer = null; }
        if (phase === 'hand_end') this.scheduleTrucoNextHand(roomCode, room);
      }
    }
  }

  private scheduleTrucoNextHand(roomCode: string, room: Room) {
    if (room.trucoNextHandTimer) clearTimeout(room.trucoNextHandTimer);
    room.trucoNextHandTimer = setTimeout(() => {
      if (!room.trucoState || room.trucoState.phase !== 'hand_end') return;
      const res = trucoHandleAction(room.trucoState, room.trucoState.seatOrder[0], { type: 'next-hand' });
      if (!res.error) {
        room.trucoState = res.newState;
        this.emitTrucoState(roomCode, room);
      }
    }, 5000);
  }

  // ── game-complete (wordsearch / anagram) ──────────────────────────────────
  // Payload: { score: number }

  @SubscribeMessage('game-complete')
  handleGameComplete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { score: number },
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'playing') return;

    const player = room.players.get(client.id);
    if (!player || player.finished) return;

    player.finished = true;
    player.score = Math.max(0, Math.round(Number(data.score) || 0));

    this.server.to(roomCode).emit('player-finished', {
      alias: player.alias,
      score: player.score,
      scoreboard: this.buildScoreboard(room),
    });

    const allFinished = [...room.players.values()].every(p => p.finished);
    if (allFinished) {
      if (room.timer) clearTimeout(room.timer);
      this.endGame(roomCode, room);
    }
  }

  // ── find-word (wordsearch multiplayer) ────────────────────────────────────
  // Payload: { word: string, cells: {r,c}[] }

  @SubscribeMessage('find-word')
  handleFindWord(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { word: string; cells: WsCell[] },
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'playing' || room.gameType !== 'wordsearch') return;

    const player = room.players.get(client.id);
    if (!player) return;

    const word = (data.word ?? '').toUpperCase().trim();
    if (!word || room.wsFoundWords.has(word)) return;

    // Validate word exists in placed list
    const placed = room.wsPlaced.find(p => p.word === word);
    if (!placed || placed.cells.length === 0) return;

    // Validate cells match the placed word cells (order-insensitive: check set equality)
    const submittedCells: WsCell[] = Array.isArray(data.cells) ? data.cells : placed.cells;
    const expectedSet = new Set(placed.cells.map(c => `${c.r},${c.c}`));
    const submittedSet = new Set(submittedCells.map(c => `${c.r},${c.c}`));
    const valid = expectedSet.size === submittedSet.size && [...expectedSet].every(k => submittedSet.has(k));
    if (!valid) return;

    // Score: 100 per letter + time bonus (up to 100 extra)
    const elapsed = Date.now() - room.wsStartedAt;
    const timeRatio = Math.max(0, 1 - elapsed / room.timeLimitMs);
    const points = Math.round(word.length * 100 * (1 + timeRatio));
    player.score += points;

    const colorIndex = room.wsFoundWords.size % 8;
    room.wsFoundWords.set(word, { alias: player.alias, cells: placed.cells, colorIndex });

    this.server.to(roomCode).emit('word-found', {
      word,
      alias: player.alias,
      cells: placed.cells,
      colorIndex,
      points,
      scoreboard: this.buildScoreboard(room),
      wordsLeft: room.wsPlaced.filter(p => p.cells.length > 0).length - room.wsFoundWords.size,
    });

    // End game if all words found
    const totalPlaced = room.wsPlaced.filter(p => p.cells.length > 0).length;
    if (room.wsFoundWords.size >= totalPlaced) {
      if (room.timer) clearTimeout(room.timer);
      setTimeout(() => this.endGame(roomCode, room), 1500);
    }
  }

  // ── pq-spin ───────────────────────────────────────────────────────────────

  @SubscribeMessage('pq-spin')
  handlePqSpin(@ConnectedSocket() client: Socket) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'playing' || room.gameType !== 'preguntados') return;
    if (room.pqTurn !== client.id || room.pqAwaitingAnswer) return;

    const cats: any[] = room.gameData?.categories ?? [];
    if (cats.length === 0) return;

    const categoryIdx = Math.floor(Math.random() * cats.length);
    const cat = cats[categoryIdx];
    const qIdx = room.pqCategoryQIdx[categoryIdx] % Math.max(1, cat.questions?.length ?? 1);
    room.pqCategoryQIdx[categoryIdx]++;

    const question = cat.questions?.[qIdx];
    if (!question) { client.emit('error', { message: 'Sin preguntas en esta categoría.' }); return; }

    room.pqCurrentQuestion = question;
    room.pqAwaitingAnswer = true;
    const turnAlias = room.players.get(room.pqTurn!)?.alias ?? '';

    this.server.to(roomCode).emit('pq-spin-result', {
      categoryIdx,
      categoryName: cat.name,
      categoryColor: cat.color,
      categoryIcon: cat.icon,
      turnAlias,
    });

    const { correct_option_id, ...questionForClient } = question;
    void correct_option_id;

    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      this.server.to(roomCode).emit('pq-question', {
        question: questionForClient,
        categoryName: cat.name,
        categoryColor: cat.color,
        categoryIcon: cat.icon,
        turnAlias,
        timeLimitMs: 20000,
      });
      room.pqQuestionTimer = setTimeout(() => this.pqTimeOut(roomCode, room), 20500);
    }, 3500);
  }

  // ── pq-answer ─────────────────────────────────────────────────────────────

  @SubscribeMessage('pq-answer')
  handlePqAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { optionId: string },
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'playing' || room.gameType !== 'preguntados') return;
    if (room.pqTurn !== client.id || !room.pqAwaitingAnswer) return;

    if (room.pqQuestionTimer) { clearTimeout(room.pqQuestionTimer); room.pqQuestionTimer = null; }
    this.pqProcessAnswer(roomCode, room, data.optionId);
  }

  // ── kick-player ───────────────────────────────────────────────────────────

  @SubscribeMessage('kick-player')
  handleKickPlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { alias: string },
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.hostSocketId !== client.id || room.status !== 'waiting') return;

    const target = [...room.players.values()].find(p => p.alias === data.alias && p.socketId !== client.id);
    if (!target) return;

    const targetSocket = this.server.sockets.get(target.socketId);
    if (targetSocket) {
      targetSocket.emit('kicked', { message: 'Fuiste expulsado de la sala.' });
      targetSocket.leave(roomCode);
    }
    room.players.delete(target.socketId);
    this.socketRoom.delete(target.socketId);

    this.server.to(roomCode).emit('chat', { system: true, alias: target.alias, text: `${target.alias} fue expulsado. 🚫` });
    this.emitRoomUpdate(roomCode, room);
    this.emitRoomsUpdate();
  }

  // ── promote-player ────────────────────────────────────────────────────────

  @SubscribeMessage('promote-player')
  handlePromotePlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { alias: string },
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.hostSocketId !== client.id || room.status !== 'waiting') return;

    const target = [...room.players.values()].find(p => p.alias === data.alias && p.socketId !== client.id);
    if (!target) return;

    room.hostSocketId = target.socketId;
    this.server.to(roomCode).emit('chat', { system: true, alias: target.alias, text: `${target.alias} es el nuevo líder. 👑` });
    this.emitRoomUpdate(roomCode, room);
  }

  // ── submit-answer ─────────────────────────────────────────────────────────

  @SubscribeMessage('submit-answer')
  handleSubmitAnswer(
    @ConnectedSocket() client: Socket,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @MessageBody() data: any,
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'playing' || room.gameType !== 'quiz') return;

    const player = room.players.get(client.id);
    if (!player || player.answeredThisRound) return;

    player.answeredThisRound = true;

    const q = room.questions[room.currentQ];
    const qt = String(q.type ?? 'mcq');
    const normAnswer = (v: unknown) =>
      String(v ?? '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    let isCorrect = false;
    const correctOptionId = (qt === 'mcq' || qt === 'true_false') ? String(q.correct_option_id ?? '') : '';
    const correctAnswer =
      qt === 'fill_blank' ? q.answer_raw
      : qt === 'order' ? q.correct_items_raw
      : qt === 'match' ? q.correct_pairs_raw
      : null;

    if (qt === 'mcq' || qt === 'true_false') {
      const optionId = String(data?.optionId ?? '');
      isCorrect = optionId === String(q.correct_option_id ?? '');
    } else if (qt === 'fill_blank') {
      const text = String(data?.text ?? data?.answer ?? '');
      isCorrect = normAnswer(text) === String(q.answer_norm ?? '');
    } else if (qt === 'order') {
      const order = Array.isArray(data?.order) ? data.order : [];
      const norm = order.map(normAnswer);
      const exp: string[] = Array.isArray(q.correct_items_norm) ? q.correct_items_norm : [];
      isCorrect = norm.length === exp.length && norm.every((v: string, i: number) => v === exp[i]);
    } else if (qt === 'match') {
      const matches = (data?.matches && typeof data.matches === 'object') ? data.matches : {};
      const left: string[] = Array.isArray(q.left) ? q.left : [];
      const cmap: Record<string, string> = q.correct_map_norm ?? {};
      isCorrect = left.length > 0 && left.every((l) => {
        const k = normAnswer(l);
        const got = normAnswer(matches[l] ?? matches[k] ?? '');
        return got && got === String(cmap[k] ?? '');
      });
    } else {
      const optionId = String(data?.optionId ?? '');
      isCorrect = optionId === String(q.correct_option_id ?? '');
    }
    const elapsed = Date.now() - room.questionStartedAt;
    const timeLimitMs = q.time_limit_ms ?? room.timeLimitMs;

    if (isCorrect) {
      const timeRatio = Math.max(0, 1 - elapsed / timeLimitMs);
      const bonus = Math.round(timeRatio * 500);
      player.score += (q.points_correct ?? 100) + bonus;
    }

    client.emit('answer-result', {
      questionType: qt,
      correct: isCorrect,
      correctOptionId,
      correctAnswer,
      score: player.score,
    });

    this.server.to(roomCode).emit('player-answered', { alias: player.alias });

    const allAnswered = [...room.players.values()].every(p => p.answeredThisRound);
    if (allAnswered) {
      if (room.timer) clearTimeout(room.timer);
      setTimeout(() => this.advanceQuestion(roomCode, room), 800);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getPublicRooms() {
    return [...this.rooms.values()]
      .filter(r => r.status === 'waiting')
      .map(r => ({
        roomCode: r.roomCode,
        roomName: r.roomName,
        playerCount: r.players.size,
        hostAlias: r.players.get(r.hostSocketId)?.alias ?? '—',
        maxPlayers: r.maxPlayers,
        locked: !!r.password,
        gameType: r.gameType,
        trucoConfig: r.trucoConfig ?? null,
      }));
  }

  private emitRoomsUpdate() {
    this.server.to('global-lobby').emit('rooms-list', { rooms: this.getPublicRooms() });
  }

  private emitLobbyUpdate() {
    const users = [...this.lobbyUsers.values()].map(u => ({ socketId: u.socketId, alias: u.alias }));
    this.server.to('global-lobby').emit('lobby-update', { users });
  }

  private async resolveAlias(client: Socket, fallback?: string) {
    const fallbackAlias = (fallback ?? '').trim().slice(0, 48);
    const payload = client.data?.user as { sub?: string; role?: string; email?: string } | undefined;
    const userId = payload?.sub ?? '';
    const role = payload?.role ?? '';

    if (!userId || !role) return fallbackAlias || 'Anónimo';

    try {
      if (role === 'teacher') {
        const p = await this.teacherRepo.findOne({ where: { user_id: userId } });
        const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
        if (name) return name.slice(0, 48);
      }

      if (role === 'parent') {
        const p = await this.parentRepo.findOne({ where: { user_id: userId } });
        const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim();
        if (name) return name.slice(0, 48);
      }

      if (role === 'student') {
        const p = await this.studentRepo.findOne({ where: { user_id: userId } });
        const name = (p?.alias ?? '').trim();
        if (name) return name.slice(0, 48);
      }

      const u = await this.userRepo.findOne({ where: { id: userId } });
      const email = (u?.email ?? payload?.email ?? '').trim();
      if (email) return email.slice(0, 48);
    } catch {
      // ignore
    }

    return fallbackAlias || 'Anónimo';
  }

  private generateRoomCode(): string {
    // Cryptographically secure room code — 6 uppercase alphanumeric chars
    const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous I/1/O/0
    let code: string;
    do {
      code = Array.from(randomBytes(6))
        .map(b => CHARS[b % CHARS.length])
        .join('');
    } while (this.rooms.has(code));
    return code;
  }

  private sendQuestion(roomCode: string, room: Room) {
    if (room.currentQ >= room.questions.length) {
      this.endGame(roomCode, room);
      return;
    }

    for (const p of room.players.values()) p.answeredThisRound = false;

    const q = room.questions[room.currentQ];
    const timeLimitMs = q.time_limit_ms ?? room.timeLimitMs;
    room.questionStartedAt = Date.now();

    // Strip correct answer data before sending to clients
    let questionForClient: any = null;
    const qt = String(q.type ?? 'mcq');
    if (qt === 'mcq' || qt === 'true_false') {
      const { correct_option_id, ...rest } = q;
      void correct_option_id;
      questionForClient = rest;
    } else if (qt === 'fill_blank') {
      questionForClient = { type: 'fill_blank', text: q.text, image_url: q.image_url };
    } else if (qt === 'order') {
      questionForClient = { type: 'order', text: q.text, items: q.items_client ?? [] };
    } else if (qt === 'match') {
      questionForClient = { type: 'match', text: q.text, left: q.left ?? [], right: q.right_client ?? [] };
    } else {
      const { correct_option_id, ...rest } = q;
      void correct_option_id;
      questionForClient = rest;
    }

    this.server.to(roomCode).emit('question', {
      index: room.currentQ,
      total: room.questions.length,
      question: questionForClient,
      timeLimitMs,
    });

    room.timer = setTimeout(() => this.advanceQuestion(roomCode, room), timeLimitMs + 500);
  }

  private advanceQuestion(roomCode: string, room: Room) {
    if (room.status !== 'playing') return;

    const q = room.questions[room.currentQ];
    const qt = String(q.type ?? 'mcq');
    const correctOptionId = (qt === 'mcq' || qt === 'true_false') ? q.correct_option_id : '';
    const correctAnswer =
      qt === 'fill_blank' ? q.answer_raw
      : qt === 'order' ? q.correct_items_raw
      : qt === 'match' ? q.correct_pairs_raw
      : null;
    this.server.to(roomCode).emit('round-end', {
      questionType: qt,
      correctOptionId,
      correctAnswer,
      scoreboard: this.buildScoreboard(room),
    });

    room.currentQ++;
    room.timer = setTimeout(() => {
      if (room.currentQ < room.questions.length) {
        this.sendQuestion(roomCode, room);
      } else {
        this.endGame(roomCode, room);
      }
    }, 1500);
  }

  private endGame(roomCode: string, room: Room) {
    room.status = 'finished';
    this.server.to(roomCode).emit('game-over', { scoreboard: this.buildScoreboard(room) });
    setTimeout(() => {
      this.rooms.delete(roomCode);
      this.emitRoomsUpdate();
    }, 30 * 60 * 1000);
  }

  private buildScoreboard(room: Room) {
    return [...room.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, alias: p.alias, score: p.score }));
  }

  private emitRoomUpdate(roomCode: string, room: Room) {
    this.server.to(roomCode).emit('room-update', {
      players: [...room.players.values()].map(p => ({ alias: p.alias, score: p.score })),
      hostAlias: room.players.get(room.hostSocketId)?.alias ?? null,
      status: room.status,
      roomName: room.roomName,
      selectedTitle: room.selectedTitle,
      gameType: room.gameType,
    });
  }

  private pqProcessAnswer(roomCode: string, room: Room, optionId: string | null) {
    room.pqAwaitingAnswer = false;
    const correct = optionId !== null && optionId === room.pqCurrentQuestion?.correct_option_id;
    const ps = room.pqScores.get(room.pqTurn!);
    if (correct && ps) {
      ps.score += 100;
      ps.correct++;
      const p = room.players.get(room.pqTurn!);
      if (p) p.score = ps.score;
    }
    const scoreboard = room.pqPlayers.map(id => {
      const s = room.pqScores.get(id)!;
      return { alias: s.alias, score: s.score, correct: s.correct };
    });
    this.server.to(roomCode).emit('pq-answer-result', {
      correct,
      answered: optionId !== null,   // false = timeout, true = answered (correct or wrong)
      correctOptionId: room.pqCurrentQuestion?.correct_option_id ?? '',
      answererAlias: room.players.get(room.pqTurn!)?.alias ?? '',
      scoreboard,
    });
    room.pqRound++;
    if (room.pqRound >= room.pqTotalRounds) {
      setTimeout(() => this.endGame(roomCode, room), 3000);
      return;
    }
    const idx = room.pqPlayers.indexOf(room.pqTurn!);
    room.pqTurn = room.pqPlayers[(idx + 1) % room.pqPlayers.length];
    setTimeout(() => {
      this.server.to(roomCode).emit('pq-next-turn', {
        turnAlias: room.players.get(room.pqTurn!)?.alias ?? '',
        round: room.pqRound + 1,
        totalRounds: room.pqTotalRounds,
        scoreboard,
      });
    }, 3000);
  }

  private pqTimeOut(roomCode: string, room: Room) {
    if (!room.pqAwaitingAnswer) return;
    this.pqProcessAnswer(roomCode, room, null);
  }

  private generateWSGrid(words: string[], size: number): { grid: string[][]; placed: { word: string; cells: WsCell[] }[] } {
    const DIRS: [number, number][] = [[0,1],[1,0],[1,1],[1,-1],[-1,0],[0,-1],[-1,-1],[-1,1]];
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''));
    const placed: { word: string; cells: WsCell[] }[] = [];

    for (const word of words) {
      let success = false;
      for (let attempt = 0; attempt < 200 && !success; attempt++) {
        const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
        const startR = Math.floor(Math.random() * size);
        const startC = Math.floor(Math.random() * size);
        const endR = startR + dir[0] * (word.length - 1);
        const endC = startC + dir[1] * (word.length - 1);
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
        const cells: WsCell[] = [];
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          const r = startR + dir[0] * i;
          const c = startC + dir[1] * i;
          if (grid[r][c] !== '' && grid[r][c] !== word[i]) { ok = false; break; }
          cells.push({ r, c });
        }
        if (!ok) continue;
        for (let i = 0; i < word.length; i++) grid[cells[i].r][cells[i].c] = word[i];
        placed.push({ word, cells });
        success = true;
      }
      // Words that can't be placed are simply omitted — don't add empty placeholders
      // that would appear in the word list but be impossible to find
    }

    // Fill empty cells with random letters
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!grid[r][c]) grid[r][c] = LETTERS[Math.floor(Math.random() * LETTERS.length)];

    return { grid, placed };
  }
}

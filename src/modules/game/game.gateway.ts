import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MinigameInstance } from '../minigame-instances/entities/minigame-instance.entity';

// ── Types ─────────────────────────────────────────────────────────────────────

type GameType = 'quiz' | 'wordsearch' | 'anagram' | 'preguntados';

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
  // Preguntados 1v1
  pqPlayers: string[];
  pqTurn: string | null;
  pqScores: Map<string, { alias: string; score: number; correct: number }>;
  pqCategoryQIdx: number[];
  pqRound: number;
  pqTotalRounds: number;
  pqAwaitingAnswer: boolean;
  pqCurrentQuestion: any;
  pqQuestionTimer: ReturnType<typeof setTimeout> | null;
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
  server: Server;

  private rooms = new Map<string, Room>();
  private socketRoom = new Map<string, string>();
  private lobbyUsers = new Map<string, LobbyUser>();

  constructor(
    @InjectRepository(MinigameInstance)
    private readonly instanceRepo: Repository<MinigameInstance>,
  ) {}

  handleConnection(_client: Socket) {}

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
  handleJoinLobby(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { alias: string },
  ) {
    const alias = (data.alias ?? '').trim().slice(0, 24) || 'Anónimo';
    this.lobbyUsers.set(client.id, { socketId: client.id, alias });
    client.join('global-lobby');

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
  handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { alias: string; roomName: string },
  ) {
    const alias = data.alias?.trim();
    const roomName = data.roomName?.trim();
    if (!alias || !roomName) {
      client.emit('error', { message: 'Falta el alias o el nombre de sala.' });
      return;
    }

    // Leave global lobby
    this.lobbyUsers.delete(client.id);
    client.leave('global-lobby');
    this.emitLobbyUpdate();

    const roomCode = this.generateRoomCode();
    const room: Room = {
      roomCode,
      roomName,
      hostSocketId: client.id,
      players: new Map(),
      selectedInstanceId: null,
      selectedTitle: '',
      gameType: 'quiz',
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
      pqPlayers: [],
      pqTurn: null,
      pqScores: new Map(),
      pqCategoryQIdx: [],
      pqRound: 0,
      pqTotalRounds: 6,
      pqAwaitingAnswer: false,
      pqCurrentQuestion: null,
      pqQuestionTimer: null,
    };
    this.rooms.set(roomCode, room);

    const player: Player = { socketId: client.id, alias, score: 0, answeredThisRound: false, finished: false };
    room.players.set(client.id, player);
    this.socketRoom.set(client.id, roomCode);
    client.join(roomCode);

    client.emit('room-created', { roomCode, roomName, alias, isHost: true });
    this.emitRoomUpdate(roomCode, room);
    this.emitRoomsUpdate();
  }

  // ── join-room ─────────────────────────────────────────────────────────────
  // Payload: { roomCode: string; alias: string }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; alias: string },
  ) {
    const alias = data.alias?.trim();
    const roomCode = (data.roomCode ?? '').trim().toUpperCase();

    if (!roomCode || !alias) {
      client.emit('error', { message: 'Falta el código o el alias.' });
      return;
    }

    const room = this.rooms.get(roomCode);
    if (!room)                     { client.emit('error', { message: 'Sala no encontrada. Verificá el código.' }); return; }
    if (room.status === 'playing') { client.emit('error', { message: 'La partida ya empezó.' }); return; }
    if (room.status === 'finished'){ client.emit('error', { message: 'Esta partida ya terminó.' }); return; }

    const taken = [...room.players.values()].map(p => p.alias.toLowerCase());
    if (taken.includes(alias.toLowerCase())) {
      client.emit('error', { message: 'Ese alias ya está en uso en esta sala.' });
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

    client.emit('joined', {
      roomCode,
      roomName: room.roomName,
      alias,
      isHost: false,
      selectedInstanceId: room.selectedInstanceId,
      selectedTitle: room.selectedTitle,
      gameType: room.gameType,
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
    const instances = await this.instanceRepo.find();
    const quizzes = instances.map(i => {
      const content = i.content_json as any;
      const type: GameType = content?.type ?? 'quiz';
      let questionCount = 0;
      if (type === 'quiz') {
        // Support both {type,questions:[...]} and legacy plain array
        questionCount = Array.isArray(content?.questions) ? content.questions.length : (Array.isArray(content) ? content.length : 0);
      } else if (type === 'preguntados') {
        const cats = content?.categories ?? [];
        questionCount = cats.reduce((sum: number, c: any) => sum + (c.questions?.length ?? 0), 0);
      }
      return {
        id: i.id,
        title: (i as any).title ?? 'Sin título',
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
      // Normalise to {text, options:[{id,text}], correct_option_id} regardless of source format
      room.questions = rawQuestions.map((q: any) => {
        const opts: any[] = Array.isArray(q.options) ? q.options : [];
        const normOpts = opts.map((o: any, i: number) =>
          typeof o === 'string' ? { id: String(i), text: o } : o,
        );
        return {
          text: q.text ?? q.question ?? '',
          options: normOpts,
          correct_option_id: String(q.correct_option_id ?? '0'),
          points_correct: q.points_correct ?? 100,
          time_limit_ms: q.time_limit_ms ?? room.timeLimitMs,
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
      room.gameData = {
        word: (contentJson?.word ?? '').toUpperCase(),
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
      room.pqPlayers = playerIds.slice(0, 2);
      room.pqTurn = room.pqPlayers[0];
      room.pqScores = new Map(room.pqPlayers.map(id => [id, {
        alias: room.players.get(id)!.alias, score: 0, correct: 0,
      }]));
      room.pqCategoryQIdx = new Array(cats.length).fill(0);
      room.pqRound = 0;
      room.pqTotalRounds = room.gameData?.rounds ?? 6;
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
    }
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

    const targetSocket = this.server.sockets.sockets.get(target.socketId);
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
    @MessageBody() data: { optionId: string },
  ) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'playing' || room.gameType !== 'quiz') return;

    const player = room.players.get(client.id);
    if (!player || player.answeredThisRound) return;

    player.answeredThisRound = true;

    const q = room.questions[room.currentQ];
    const isCorrect = data.optionId === q.correct_option_id;
    const elapsed = Date.now() - room.questionStartedAt;
    const timeLimitMs = q.time_limit_ms ?? room.timeLimitMs;

    if (isCorrect) {
      const timeRatio = Math.max(0, 1 - elapsed / timeLimitMs);
      const bonus = Math.round(timeRatio * 500);
      player.score += (q.points_correct ?? 100) + bonus;
    }

    client.emit('answer-result', {
      correct: isCorrect,
      correctOptionId: q.correct_option_id,
      score: player.score,
    });

    this.server.to(roomCode).emit('player-answered', { alias: player.alias });

    const allAnswered = [...room.players.values()].every(p => p.answeredThisRound);
    if (allAnswered) {
      if (room.timer) clearTimeout(room.timer);
      setTimeout(() => this.advanceQuestion(roomCode, room), 1500);
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
      }));
  }

  private emitRoomsUpdate() {
    this.server.to('global-lobby').emit('rooms-list', { rooms: this.getPublicRooms() });
  }

  private emitLobbyUpdate() {
    const users = [...this.lobbyUsers.values()].map(u => ({ alias: u.alias }));
    this.server.to('global-lobby').emit('lobby-update', { users });
  }

  private generateRoomCode(): string {
    let code: string;
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
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

    const { correct_option_id, ...questionForClient } = q;
    void correct_option_id;

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
    this.server.to(roomCode).emit('round-end', {
      correctOptionId: q.correct_option_id,
      scoreboard: this.buildScoreboard(room),
    });

    room.currentQ++;
    room.timer = setTimeout(() => {
      if (room.currentQ < room.questions.length) {
        this.sendQuestion(roomCode, room);
      } else {
        this.endGame(roomCode, room);
      }
    }, 3000);
  }

  private endGame(roomCode: string, room: Room) {
    room.status = 'finished';
    this.server.to(roomCode).emit('game-over', { scoreboard: this.buildScoreboard(room) });
    setTimeout(() => {
      this.rooms.delete(roomCode);
      this.emitRoomsUpdate();
    }, 5 * 60 * 1000);
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
      if (!placed.find(p => p.word === word)) placed.push({ word, cells: [] });
    }

    // Fill empty cells with random letters
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!grid[r][c]) grid[r][c] = LETTERS[Math.floor(Math.random() * LETTERS.length)];

    return { grid, placed };
  }
}

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

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Player {
  socketId: string;
  alias: string;
  score: number;
  answeredThisRound: boolean;
}

interface Room {
  roomCode: string;
  roomName: string;
  hostSocketId: string;
  players: Map<string, Player>;
  selectedInstanceId: string | null;
  selectedTitle: string;
  questions: any[];
  currentQ: number;
  status: 'waiting' | 'playing' | 'finished';
  timer: ReturnType<typeof setTimeout> | null;
  questionStartedAt: number;
  timeLimitMs: number;
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

  constructor(
    @InjectRepository(MinigameInstance)
    private readonly instanceRepo: Repository<MinigameInstance>,
  ) {}

  handleConnection(_client: Socket) {}

  handleDisconnect(client: Socket) {
    const roomCode = this.socketRoom.get(client.id);
    if (!roomCode) return;
    const room = this.rooms.get(roomCode);
    if (!room) return;

    room.players.delete(client.id);
    this.socketRoom.delete(client.id);

    if (room.players.size === 0) {
      if (room.timer) clearTimeout(room.timer);
      this.rooms.delete(roomCode);
      return;
    }

    if (room.hostSocketId === client.id) {
      room.hostSocketId = room.players.keys().next().value;
    }

    this.emitRoomUpdate(roomCode, room);
  }

  // ── create-room (profe) ───────────────────────────────────────────────────
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

    const roomCode = this.generateRoomCode();
    const room: Room = {
      roomCode,
      roomName,
      hostSocketId: client.id,
      players: new Map(),
      selectedInstanceId: null,
      selectedTitle: '',
      questions: [],
      currentQ: 0,
      status: 'waiting',
      timer: null,
      questionStartedAt: 0,
      timeLimitMs: 20000,
    };
    this.rooms.set(roomCode, room);

    const player: Player = { socketId: client.id, alias, score: 0, answeredThisRound: false };
    room.players.set(client.id, player);
    this.socketRoom.set(client.id, roomCode);
    client.join(roomCode);

    client.emit('room-created', { roomCode, roomName, alias, isHost: true });
    this.emitRoomUpdate(roomCode, room);
  }

  // ── join-room (alumno) ────────────────────────────────────────────────────
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

    const player: Player = { socketId: client.id, alias, score: 0, answeredThisRound: false };
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
    });

    this.server.to(roomCode).emit('chat', {
      system: true,
      alias,
      text: `${alias} se unió 🎉`,
    });
    this.emitRoomUpdate(roomCode, room);
  }

  // ── get-quizzes ───────────────────────────────────────────────────────────
  // Lista pública de quizzes (sin preguntas ni respuestas)

  @SubscribeMessage('get-quizzes')
  async handleGetQuizzes(@ConnectedSocket() client: Socket) {
    const instances = await this.instanceRepo.find();
    const quizzes = instances.map(i => ({
      id: i.id,
      title: (i as any).title ?? 'Sin título',
      questionCount: Array.isArray(i.content_json) ? (i.content_json as any[]).length : 0,
    }));
    client.emit('quizzes-list', { quizzes });
  }

  // ── pick-game (solo host) ─────────────────────────────────────────────────
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
    if (!instance) { client.emit('error', { message: 'Quiz no encontrado.' }); return; }

    const questions = (instance.content_json as any[]) ?? [];
    if (questions.length === 0) { client.emit('error', { message: 'El quiz no tiene preguntas.' }); return; }

    room.selectedInstanceId = data.instanceId;
    room.selectedTitle = (instance as any).title ?? 'Quiz';
    room.questions = questions;
    room.timeLimitMs = (instance.config_json as any)?.default_time_ms ?? 20000;

    this.server.to(roomCode).emit('game-picked', {
      instanceId: data.instanceId,
      title: room.selectedTitle,
      questionCount: questions.length,
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
    if (!room || room.status !== 'waiting') return;
    const player = room.players.get(client.id);
    if (!player) return;

    const text = String(data.text ?? '').trim().slice(0, 200);
    if (!text) return;

    this.server.to(roomCode).emit('chat', { system: false, alias: player.alias, text });
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
    if (!room.selectedInstanceId || room.questions.length === 0) {
      client.emit('error', { message: 'Elegí un juego primero.' }); return;
    }

    room.status = 'playing';
    room.currentQ = 0;
    this.server.to(roomCode).emit('game-started', { totalQuestions: room.questions.length });
    setTimeout(() => this.sendQuestion(roomCode, room), 1500);
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
    if (!room || room.status !== 'playing') return;

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

    const allAnswered = [...room.players.values()].every(p => p.answeredThisRound);
    if (allAnswered) {
      if (room.timer) clearTimeout(room.timer);
      setTimeout(() => this.advanceQuestion(roomCode, room), 1500);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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
    setTimeout(() => this.rooms.delete(roomCode), 5 * 60 * 1000);
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
    });
  }
}

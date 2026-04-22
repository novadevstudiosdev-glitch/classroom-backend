import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanupUsers,
  getOrCreateMinigame,
  cleanupMinigame,
} from './helpers/create-app';

const TS = Date.now();
const STUDENT_EMAIL = `e2e.student.sessions.${TS}@test.com`;
const STUDENT_PASSWORD = 'Test1234!';

describe('Sessions (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let sessionId: string;
  let minigameId: string;
  let minigameCreated: boolean;

  beforeAll(async () => {
    app = await createTestApp();

    // Registrar alumno (auto-verificado)
    await request(app.getHttpServer())
      .post('/api/auth/register/student')
      .send({
        email: STUDENT_EMAIL,
        password: STUDENT_PASSWORD,
        alias: 'AlumnoSesiones',
        avatar_id: 'avatar_01',
        recaptcha_token: 'test-token',
      });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: STUDENT_EMAIL, password: STUDENT_PASSWORD });
    token = login.body.data.access_token;

    // Obtener o crear minijuego para los eventos
    const minigame = await getOrCreateMinigame(app);
    minigameId = minigame.id;
    minigameCreated = minigame.created;
  });

  afterAll(async () => {
    if (minigameCreated) await cleanupMinigame(app, minigameId);
    await cleanupUsers(app, [STUDENT_EMAIL]);
    if (app) await app.close();
  });

  // ─── START SESSION ────────────────────────────────────────

  it('POST /sessions/start → 201 inicia sesión sin clase', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sessions/start')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('started_at');
    expect(res.body.data.ended_at).toBeNull();
    sessionId = res.body.data.id;
  });

  it('POST /sessions/start → 401 sin token', async () => {
    await request(app.getHttpServer())
      .post('/api/sessions/start')
      .send({})
      .expect(401);
  });

  // ─── MINIGAME EVENT ───────────────────────────────────────

  it('POST /sessions/minigame-event → 201 registra resultado de minijuego', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sessions/minigame-event')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        minigame_id: minigameId,
        score: 850,
        max_score: 1000,
        completed: true,
      })
      .expect(201);

    expect(res.body.data).toHaveProperty('events');
    expect(res.body.data.events.length).toBeGreaterThan(0);
    const event = res.body.data.events[0];
    expect(event.type).toBe('minigame');
    expect(event.score).toBe(850);
    expect(event.completed).toBe(true);
    expect(event.xp_earned).toBeGreaterThan(0);
  });

  it('POST /sessions/minigame-event → 409 minijuego ya registrado en esta sesión', async () => {
    await request(app.getHttpServer())
      .post('/api/sessions/minigame-event')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        minigame_id: minigameId,
        score: 500,
        max_score: 1000,
        completed: false,
      })
      .expect(409);
  });

  it('POST /sessions/minigame-event → 400 sin campos requeridos', async () => {
    await request(app.getHttpServer())
      .post('/api/sessions/minigame-event')
      .set('Authorization', `Bearer ${token}`)
      .send({ session_id: sessionId })
      .expect(400);
  });

  it('POST /sessions/minigame-event → 404 sesión inexistente', async () => {
    await request(app.getHttpServer())
      .post('/api/sessions/minigame-event')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: '00000000-0000-0000-0000-000000000000',
        minigame_id: minigameId,
        score: 500,
        max_score: 1000,
        completed: false,
      })
      .expect(404);
  });

  it('POST /sessions/minigame-event → 404 minijuego inexistente', async () => {
    // Iniciar otra sesión para no interferir con la anterior
    const newSession = await request(app.getHttpServer())
      .post('/api/sessions/start')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const newSessionId = newSession.body.data.id;

    await request(app.getHttpServer())
      .post('/api/sessions/minigame-event')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: newSessionId,
        minigame_id: '00000000-0000-0000-0000-000000000000',
        score: 500,
        max_score: 1000,
        completed: false,
      })
      .expect(404);
  });

  // ─── END SESSION ──────────────────────────────────────────

  it('PATCH /sessions/:id/end → 200 finaliza la sesión', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveProperty('ended_at');
    expect(res.body.data.ended_at).not.toBeNull();
  });

  it('PATCH /sessions/:id/end → 200 idempotente (ya finalizada)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.ended_at).not.toBeNull();
  });

  it('POST /sessions/minigame-event → 403 sesión ya finalizada', async () => {
    // Intentar agregar evento a sesión finalizada
    const minigame2 = await getOrCreateMinigame(app);
    await request(app.getHttpServer())
      .post('/api/sessions/minigame-event')
      .set('Authorization', `Bearer ${token}`)
      .send({
        session_id: sessionId,
        minigame_id: minigame2.id,
        score: 300,
        max_score: 1000,
        completed: false,
      })
      .expect(403);
  });

  it('PATCH /sessions/:id/end → 404 sesión inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/api/sessions/00000000-0000-0000-0000-000000000000/end')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('PATCH /sessions/:id/end → 401 sin token', async () => {
    await request(app.getHttpServer())
      .patch(`/api/sessions/${sessionId}/end`)
      .expect(401);
  });

  // ─── AUTHORIZATION ────────────────────────────────────────

  it('POST /sessions/start → 403 si lo llama con otro student_id (intentar finalizar sesión ajena)', async () => {
    // Registrar otro alumno
    const otherEmail = `e2e.other.sessions.${TS}@test.com`;
    await request(app.getHttpServer())
      .post('/api/auth/register/student')
      .send({
        email: otherEmail,
        password: STUDENT_PASSWORD,
        alias: 'OtroAlumno',
        avatar_id: 'avatar_02',
        recaptcha_token: 'test-token',
      });
    const otherLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: otherEmail, password: STUDENT_PASSWORD });
    const otherToken = otherLogin.body.data.access_token;

    // Intentar finalizar sesión que no le pertenece
    await request(app.getHttpServer())
      .patch(`/api/sessions/${sessionId}/end`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    // Limpiar el otro alumno
    await cleanupUsers(app, [otherEmail]);
  });
});


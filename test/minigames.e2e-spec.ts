import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanupUsers,
  getVerificationToken,
  getOrCreateMinigame,
  cleanupMinigame,
} from './helpers/create-app';

const TS = Date.now();
const TEACHER_EMAIL = `e2e.teacher.minigames.${TS}@test.com`;
const TEACHER_PASSWORD = 'Test1234!';

describe('Minigames (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let minigameId: string;
  let minigameCreated: boolean;

  beforeAll(async () => {
    app = await createTestApp();

    // Registrar y verificar docente (tiene acceso a /minigames)
    await request(app.getHttpServer())
      .post('/api/auth/register/teacher')
      .send({
        email: TEACHER_EMAIL,
        password: TEACHER_PASSWORD,
        first_name: 'Teacher',
        last_name: 'Minigames',
        country: 'AR',
        recaptcha_token: 'test-token',
      });
    const verToken = await getVerificationToken(app, TEACHER_EMAIL);
    await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: verToken });
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD });
    token = login.body.data.access_token;

    // Asegurarse de que existe al menos un minijuego en la DB
    const minigame = await getOrCreateMinigame(app);
    minigameId = minigame.id;
    minigameCreated = minigame.created;
  });

  afterAll(async () => {
    if (minigameCreated) await cleanupMinigame(app, minigameId);
    await cleanupUsers(app, [TEACHER_EMAIL]);
    await app.close();
  });

  // ─── LIST ─────────────────────────────────────────────────

  it('GET /minigames → 200 lista minijuegos activos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/minigames')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('slug');
    expect(res.body.data[0]).toHaveProperty('title');
    expect(res.body.data[0]).toHaveProperty('type');
  });

  it('GET /minigames → 401 sin token', async () => {
    await request(app.getHttpServer()).get('/api/minigames').expect(401);
  });

  // ─── GET ONE ──────────────────────────────────────────────

  it('GET /minigames/:id → 200 retorna minijuego por ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/minigames/${minigameId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.id).toBe(minigameId);
    expect(res.body.data).toHaveProperty('slug');
    expect(res.body.data).toHaveProperty('title');
    expect(res.body.data).toHaveProperty('config_json');
    expect(res.body.data.is_active).toBe(true);
  });

  it('GET /minigames/:id → 404 con id inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/minigames/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('GET /minigames/:id → 401 sin token', async () => {
    await request(app.getHttpServer())
      .get(`/api/minigames/${minigameId}`)
      .expect(401);
  });

  // ─── AUTHORIZATION ────────────────────────────────────────

  it('GET /minigames → accesible también para alumnos', async () => {
    // Registrar alumno y verificar acceso
    const studentEmail = `e2e.student.minigames.${TS}@test.com`;
    await request(app.getHttpServer())
      .post('/api/auth/register/student')
      .send({
        email: studentEmail,
        password: TEACHER_PASSWORD,
        alias: 'AlumnoMinigames',
        avatar_id: 'avatar_01',
        recaptcha_token: 'test-token',
      });
    const studentLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: studentEmail, password: TEACHER_PASSWORD });
    const studentToken = studentLogin.body.data.access_token;

    await request(app.getHttpServer())
      .get('/api/minigames')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    await cleanupUsers(app, [studentEmail]);
  });
});

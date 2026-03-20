import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanupUsers, getVerificationToken } from './helpers/create-app';

const TEACHER_EMAIL = `e2e.teacher.auth.${Date.now()}@test.com`;
const TEACHER_PASSWORD = 'Test1234!';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupUsers(app, [TEACHER_EMAIL]);
    await app.close();
  });

  // ─── REGISTER ────────────────────────────────────────

  it('POST /auth/register/teacher → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register/teacher')
      .send({
        email: TEACHER_EMAIL,
        password: TEACHER_PASSWORD,
        first_name: 'Test',
        last_name: 'Teacher',
        country: 'AR',
        recaptcha_token: 'test-token',
      })
      .expect(201);

    expect(res.body.data).toHaveProperty('user_id');
    expect(res.body.data).toHaveProperty('profile_id');
  });

  it('POST /auth/register/teacher → 409 si email ya existe', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/teacher')
      .send({
        email: TEACHER_EMAIL,
        password: TEACHER_PASSWORD,
        first_name: 'Otro',
        last_name: 'Teacher',
        country: 'AR',
        recaptcha_token: 'test-token',
      })
      .expect(409);
  });

  // ─── VERIFY EMAIL ─────────────────────────────────────

  it('POST /auth/login → 401 si no está verificado', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD })
      .expect(401);
  });

  it('POST /auth/verify-email → 200', async () => {
    const token = await getVerificationToken(app, TEACHER_EMAIL);
    expect(token).toBeDefined();

    const res = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token })
      .expect(200);

    expect(res.body.data.message).toContain('verificado');
  });

  it('POST /auth/verify-email → 400 con token inválido', async () => {
    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: 'token-inexistente-invalido' })
      .expect(400);
  });

  // ─── LOGIN ────────────────────────────────────────────

  it('POST /auth/login → 200 con tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD })
      .expect(200);

    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
    expect(res.body.data.role).toBe('teacher');

    accessToken = res.body.data.access_token;
    refreshToken = res.body.data.refresh_token;
  });

  it('POST /auth/login → 401 con contraseña incorrecta', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEACHER_EMAIL, password: 'wrongpassword' })
      .expect(401);
  });

  // ─── ME ───────────────────────────────────────────────

  it('GET /auth/me → 200 con usuario autenticado', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.data).toHaveProperty('sub');
    expect(res.body.data.data.role).toBe('teacher');
  });

  it('GET /auth/me → 401 sin token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  // ─── REFRESH ──────────────────────────────────────────

  it('POST /auth/refresh → 200 con nuevo access_token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Authorization', `Bearer ${refreshToken}`)
      .send({ refresh_token: refreshToken })
      .expect(200);

    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
  });

  // ─── LOGOUT ───────────────────────────────────────────

  it('POST /auth/logout → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.message).toContain('cerrada');
  });

  // ─── VALIDACIÓN ───────────────────────────────────────

  it('POST /auth/register/teacher → 400 sin campos requeridos', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/teacher')
      .send({ email: 'solo-email@test.com' })
      .expect(400);
  });
});

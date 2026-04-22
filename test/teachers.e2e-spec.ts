import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanupUsers, getVerificationToken } from './helpers/create-app';

const TS = Date.now();
const TEACHER_EMAIL = `e2e.teacher.profile.${TS}@test.com`;
const TEACHER_PASSWORD = 'Test1234!';

describe('Teachers (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();

    await request(app.getHttpServer())
      .post('/api/auth/register/teacher')
      .send({
        email: TEACHER_EMAIL,
        password: TEACHER_PASSWORD,
        first_name: 'Juan',
        last_name: 'Docente',
        country: 'AR',
        recaptcha_token: 'test-token',
      });

    const verToken = await getVerificationToken(app, TEACHER_EMAIL);
    await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: verToken });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD });
    token = login.body.data.access_token;
  });

  afterAll(async () => {
    await cleanupUsers(app, [TEACHER_EMAIL]);
    if (app) await app.close();
  });

  // ─── GET PROFILE ──────────────────────────────────────────

  it('GET /teachers/me → 200 retorna perfil del docente', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/teachers/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveProperty('first_name', 'Juan');
    expect(res.body.data).toHaveProperty('last_name', 'Docente');
    expect(res.body.data).toHaveProperty('country', 'AR');
  });

  it('GET /teachers/me → 401 sin token', async () => {
    await request(app.getHttpServer()).get('/api/teachers/me').expect(401);
  });

  // ─── UPDATE PROFILE ───────────────────────────────────────

  it('PATCH /teachers/me → 200 actualiza nombre y país', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/teachers/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'Juan Actualizado', country: 'UY' })
      .expect(200);

    expect(res.body.data.first_name).toBe('Juan Actualizado');
    expect(res.body.data.country).toBe('UY');
  });

  it('PATCH /teachers/me → 200 actualiza avatar_url', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/teachers/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatar_url: 'https://cdn.example.com/avatar.png' })
      .expect(200);

    expect(res.body.data).toHaveProperty('avatar_url');
  });

  it('PATCH /teachers/me → 400 con first_name demasiado corto', async () => {
    await request(app.getHttpServer())
      .patch('/api/teachers/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ first_name: 'X' })
      .expect(400);
  });

  it('PATCH /teachers/me → 401 sin token', async () => {
    await request(app.getHttpServer())
      .patch('/api/teachers/me')
      .send({ first_name: 'Sin auth' })
      .expect(401);
  });
});


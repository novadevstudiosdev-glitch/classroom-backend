import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanupUsers } from './helpers/create-app';

const TS = Date.now();
const STUDENT_EMAIL = `e2e.student.profile.${TS}@test.com`;
const STUDENT_PASSWORD = 'Test1234!';

describe('Students (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();

    await request(app.getHttpServer())
      .post('/api/auth/register/student')
      .send({
        email: STUDENT_EMAIL,
        password: STUDENT_PASSWORD,
        alias: 'AlumnoE2E',
        avatar_id: 'avatar_01',
        recaptcha_token: 'test-token',
      });

    // Alumnos no necesitan verificar email (is_verified: true por defecto)
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: STUDENT_EMAIL, password: STUDENT_PASSWORD });
    token = login.body.data.access_token;
  });

  afterAll(async () => {
    await cleanupUsers(app, [STUDENT_EMAIL]);
    await app.close();
  });

  // ─── GET PROFILE ──────────────────────────────────────────

  it('GET /students/me → 200 retorna perfil del alumno', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/students/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveProperty('alias', 'AlumnoE2E');
    expect(res.body.data).toHaveProperty('avatar_id', 'avatar_01');
    expect(res.body.data).toHaveProperty('xp_total');
    expect(res.body.data).toHaveProperty('level');
    expect(res.body.data.level).toBe(1);
    expect(res.body.data.xp_total).toBe(0);
  });

  it('GET /students/me → 401 sin token', async () => {
    await request(app.getHttpServer()).get('/api/students/me').expect(401);
  });

  // ─── AUTHORIZATION ────────────────────────────────────────

  it('GET /teachers/me → 403 si lo llama un alumno', async () => {
    await request(app.getHttpServer())
      .get('/api/teachers/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});

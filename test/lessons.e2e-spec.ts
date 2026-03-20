import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanupUsers, getVerificationToken } from './helpers/create-app';

const TS = Date.now();
const TEACHER_EMAIL = `e2e.teacher.lessons.${TS}@test.com`;
const TEACHER_PASSWORD = 'Test1234!';

describe('Lessons (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let lessonId: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Registrar y verificar docente
    await request(app.getHttpServer())
      .post('/auth/register/teacher')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD, first_name: 'Test', last_name: 'Lecciones', country: 'AR', recaptcha_token: 'test-token' });

    const verToken = await getVerificationToken(app, TEACHER_EMAIL);
    await request(app.getHttpServer()).post('/auth/verify-email').send({ token: verToken });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD });
    token = loginRes.body.data.access_token;
  });

  afterAll(async () => {
    await cleanupUsers(app, [TEACHER_EMAIL]);
    await app.close();
  });

  // ─── CREATE ──────────────────────────────────────────

  it('POST /lessons → 201 crea lección en draft', async () => {
    const res = await request(app.getHttpServer())
      .post('/lessons')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Lección de prueba e2e' })
      .expect(201);

    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.title).toBe('Lección de prueba e2e');
    lessonId = res.body.data.id;
  });

  it('POST /lessons → 401 sin token', async () => {
    await request(app.getHttpServer())
      .post('/lessons')
      .send({ title: 'Sin auth' })
      .expect(401);
  });

  it('POST /lessons → 400 sin título', async () => {
    await request(app.getHttpServer())
      .post('/lessons')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  // ─── GET ALL ──────────────────────────────────────────

  it('GET /lessons → 200 lista con paginado', async () => {
    const res = await request(app.getHttpServer())
      .get('/lessons')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('meta');
    expect(Array.isArray(res.body.data.data)).toBe(true);
    expect(res.body.data.meta).toHaveProperty('total');
  });

  it('GET /lessons?status=draft → 200 filtra por status', async () => {
    const res = await request(app.getHttpServer())
      .get('/lessons?status=draft')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const lessons = res.body.data.data;
    expect(lessons.every((l: any) => l.status === 'draft')).toBe(true);
  });

  // ─── GET ONE ──────────────────────────────────────────

  it('GET /lessons/:id → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/lessons/${lessonId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.id).toBe(lessonId);
    expect(res.body.data).toHaveProperty('exercises');
  });

  it('GET /lessons/:id → 404 con id inexistente', async () => {
    await request(app.getHttpServer())
      .get('/lessons/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // ─── UPDATE ───────────────────────────────────────────

  it('PATCH /lessons/:id → 200 actualiza título', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/lessons/${lessonId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Lección actualizada' })
      .expect(200);

    expect(res.body.data.title).toBe('Lección actualizada');
  });

  it('PATCH /lessons/:id → 200 publica la lección', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/lessons/${lessonId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'published' })
      .expect(200);

    expect(res.body.data.status).toBe('published');
  });

  // ─── DELETE ───────────────────────────────────────────

  it('DELETE /lessons/:id → 200 soft delete', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/lessons/${lessonId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.data.message).toBeDefined();
  });

  it('GET /lessons/:id → 404 después de eliminada', async () => {
    await request(app.getHttpServer())
      .get(`/lessons/${lessonId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('DELETE /lessons/:id → 404 con id inexistente', async () => {
    await request(app.getHttpServer())
      .delete('/lessons/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

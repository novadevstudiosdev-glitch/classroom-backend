import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanupUsers, getVerificationToken } from './helpers/create-app';

const TS = Date.now();
const TEACHER_EMAIL = `e2e.teacher.progress.${TS}@test.com`;
const STUDENT_EMAIL = `e2e.student.progress.${TS}@test.com`;
const PASSWORD = 'Test1234!';

describe('Progress (e2e)', () => {
  let app: INestApplication;
  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let lessonId: string;
  let inviteCode: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Registrar y verificar docente
    await request(app.getHttpServer())
      .post('/api/auth/register/teacher')
      .send({
        email: TEACHER_EMAIL,
        password: PASSWORD,
        first_name: 'Teacher',
        last_name: 'Progress',
        country: 'AR',
        recaptcha_token: 'test-token',
      });
    const verToken = await getVerificationToken(app, TEACHER_EMAIL);
    await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: verToken });
    const teacherLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEACHER_EMAIL, password: PASSWORD });
    teacherToken = teacherLogin.body.data.access_token;

    // Docente crea classroom
    const classRes = await request(app.getHttpServer())
      .post('/api/classrooms')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Clase Progress E2E', description: 'Clase para test de progreso' });
    classroomId = classRes.body.data.id;
    inviteCode = classRes.body.data.invite_code;

    // Docente crea lección
    const lessonRes = await request(app.getHttpServer())
      .post('/api/lessons')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: 'Lección Progress E2E' });
    lessonId = lessonRes.body.data.id;

    // Docente publica la lección
    await request(app.getHttpServer())
      .patch(`/api/lessons/${lessonId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ status: 'published' });

    // Docente asigna lección a la clase
    await request(app.getHttpServer())
      .post(`/api/lessons/${lessonId}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ classroom_id: classroomId });

    // Registrar alumno (auto-verificado)
    await request(app.getHttpServer())
      .post('/api/auth/register/student')
      .send({
        email: STUDENT_EMAIL,
        password: PASSWORD,
        alias: 'AlumnoProgress',
        avatar_id: 'avatar_01',
        recaptcha_token: 'test-token',
      });
    const studentLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: STUDENT_EMAIL, password: PASSWORD });
    studentToken = studentLogin.body.data.access_token;

    // Alumno se une a la clase
    await request(app.getHttpServer())
      .post('/api/classrooms/join')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ invite_code: inviteCode });
  });

  afterAll(async () => {
    await cleanupUsers(app, [TEACHER_EMAIL, STUDENT_EMAIL]);
    await app.close();
  });

  // ─── GET MY PROGRESS ──────────────────────────────────────

  it('GET /progress/me → 200 lista vacía al inicio', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/progress/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /progress/me → 401 sin token', async () => {
    await request(app.getHttpServer()).get('/api/progress/me').expect(401);
  });

  // ─── START LESSON ─────────────────────────────────────────

  it('POST /progress/lessons/:lessonId/start → 201 inicia progreso', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/progress/lessons/${lessonId}/start`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    expect(res.body.data).toHaveProperty('lesson_id', lessonId);
    expect(res.body.data).toHaveProperty('status', 'in_progress');
  });

  it('POST /progress/lessons/:lessonId/start → 201 idempotente (ya iniciada)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/progress/lessons/${lessonId}/start`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    expect(res.body.data.status).toBe('in_progress');
  });

  it('POST /progress/lessons/:lessonId/start → 404 lección inexistente', async () => {
    await request(app.getHttpServer())
      .post('/api/progress/lessons/00000000-0000-0000-0000-000000000000/start')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(404);
  });

  // ─── GET PROGRESS AFTER START ─────────────────────────────

  it('GET /progress/me → 200 incluye lección iniciada', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/progress/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    const progress = res.body.data;
    expect(progress.some((p: any) => p.lesson_id === lessonId)).toBe(true);
    expect(progress.find((p: any) => p.lesson_id === lessonId).status).toBe('in_progress');
  });

  // ─── COMPLETE LESSON ──────────────────────────────────────

  it('PATCH /progress/lessons/:lessonId/complete → 200 con 95% → 3 estrellas, 30 XP', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/progress/lessons/${lessonId}/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ score_pct: 95 })
      .expect(200);

    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.stars).toBe(3);
    expect(res.body.data.xp_earned).toBe(30);
    expect(res.body.data.score_pct).toBe(95);
  });

  it('PATCH /progress/lessons/:lessonId/complete → 200 idempotente (ya completada)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/progress/lessons/${lessonId}/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ score_pct: 50 })
      .expect(200);

    // No debe sobreescribir el resultado anterior
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.stars).toBe(3);
  });

  it('PATCH /progress/lessons/:lessonId/complete → 400 sin score_pct', async () => {
    await request(app.getHttpServer())
      .patch(`/api/progress/lessons/${lessonId}/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({})
      .expect(400);
  });

  it('PATCH /progress/lessons/:lessonId/complete → 400 score_pct fuera de rango', async () => {
    await request(app.getHttpServer())
      .patch(`/api/progress/lessons/${lessonId}/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ score_pct: 150 })
      .expect(400);
  });

  it('PATCH /progress/lessons/:lessonId/complete → 404 lección inexistente', async () => {
    await request(app.getHttpServer())
      .patch('/api/progress/lessons/00000000-0000-0000-0000-000000000000/complete')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ score_pct: 80 })
      .expect(404);
  });

  // ─── AUTHORIZATION ────────────────────────────────────────

  it('GET /progress/me → 403 si lo llama un docente', async () => {
    await request(app.getHttpServer())
      .get('/api/progress/me')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(403);
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanupUsers, getVerificationToken } from './helpers/create-app';

const TS = Date.now();
const TEACHER_EMAIL = `e2e.teacher.classrooms.${TS}@test.com`;
const STUDENT_EMAIL = `e2e.student.classrooms.${TS}@test.com`;
const TEACHER_PASSWORD = 'Test1234!';
const STUDENT_PASSWORD = 'Test1234!';

describe('Classrooms (e2e)', () => {
  let app: INestApplication;
  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let inviteCode: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Registrar y verificar docente
    await request(app.getHttpServer())
      .post('/auth/register/teacher')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD, first_name: 'Teacher', last_name: 'Clases', country: 'AR', recaptcha_token: 'test-token' });

    const verToken = await getVerificationToken(app, TEACHER_EMAIL);
    await request(app.getHttpServer()).post('/auth/verify-email').send({ token: verToken });

    const teacherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEACHER_EMAIL, password: TEACHER_PASSWORD });
    teacherToken = teacherLogin.body.data.access_token;
  });

  afterAll(async () => {
    await cleanupUsers(app, [TEACHER_EMAIL, STUDENT_EMAIL]);
    await app.close();
  });

  // ─── CREATE CLASSROOM ─────────────────────────────────

  it('POST /classrooms → 201 crea clase con invite_code', async () => {
    const res = await request(app.getHttpServer())
      .post('/classrooms')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Matemática 3°A', description: 'Clase de prueba e2e' })
      .expect(201);

    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('invite_code');
    expect(res.body.data.name).toBe('Matemática 3°A');

    classroomId = res.body.data.id;
    inviteCode = res.body.data.invite_code;
  });

  it('POST /classrooms → 401 sin token', async () => {
    await request(app.getHttpServer())
      .post('/classrooms')
      .send({ name: 'Sin auth' })
      .expect(401);
  });

  it('POST /classrooms → 400 sin nombre', async () => {
    await request(app.getHttpServer())
      .post('/classrooms')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({})
      .expect(400);
  });

  // ─── GET ALL ──────────────────────────────────────────

  it('GET /classrooms → 200 lista las clases del docente', async () => {
    const res = await request(app.getHttpServer())
      .get('/classrooms')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((c: any) => c.id === classroomId)).toBe(true);
  });

  // ─── GET ONE ──────────────────────────────────────────

  it('GET /classrooms/:id → 200 con detalle y alumnos', async () => {
    const res = await request(app.getHttpServer())
      .get(`/classrooms/${classroomId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(res.body.data.id).toBe(classroomId);
    expect(res.body.data).toHaveProperty('students');
  });

  it('GET /classrooms/:id → 404 con id inexistente', async () => {
    await request(app.getHttpServer())
      .get('/classrooms/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(404);
  });

  // ─── UPDATE ───────────────────────────────────────────

  it('PATCH /classrooms/:id → 200 actualiza nombre', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/classrooms/${classroomId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Matemática 3°A - Actualizado' })
      .expect(200);

    expect(res.body.data.name).toBe('Matemática 3°A - Actualizado');
  });

  // ─── REGENERATE CODE ─────────────────────────────────

  it('POST /classrooms/:id/regenerate-code → 200 nuevo invite_code', async () => {
    const res = await request(app.getHttpServer())
      .post(`/classrooms/${classroomId}/regenerate-code`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(res.body.data).toHaveProperty('invite_code');
    const newCode = res.body.data.invite_code;
    expect(newCode).not.toBe(inviteCode);
    inviteCode = newCode; // actualizar para usar el código nuevo
  });

  // ─── REGISTER STUDENT CON INVITE CODE ────────────────

  it('POST /auth/register/student → 201 con código válido', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register/student')
      .send({
        email: STUDENT_EMAIL,
        password: STUDENT_PASSWORD,
        alias: 'TestAlumno',
        avatar_id: 'avatar_01',
        invite_code: inviteCode,
        recaptcha_token: 'test-token',
      })
      .expect(201);

    expect(res.body.data).toHaveProperty('user_id');
    expect(res.body.data.classroom_id).toBe(classroomId);
  });

  it('POST /auth/register/student → 404 con código inválido', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/student')
      .send({
        email: `otro.${TS}@test.com`,
        password: STUDENT_PASSWORD,
        alias: 'OtroAlumno',
        avatar_id: 'avatar_01',
        invite_code: 'XXXXXX',
        recaptcha_token: 'test-token',
      })
      .expect(404);
  });

  // ─── STUDENT VE SUS CLASES ───────────────────────────

  it('GET /classrooms/my-classes → 200 alumno ve su clase', async () => {
    const studentLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: STUDENT_EMAIL, password: STUDENT_PASSWORD });
    studentToken = studentLogin.body.data.access_token;

    const res = await request(app.getHttpServer())
      .get('/classrooms/my-classes')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((c: any) => c.classroom_id === classroomId || c.id === classroomId)).toBe(true);
  });

  // ─── AUTHORIZATION ────────────────────────────────────

  it('GET /classrooms → 403 si lo llama un alumno', async () => {
    await request(app.getHttpServer())
      .get('/classrooms')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
  });

  it('DELETE /classrooms/:id → 403 si lo llama un alumno', async () => {
    await request(app.getHttpServer())
      .delete(`/classrooms/${classroomId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
  });

  // ─── DELETE ───────────────────────────────────────────

  it('DELETE /classrooms/:id → 200 soft delete', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/classrooms/${classroomId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(res.body.data.message).toBeDefined();
  });
});

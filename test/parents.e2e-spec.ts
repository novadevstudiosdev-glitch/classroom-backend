import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanupUsers, getVerificationToken } from './helpers/create-app';

const TS = Date.now();
const STUDENT_EMAIL = `e2e.student.parents.${TS}@test.com`;
const PARENT_EMAIL = `e2e.parent.parents.${TS}@test.com`;
const PASSWORD = 'Test1234!';

describe('Parents (e2e)', () => {
  let app: INestApplication;
  let parentToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Registrar alumno primero (auto-verificado)
    await request(app.getHttpServer())
      .post('/api/auth/register/student')
      .send({
        email: STUDENT_EMAIL,
        password: PASSWORD,
        alias: 'AlumnoParent',
        avatar_id: 'avatar_01',
        recaptcha_token: 'test-token',
      });

    // Registrar padre vinculado al alumno
    await request(app.getHttpServer())
      .post('/api/auth/register/parent')
      .send({
        first_name: 'Padre',
        last_name: 'Test',
        email: PARENT_EMAIL,
        password: PASSWORD,
        student_email: STUDENT_EMAIL,
        recaptcha_token: 'test-token',
      })
      .expect(201);

    // El padre necesita verificar email (is_verified: false)
    const verToken = await getVerificationToken(app, PARENT_EMAIL);
    await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: verToken });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: PARENT_EMAIL, password: PASSWORD });
    parentToken = login.body.data.access_token;

    // Confirmar el vínculo padre-alumno manualmente (simula que el alumno hizo click en el email)
    const ds = app.get(DataSource);
    await ds.query(
      `UPDATE parent_students SET is_confirmed = true
       WHERE parent_id::text = (
         SELECT pp.id::text FROM parent_profiles pp
         JOIN users u ON u.id::text = pp.user_id::text
         WHERE u.email = $1
       )`,
      [PARENT_EMAIL],
    );
  });

  afterAll(async () => {
    await cleanupUsers(app, [STUDENT_EMAIL, PARENT_EMAIL]);
    await app.close();
  });

  // ─── GET PROFILE ──────────────────────────────────────────

  it('GET /parents/me → 200 retorna perfil del padre con alumnos vinculados', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/parents/me')
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);

    expect(res.body.data).toHaveProperty('first_name', 'Padre');
    expect(res.body.data).toHaveProperty('last_name', 'Test');
    expect(res.body.data).toHaveProperty('students');
    expect(Array.isArray(res.body.data.students)).toBe(true);
    expect(res.body.data.students.length).toBeGreaterThan(0);
  });

  it('GET /parents/me → 401 sin token', async () => {
    await request(app.getHttpServer()).get('/api/parents/me').expect(401);
  });

  // ─── REGISTER VALIDATIONS ─────────────────────────────────

  it('POST /auth/register/parent → 409 si email ya existe', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register/parent')
      .send({
        first_name: 'Otro',
        last_name: 'Padre',
        email: PARENT_EMAIL,
        password: PASSWORD,
        student_email: STUDENT_EMAIL,
        recaptcha_token: 'test-token',
      })
      .expect(409);
  });

  it('POST /auth/register/parent → 404 si el alumno no existe', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register/parent')
      .send({
        first_name: 'Otro',
        last_name: 'Padre',
        email: `nuevo.padre.${TS}@test.com`,
        password: PASSWORD,
        student_email: 'alumno-inexistente@test.com',
        recaptcha_token: 'test-token',
      })
      .expect(404);
  });

  it('POST /auth/register/parent → 400 sin campos requeridos', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register/parent')
      .send({ email: PARENT_EMAIL })
      .expect(400);
  });

  // ─── AUTHORIZATION ────────────────────────────────────────

  it('GET /teachers/me → 403 si lo llama un padre', async () => {
    await request(app.getHttpServer())
      .get('/api/teachers/me')
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);
  });
});

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
const TEACHER_EMAIL = `e2e.teacher.instances.${TS}@test.com`;
const STUDENT_EMAIL = `e2e.student.instances.${TS}@test.com`;
const PASSWORD = 'Test1234!';

describe('Minigame Instances (e2e)', () => {
  let app: INestApplication;
  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let inviteCode: string;
  let instanceId: string;
  let clonedInstanceId: string;
  let minigameId: string;
  let minigameCreated: boolean;

  beforeAll(async () => {
    app = await createTestApp();

    // Registrar y verificar docente
    await request(app.getHttpServer())
      .post('/api/auth/register/teacher')
      .send({
        email: TEACHER_EMAIL,
        password: PASSWORD,
        first_name: 'Teacher',
        last_name: 'Instances',
        country: 'AR',
        recaptcha_token: 'test-token',
      });
    const verToken = await getVerificationToken(app, TEACHER_EMAIL);
    await request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: verToken });
    const teacherLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: TEACHER_EMAIL, password: PASSWORD });
    teacherToken = teacherLogin.body.data.access_token;

    // Registrar alumno (auto-verificado)
    await request(app.getHttpServer())
      .post('/api/auth/register/student')
      .send({
        email: STUDENT_EMAIL,
        password: PASSWORD,
        alias: 'AlumnoInstancias',
        avatar_id: 'avatar_01',
        recaptcha_token: 'test-token',
      });
    const studentLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: STUDENT_EMAIL, password: PASSWORD });
    studentToken = studentLogin.body.data.access_token;

    // Docente crea clase, alumno se une
    const classRes = await request(app.getHttpServer())
      .post('/api/classrooms')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Clase Instancias E2E' });
    classroomId = classRes.body.data.id;
    inviteCode = classRes.body.data.invite_code;

    await request(app.getHttpServer())
      .post('/api/classrooms/join')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ invite_code: inviteCode });

    // Obtener o crear minijuego template
    const minigame = await getOrCreateMinigame(app);
    minigameId = minigame.id;
    minigameCreated = minigame.created;
  });

  afterAll(async () => {
    if (minigameCreated) await cleanupMinigame(app, minigameId);
    await cleanupUsers(app, [TEACHER_EMAIL, STUDENT_EMAIL]);
    await app.close();
  });

  // ─── CREATE ───────────────────────────────────────────────

  it('POST /minigame-instances → 201 crea instancia de minijuego', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/minigame-instances')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        minigame_id: minigameId,
        title: 'Los animales de la selva',
        description: 'Minijuego sobre animales',
        content_json: [
          { question: '¿Cuál es el animal más grande?', answer: 'Elefante', options: ['Jirafa', 'Elefante', 'León'] },
        ],
        config_json: { theme: 'jungle', timer: 60 },
      })
      .expect(201);

    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.title).toBe('Los animales de la selva');
    expect(res.body.data.is_public).toBe(false);
    instanceId = res.body.data.id;
  });

  it('POST /minigame-instances → 401 sin token', async () => {
    await request(app.getHttpServer())
      .post('/api/minigame-instances')
      .send({ minigame_id: minigameId, title: 'Test', content_json: [] })
      .expect(401);
  });

  it('POST /minigame-instances → 400 sin content_json', async () => {
    await request(app.getHttpServer())
      .post('/api/minigame-instances')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ minigame_id: minigameId, title: 'Sin contenido' })
      .expect(400);
  });

  it('POST /minigame-instances → 404 con minigame_id inexistente', async () => {
    await request(app.getHttpServer())
      .post('/api/minigame-instances')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        minigame_id: '00000000-0000-0000-0000-000000000000',
        title: 'Minijuego falso',
        content_json: [{ question: 'Test', answer: 'Test' }],
      })
      .expect(404);
  });

  // ─── GET ALL OWN ──────────────────────────────────────────

  it('GET /minigame-instances → 200 lista mis minijuegos', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/minigame-instances')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((i: any) => i.id === instanceId)).toBe(true);
  });

  // ─── GET ONE ──────────────────────────────────────────────

  it('GET /minigame-instances/:id → 200 ver detalle de mi minijuego', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/minigame-instances/${instanceId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(res.body.data.id).toBe(instanceId);
    expect(res.body.data.title).toBe('Los animales de la selva');
  });

  it('GET /minigame-instances/:id → 404 instancia inexistente', async () => {
    await request(app.getHttpServer())
      .get('/api/minigame-instances/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(404);
  });

  // ─── UPDATE ───────────────────────────────────────────────

  it('PATCH /minigame-instances/:id → 200 actualiza título', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/minigame-instances/${instanceId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: 'Animales Actualizado' })
      .expect(200);

    expect(res.body.data.title).toBe('Animales Actualizado');
  });

  // ─── ASSIGN TO CLASSROOM ──────────────────────────────────

  it('POST /minigame-instances/:id/assign → 201 asigna a clase', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/minigame-instances/${instanceId}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ classroom_id: classroomId })
      .expect(201);

    expect(res.body.data).toHaveProperty('classroom_id', classroomId);
    expect(res.body.data).toHaveProperty('instance_id', instanceId);
  });

  it('POST /minigame-instances/:id/assign → 409 ya asignado a esa clase', async () => {
    await request(app.getHttpServer())
      .post(`/api/minigame-instances/${instanceId}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ classroom_id: classroomId })
      .expect(409);
  });

  // ─── STUDENT VIEW BY CLASSROOM ────────────────────────────

  it('GET /minigame-instances/by-classroom/:classroomId → 200 alumno ve minijuegos de su clase', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/minigame-instances/by-classroom/${classroomId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((i: any) => i.id === instanceId)).toBe(true);
  });

  it('GET /minigame-instances/by-classroom/:classroomId → 403 alumno no pertenece a la clase', async () => {
    // Crear otro alumno que no está en la clase
    const otherEmail = `e2e.other.instances.${TS}@test.com`;
    await request(app.getHttpServer())
      .post('/api/auth/register/student')
      .send({
        email: otherEmail,
        password: PASSWORD,
        alias: 'OtroAlumnoInstancias',
        avatar_id: 'avatar_02',
        recaptcha_token: 'test-token',
      });
    const otherLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: otherEmail, password: PASSWORD });
    const otherToken = otherLogin.body.data.access_token;

    await request(app.getHttpServer())
      .get(`/api/minigame-instances/by-classroom/${classroomId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    await cleanupUsers(app, [otherEmail]);
  });

  // ─── UNASSIGN ─────────────────────────────────────────────

  it('DELETE /minigame-instances/:id/assign/:classroomId → 204 desasigna de clase', async () => {
    await request(app.getHttpServer())
      .delete(`/api/minigame-instances/${instanceId}/assign/${classroomId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(204);
  });

  // ─── TOGGLE PUBLIC ────────────────────────────────────────

  it('PATCH /minigame-instances/:id/publish → 200 hace público el minijuego', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/minigame-instances/${instanceId}/publish`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(res.body.data.is_public).toBe(true);
  });

  it('PATCH /minigame-instances/:id/publish → 200 vuelve a privado', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/minigame-instances/${instanceId}/publish`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(res.body.data.is_public).toBe(false);
  });

  // ─── EXPLORE PUBLIC ───────────────────────────────────────

  it('GET /minigame-instances/explore → 200 lista minijuegos públicos', async () => {
    // Hacer público primero
    await request(app.getHttpServer())
      .patch(`/api/minigame-instances/${instanceId}/publish`)
      .set('Authorization', `Bearer ${teacherToken}`);

    const res = await request(app.getHttpServer())
      .get('/api/minigame-instances/explore')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((i: any) => i.id === instanceId)).toBe(true);
  });

  // ─── CLONE ────────────────────────────────────────────────

  it('POST /minigame-instances/:id/clone → 201 clona un minijuego público', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/minigame-instances/${instanceId}/clone`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(201);

    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.title).toContain('Copia de');
    expect(res.body.data.is_public).toBe(false);
    clonedInstanceId = res.body.data.id;
  });

  // ─── DELETE ───────────────────────────────────────────────

  it('DELETE /minigame-instances/:id → 204 elimina el clon', async () => {
    await request(app.getHttpServer())
      .delete(`/api/minigame-instances/${clonedInstanceId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(204);
  });

  it('DELETE /minigame-instances/:id → 403 alumno intenta eliminar instancia', async () => {
    await request(app.getHttpServer())
      .delete(`/api/minigame-instances/${instanceId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
  });

  it('DELETE /minigame-instances/:id → 404 instancia inexistente', async () => {
    await request(app.getHttpServer())
      .delete('/api/minigame-instances/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(404);
  });
});

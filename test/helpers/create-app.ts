import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { RecaptchaGuard } from '../../src/modules/auth/guards/recaptcha.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EmailService } from '../../src/modules/email/email.service';

const mockEmailService = {
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendParentLinkConfirmation: jest.fn().mockResolvedValue(undefined),
};

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard(RecaptchaGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .overrideProvider(EmailService)
    .useValue(mockEmailService)
    .compile();

  const app = moduleFixture.createNestApplication();

  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.init();
  return app;
}

export async function cleanupUsers(app: INestApplication, emails: string[]) {
  if (!app) return;
  if (emails.length === 0) return;
  const ds = app.get(DataSource);

  const userRows = await ds.query(
    `SELECT id::text as id FROM users WHERE email = ANY($1::text[])`,
    [emails],
  );
  const userIds: string[] = userRows.map((r: any) => r.id);
  if (!userIds.length) return;

  const teacherRows = await ds.query(
    `SELECT id::text as id FROM teacher_profiles WHERE user_id::text = ANY($1::text[])`,
    [userIds],
  );
  const teacherIds: string[] = teacherRows.map((r: any) => r.id);

  const studentRows = await ds.query(
    `SELECT id::text as id FROM student_profiles WHERE user_id::text = ANY($1::text[])`,
    [userIds],
  );
  const studentIds: string[] = studentRows.map((r: any) => r.id);

  const parentRows = await ds.query(
    `SELECT id::text as id FROM parent_profiles WHERE user_id::text = ANY($1::text[])`,
    [userIds],
  );
  const parentIds: string[] = parentRows.map((r: any) => r.id);

  // Eliminar en orden (respetar FK)
  if (parentIds.length) {
    await ds.query(
      `DELETE FROM parent_students WHERE parent_id::text = ANY($1::text[])`,
      [parentIds],
    );
  }

  if (studentIds.length) {
    // Sessions y progress antes de borrar el perfil del alumno
    await ds.query(
      `DELETE FROM sessions WHERE student_id::text = ANY($1::text[])`,
      [studentIds],
    );
    await ds.query(
      `DELETE FROM lesson_progress WHERE student_id::text = ANY($1::text[])`,
      [studentIds],
    );
    await ds.query(
      `DELETE FROM classroom_students WHERE student_id::text = ANY($1::text[])`,
      [studentIds],
    );
  }

  if (teacherIds.length) {
    const classroomRows = await ds.query(
      `SELECT id::text as id FROM classrooms WHERE teacher_id::text = ANY($1::text[])`,
      [teacherIds],
    );
    const classroomIds: string[] = classroomRows.map((r: any) => r.id);

    if (classroomIds.length) {
      await ds.query(
        `DELETE FROM minigame_instance_assignments WHERE classroom_id::text = ANY($1::text[])`,
        [classroomIds],
      );
      await ds.query(
        `DELETE FROM lesson_assignments WHERE classroom_id::text = ANY($1::text[])`,
        [classroomIds],
      );
    }

    // Minigame instances (assignments cascade via FK)
    await ds.query(
      `DELETE FROM minigame_instances WHERE teacher_id::text = ANY($1::text[])`,
      [teacherIds],
    );

    const lessonRows = await ds.query(
      `SELECT id::text as id FROM lessons WHERE teacher_id::text = ANY($1::text[])`,
      [teacherIds],
    );
    const lessonIds: string[] = lessonRows.map((r: any) => r.id);

    if (lessonIds.length) {
      await ds.query(
        `DELETE FROM exercises WHERE lesson_id::text = ANY($1::text[])`,
        [lessonIds],
      );
    }

    await ds.query(
      `DELETE FROM lessons WHERE teacher_id::text = ANY($1::text[])`,
      [teacherIds],
    );
    await ds.query(
      `DELETE FROM classrooms WHERE teacher_id::text = ANY($1::text[])`,
      [teacherIds],
    );
  }

  if (teacherIds.length)
    await ds.query(`DELETE FROM teacher_profiles WHERE id::text = ANY($1::text[])`, [teacherIds]);
  if (studentIds.length)
    await ds.query(`DELETE FROM student_profiles WHERE id::text = ANY($1::text[])`, [studentIds]);
  if (parentIds.length)
    await ds.query(`DELETE FROM parent_profiles WHERE id::text = ANY($1::text[])`, [parentIds]);

  await ds.query(`DELETE FROM users WHERE id::text = ANY($1::text[])`, [userIds]);
}

export async function getVerificationToken(app: INestApplication, email: string): Promise<string> {
  const ds = app.get(DataSource);
  const rows = await ds.query(
    `SELECT verification_token FROM users WHERE email = $1`,
    [email],
  );
  return rows[0]?.verification_token;
}

/**
 * Obtiene el primer minijuego activo o crea uno de prueba si no existe ninguno.
 * Retorna { id, created } donde `created` indica si fue creado por el test.
 */
export async function getOrCreateMinigame(
  app: INestApplication,
): Promise<{ id: string; created: boolean }> {
  const ds = app.get(DataSource);
  const rows = await ds.query(
    `SELECT id::text as id FROM minigames WHERE is_active = true LIMIT 1`,
  );
  if (rows.length > 0) {
    return { id: rows[0].id, created: false };
  }
  const result = await ds.query(
    `INSERT INTO minigames (slug, title, description, type, config_json, is_active)
     VALUES ($1, $2, $3, $4, $5::jsonb, true)
     RETURNING id::text as id`,
    [
      `test-minigame-e2e-${Date.now()}`,
      'Test Minigame E2E',
      'Minijuego creado para tests e2e',
      'word_runner',
      JSON.stringify({ duration_seconds: 60, lives: 3 }),
    ],
  );
  return { id: result[0].id, created: true };
}

export async function cleanupMinigame(app: INestApplication, id: string): Promise<void> {
  const ds = app.get(DataSource);
  await ds.query(`DELETE FROM minigames WHERE id::text = $1`, [id]);
}

/**
 * Crea un usuario admin directamente en DB para los tests de admin.
 * Retorna el email y la contraseña en texto plano.
 */
export async function createAdminUser(
  app: INestApplication,
  email: string,
  password: string,
): Promise<void> {
  const bcrypt = await import('bcrypt');
  const password_hash = await bcrypt.hash(password, 10);
  const ds = app.get(DataSource);
  await ds.query(
    `INSERT INTO users (email, password_hash, role, is_verified)
     VALUES ($1, $2, 'admin', true)
     ON CONFLICT (email) DO NOTHING`,
    [email, password_hash],
  );
}

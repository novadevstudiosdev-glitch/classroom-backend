import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';

// Entities
import { User } from '../users/entities/user.entity';
import { TeacherProfile } from '../teachers/entities/teacher-profile.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { ParentProfile } from '../parents/entities/parent-profile.entity';
import { Classroom } from '../classrooms/entities/classroom.entity';
import { ClassroomStudent } from '../classrooms/entities/classroom-student.entity';

// DTOs
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterParentDto } from './dto/register-parent.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

// Entities extra para vinculación padre-alumno
import { ParentStudent } from '../parents/entities/parent-student.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(TeacherProfile)
    private teacherRepo: Repository<TeacherProfile>,

    @InjectRepository(StudentProfile)
    private studentRepo: Repository<StudentProfile>,

    @InjectRepository(ParentProfile)
    private parentRepo: Repository<ParentProfile>,

    @InjectRepository(Classroom)
    private classroomRepo: Repository<Classroom>,

    @InjectRepository(ClassroomStudent)
    private classroomStudentRepo: Repository<ClassroomStudent>,

    @InjectRepository(ParentStudent)
    private parentStudentRepo: Repository<ParentStudent>,

    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private dataSource: DataSource,
    private redisService: RedisService,
  ) {}

  // ─────────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────────

  async registerTeacher(dto: RegisterTeacherDto) {
    await this.checkEmailAvailable(dto.email);

    const password_hash = await bcrypt.hash(dto.password, 12);
    const { token: verification_token, expires } = this.buildVerificationToken(24);

    const { userId, profileId } = await this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        email: dto.email,
        password_hash,
        role: 'teacher',
        is_verified: false,
        verification_token,
        verification_token_expires_at: expires,
      });
      await manager.save(user);

      const profile = manager.create(TeacherProfile, {
        user_id: user.id,
        first_name: dto.first_name,
        last_name: dto.last_name,
        country: dto.country,
        plan_type: 'free',
        subscription_status: 'inactive',
      });
      await manager.save(profile);

      return { userId: user.id, profileId: profile.id };
    });

    await this.emailService.sendVerificationEmail(dto.email, verification_token);

    this.logger.log(`Docente registrado: ${dto.email}`);

    return {
      message: 'Verifica tu email para activar tu cuenta.',
      user_id: userId,
      profile_id: profileId,
    };
  }

  async registerStudent(dto: RegisterStudentDto) {
    let classroom: Classroom | null = null;

    if (dto.invite_code) {
      classroom = await this.classroomRepo.findOne({
        where: { invite_code: dto.invite_code.toUpperCase(), is_archived: false },
      });

      if (!classroom) {
        throw new NotFoundException('Código de invitación inválido o la clase no existe.');
      }
    }

    await this.checkEmailAvailable(dto.email);

    const password_hash = await bcrypt.hash(dto.password, 12);

    const { userId, profileId } = await this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        email: dto.email,
        password_hash,
        role: 'student',
        is_verified: true,
      });
      await manager.save(user);

      const profile = manager.create(StudentProfile, {
        user_id: user.id,
        alias: dto.alias,
        avatar_id: dto.avatar_id,
        xp_total: 0,
        level: 1,
      });
      await manager.save(profile);

      if (classroom) {
        const classroomStudent = manager.create(ClassroomStudent, {
          classroom_id: classroom.id,
          student_id: profile.id,
        });
        await manager.save(classroomStudent);
      }

      return { userId: user.id, profileId: profile.id };
    });

    this.logger.log(`Alumno registrado: ${dto.email}${classroom ? ` → clase: ${classroom.name}` : ' (sin clase)'}`);

    return {
      message: classroom ? '¡Cuenta creada! Ya sos parte de la clase.' : '¡Cuenta creada! Pedile el código a tu docente para unirte a una clase.',
      user_id: userId,
      profile_id: profileId,
      ...(classroom && { classroom_id: classroom.id }),
    };
  }

  async registerParent(dto: RegisterParentDto) {
    const parentEmail = dto.email.trim().toLowerCase();
    const studentEmail = dto.student_email?.trim().toLowerCase();

    await this.checkEmailAvailable(parentEmail);

    const password_hash = await bcrypt.hash(dto.password, 12);
    const { token: verification_token, expires } = this.buildVerificationToken(24);

    let studentUser: User | null = null;
    let studentProfile: StudentProfile | null = null;

    if (studentEmail) {
      studentUser = await this.userRepo.findOne({
        where: { email: studentEmail, role: 'student' },
      });

      if (studentUser) {
        studentProfile = await this.studentRepo.findOne({
          where: { user_id: studentUser.id },
        });
      }

      if (!studentUser || !studentProfile) {
        this.logger.warn(
          `Registro padre sin vinculacion inicial: alumno no encontrado para ${studentEmail}`,
        );
        studentUser = null;
        studentProfile = null;
      }
    }

    const { userId, profileId } = await this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        email: parentEmail,
        password_hash,
        role: 'parent',
        is_verified: false,
        verification_token,
        verification_token_expires_at: expires,
      });
      await manager.save(user);

      const profile = manager.create(ParentProfile, {
        user_id: user.id,
        first_name: dto.first_name,
        last_name: dto.last_name,
      });
      await manager.save(profile);

      if (studentProfile) {
        const link = manager.create(ParentStudent, {
          parent_id: profile.id,
          student_id: studentProfile.id,
          status: 'pending',
        });
        await manager.save(link);
      }

      return { userId: user.id, profileId: profile.id };
    });

    await this.emailService.sendVerificationEmail(parentEmail, verification_token);

    if (studentUser && studentProfile) {
      const confirmation_token = randomBytes(32).toString('hex');
      await this.emailService.sendParentLinkConfirmation(
        studentUser.email,
        `${dto.first_name} ${dto.last_name}`,
        studentProfile.alias,
        confirmation_token,
      );
      this.logger.log(`Padre registrado: ${parentEmail} -> alumno: ${studentEmail}`);
    } else {
      this.logger.log(`Padre registrado: ${parentEmail} (sin alumno vinculado)`);
    }

    return {
      message: studentProfile
        ? 'Cuenta creada. Verifica tu email y confirma la vinculacion con tu hijo.'
        : studentEmail
          ? 'Cuenta creada. Verifica tu email. No encontramos ese alumno todavia, podras vincularlo luego desde tu cuenta.'
          : 'Cuenta creada. Verifica tu email y luego vincula a tu hijo desde tu cuenta.',
      user_id: userId,
      profile_id: profileId,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
    });

    // Mensaje genérico para no revelar si el email existe
    if (!user || user.deleted_at) {
      throw new UnauthorizedException('Email o contraseña incorrectos.');
    }

    if (!user.is_verified) {
      throw new UnauthorizedException('Verificá tu email antes de iniciar sesión.');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password_hash);

    if (!passwordValid) {
      throw new UnauthorizedException('Email o contraseña incorrectos.');
    }

    const profile_id = await this.getProfileId(user);
    const tokens = await this.generateTokens(user, profile_id);

    this.logger.log(`Login exitoso: ${user.email} (${user.role})`);

    return {
      ...tokens,
      role: user.role,
      profile_id,
    };
  }

  // ─────────────────────────────────────────────────
  // GOOGLE OAUTH
  // ─────────────────────────────────────────────────

  async loginWithGoogle(googleUser: any) {
    let user = await this.userRepo.findOne({
      where: { email: googleUser.email },
    });

    if (!user) {
      // Registrar automáticamente como docente si es nuevo
      // (el flujo de alumno/padre con Google puede definirse después)
      const user_new = this.userRepo.create({
        email: googleUser.email,
        password_hash: '', // Sin contraseña para usuarios OAuth
        role: 'teacher',
        is_verified: true, // Google ya verificó el email
      });

      await this.userRepo.save(user_new);

      const profile = this.teacherRepo.create({
        user_id: user_new.id,
        first_name: googleUser.first_name,
        last_name: googleUser.last_name,
        plan_type: 'free',
        subscription_status: 'inactive',
      });

      await this.teacherRepo.save(profile);

      user = user_new;
      this.logger.log(`Nuevo docente via Google OAuth: ${user.email}`);
    }

    const profile_id = await this.getProfileId(user);
    const tokens = await this.generateTokens(user, profile_id);

    return {
      ...tokens,
      role: user.role,
      profile_id,
    };
  }

  // ─────────────────────────────────────────────────
  // REFRESH TOKEN
  // ─────────────────────────────────────────────────

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user || user.deleted_at) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    if (!user.refresh_token_hash) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    const tokenMatches = await bcrypt.compare(refreshToken, user.refresh_token_hash);
    if (!tokenMatches) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    const profile_id = await this.getProfileId(user);
    const tokens = await this.generateTokens(user, profile_id);

    return tokens;
  }

  // ─────────────────────────────────────────────────
  async resendVerificationEmail(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user || user.deleted_at || user.is_verified) {
      return { message: 'Si el email existe y no esta verificado, enviaremos un link.' };
    }

    const { token: verification_token, expires } = this.buildVerificationToken(24);

    await this.userRepo.update(user.id, {
      verification_token,
      verification_token_expires_at: expires,
    });

    await this.emailService.sendVerificationEmail(user.email, verification_token);

    return { message: 'Si el email existe y no esta verificado, enviaremos un link.' };
  }

  // VERIFY EMAIL
  // ─────────────────────────────────────────────────

  async verifyEmail(token: string) {
    const user = await this.userRepo.findOne({
      where: { verification_token: token },
    });

    if (!user) {
      throw new BadRequestException('Token de verificación inválido.');
    }

    if (user.is_verified) {
      return { message: 'Tu cuenta ya estaba verificada.' };
    }

    if (user.verification_token_expires_at < new Date()) {
      throw new BadRequestException('El token de verificación expiró. Solicitá uno nuevo.');
    }

    await this.userRepo.update(user.id, {
      is_verified: true,
      verification_token: undefined,
      verification_token_expires_at: undefined,
    });

    this.logger.log(`Email verificado: ${user.email}`);

    return { message: '¡Email verificado! Ya podés iniciar sesión.' };
  }

  // ─────────────────────────────────────────────────
  // FORGOT / RESET PASSWORD
  // ─────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });

    // Siempre devolver el mismo mensaje para no revelar si el email existe
    if (!user || user.deleted_at || !user.is_verified) {
      return { message: 'Si el email existe, recibirás un link para restablecer tu contraseña.' };
    }

    const token = randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    await this.userRepo.update(user.id, {
      password_reset_token: token,
      password_reset_token_expires_at: expires,
    });

    await this.emailService.sendPasswordResetEmail(user.email, token);

    this.logger.log(`Password reset solicitado: ${user.email}`);

    return { message: 'Si el email existe, recibirás un link para restablecer tu contraseña.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.userRepo.findOne({
      where: { password_reset_token: token },
    });

    if (!user) throw new BadRequestException('Token inválido o expirado.');
    if (!user.password_reset_token_expires_at || user.password_reset_token_expires_at < new Date()) {
      throw new BadRequestException('Token inválido o expirado.');
    }

    const password_hash = await bcrypt.hash(newPassword, 12);

    await this.userRepo.update(user.id, {
      password_hash,
      password_reset_token: null,
      password_reset_token_expires_at: null,
      refresh_token_hash: null, // invalidar todas las sesiones activas
    });

    this.logger.log(`Contraseña restablecida: ${user.email}`);

    return { message: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    if (!user.password_hash) {
      throw new BadRequestException('Esta cuenta usa autenticación con Google y no tiene contraseña.');
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedException('Contraseña actual incorrecta.');

    const password_hash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.update(userId, { password_hash });

    this.logger.log(`Contraseña cambiada: ${user.email}`);

    return { message: 'Contraseña actualizada correctamente.' };
  }

  async logout(userId: string, jti: string, exp: number) {
    // Invalidar access token en Redis
    const ttl = exp - Math.floor(Date.now() / 1000);
    try {
      await this.redisService.set(`blacklist:${jti}`, '1', ttl);
    } catch (err) {
      this.logger.warn(
        `Logout: no se pudo escribir en Redis (blacklist). Motivo: ${err?.message}`,
      );
    }

    // Invalidar refresh token borrando el hash guardado
    await this.userRepo.update(userId, { refresh_token_hash: null });

    this.logger.log(`Logout: token ${jti} añadido a blacklist (TTL: ${ttl}s)`);
    return { message: 'Sesión cerrada correctamente.' };
  }

  // ─────────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ─────────────────────────────────────────────────

  private buildVerificationToken(hours: number) {
    const token = randomBytes(32).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + hours);
    return { token, expires };
  }

  private async checkEmailAvailable(email: string) {
    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('Este email ya está registrado.');
    }
  }

  private async getProfileId(user: User): Promise<string> {
    switch (user.role) {
      case 'admin':
        // Los admins no tienen un profile dedicado (teacher/student/parent).
        // Usamos el user.id como `profile_id` para mantener el JWT consistente.
        return user.id;
      case 'teacher': {
        const profile = await this.teacherRepo.findOne({ where: { user_id: user.id } });
        if (!profile) throw new InternalServerErrorException('Perfil de docente no encontrado para este usuario.');
        return profile.id;
      }
      case 'student': {
        const profile = await this.studentRepo.findOne({ where: { user_id: user.id } });
        if (!profile) throw new InternalServerErrorException('Perfil de alumno no encontrado para este usuario.');
        return profile.id;
      }
      case 'parent': {
        const profile = await this.parentRepo.findOne({ where: { user_id: user.id } });
        if (!profile) throw new InternalServerErrorException('Perfil de padre no encontrado para este usuario.');
        return profile.id;
      }
      default:
        throw new InternalServerErrorException(`Rol desconocido: ${user.role}`);
    }
  }

  private async generateTokens(user: User, profile_id: string) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      profile_id,
      jti: randomUUID(),
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN'),
      }),
      this.jwtService.signAsync({ ...payload, jti: randomUUID() }, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    // Guardar hash del refresh token — permite invalidarlo en logout
    const refresh_token_hash = await bcrypt.hash(refresh_token, 10);
    await this.userRepo.update(user.id, { refresh_token_hash });

    return { access_token, refresh_token };
  }

  async getMyProfile(userId: string, role: string): Promise<{
    id: string;
    email: string;
    role: string;
    profile_id: string;
    name: string;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    let firstName = '';
    let lastName = '';
    let profileId = '';

    switch (role) {
      case 'teacher': {
        const p = await this.teacherRepo.findOne({ where: { user_id: userId } });
        if (p) { firstName = p.first_name; lastName = p.last_name; profileId = p.id; }
        break;
      }
      case 'student': {
        const p = await this.studentRepo.findOne({ where: { user_id: userId } });
        if (p) { firstName = p.alias; profileId = p.id; }
        break;
      }
      case 'parent': {
        const p = await this.parentRepo.findOne({ where: { user_id: userId } });
        if (p) { firstName = p.first_name; lastName = p.last_name; profileId = p.id; }
        break;
      }
    }

    const name = `${firstName} ${lastName}`.trim() || user.email;

    return { id: userId, email: user.email, role, profile_id: profileId, name };
  }
}

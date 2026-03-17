import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

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

    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────────

  async registerTeacher(dto: RegisterTeacherDto) {
    await this.checkEmailAvailable(dto.email);

    const password_hash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepo.create({
      email: dto.email,
      password_hash,
      role: 'teacher',
      is_verified: false,
    });

    await this.userRepo.save(user);

    const profile = this.teacherRepo.create({
      user_id: user.id,
      first_name: dto.first_name,
      last_name: dto.last_name,
      country: dto.country,
      plan_type: 'free',
      subscription_status: 'inactive',
    });

    await this.teacherRepo.save(profile);

    // TODO: enviar email de verificación con Resend
    this.logger.log(`Docente registrado: ${user.email}`);

    return {
      message: 'Verificá tu email para activar tu cuenta.',
      user_id: user.id,
      profile_id: profile.id,
    };
  }

  async registerStudent(dto: RegisterStudentDto) {
    // Validar código de invitación
    const classroom = await this.classroomRepo.findOne({
      where: { invite_code: dto.invite_code.toUpperCase(), is_archived: false },
    });

    if (!classroom) {
      throw new NotFoundException('Código de invitación inválido o la clase no existe.');
    }

    await this.checkEmailAvailable(dto.email);

    const password_hash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepo.create({
      email: dto.email,
      password_hash,
      role: 'student',
      is_verified: true, // Los alumnos no necesitan verificar email en el MVP
    });

    await this.userRepo.save(user);

    const profile = this.studentRepo.create({
      user_id: user.id,
      alias: dto.alias,
      avatar_id: dto.avatar_id,
      xp_total: 0,
      level: 1,
    });

    await this.studentRepo.save(profile);

    // Unir al alumno a la clase
    const classroomStudent = this.classroomStudentRepo.create({
      classroom_id: classroom.id,
      student_id: profile.id,
    });

    await this.classroomStudentRepo.save(classroomStudent);

    this.logger.log(`Alumno registrado: ${user.email} → clase: ${classroom.name}`);

    return {
      message: '¡Cuenta creada! Ya sos parte de la clase.',
      user_id: user.id,
      profile_id: profile.id,
      classroom_id: classroom.id,
    };
  }

  async registerParent(dto: RegisterParentDto) {
    // Verificar que el alumno a vincular existe
    const studentUser = await this.userRepo.findOne({
      where: { email: dto.student_email, role: 'student' },
    });

    if (!studentUser) {
      throw new NotFoundException('No se encontró un alumno con ese email.');
    }

    await this.checkEmailAvailable(dto.email);

    const password_hash = await bcrypt.hash(dto.password, 12);

    const user = this.userRepo.create({
      email: dto.email,
      password_hash,
      role: 'parent',
      is_verified: false,
    });

    await this.userRepo.save(user);

    const profile = this.parentRepo.create({
      user_id: user.id,
      first_name: dto.first_name,
      last_name: dto.last_name,
    });

    await this.parentRepo.save(profile);

    // TODO: enviar email de confirmación de vinculación
    this.logger.log(`Padre registrado: ${user.email} → alumno: ${dto.student_email}`);

    return {
      message: 'Cuenta creada. Verificá tu email y confirmá la vinculación con tu hijo.',
      user_id: user.id,
      profile_id: profile.id,
    };
  }

  // ─────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────

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
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    // En una implementación completa con Redis, acá validarías
    // que el refresh token coincida con el guardado en cache.
    // Por ahora solo verificamos que el JWT sea válido (lo hace la strategy).

    const profile_id = await this.getProfileId(user);
    const tokens = await this.generateTokens(user, profile_id);

    return tokens;
  }

  // ─────────────────────────────────────────────────
  // VERIFY EMAIL
  // ─────────────────────────────────────────────────

  async verifyEmail(token: string) {
    // TODO: cuando se implemente Resend, verificar el token
    // Por ahora placeholder
    throw new BadRequestException('Funcionalidad de verificación de email pendiente de implementar con Resend.');
  }

  async logout(userId: string) {
    // TODO: con Redis, invalidar el refresh token del usuario
    this.logger.log(`Logout: ${userId}`);
    return { message: 'Sesión cerrada correctamente.' };
  }

  // ─────────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ─────────────────────────────────────────────────

  private async checkEmailAvailable(email: string) {
    const exists = await this.userRepo.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('Este email ya está registrado.');
    }
  }

  private async getProfileId(user: User): Promise<string> {
    switch (user.role) {
      case 'teacher': {
        const profile = await this.teacherRepo.findOne({ where: { user_id: user.id } });
        return profile?.id ?? '';
      }
      case 'student': {
        const profile = await this.studentRepo.findOne({ where: { user_id: user.id } });
        return profile?.id ?? '';
      }
      case 'parent': {
        const profile = await this.parentRepo.findOne({ where: { user_id: user.id } });
        return profile?.id ?? '';
      }
      default:
        return '';
    }
  }

  private async generateTokens(user: User, profile_id: string) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      profile_id,
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      }),
    ]);

    return { access_token, refresh_token };
  }
}

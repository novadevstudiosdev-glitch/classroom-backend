import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ParentProfile } from './entities/parent-profile.entity';
import { ParentStudent } from './entities/parent-student.entity';
import { StudentProfile } from '../students/entities/student-profile.entity';
import { User } from '../users/entities/user.entity';
import { LinkChildDto } from './dto/link-child.dto';
import { UpdateParentProfileDto } from './dto/update-parent-profile.dto';

@Injectable()
export class ParentsService {
  constructor(
    @InjectRepository(ParentProfile)
    private parentRepo: Repository<ParentProfile>,

    @InjectRepository(ParentStudent)
    private parentStudentRepo: Repository<ParentStudent>,

    @InjectRepository(StudentProfile)
    private studentRepo: Repository<StudentProfile>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    private dataSource: DataSource,
  ) {}

  private async getParentOrFail(userId: string): Promise<ParentProfile> {
    const profile = await this.parentRepo.findOne({ where: { user_id: userId } });
    if (!profile) throw new NotFoundException('Perfil de padre/tutor no encontrado.');
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateParentProfileDto) {
    const profile = await this.getParentOrFail(userId);
    if (dto.first_name !== undefined) profile.first_name = dto.first_name;
    if (dto.last_name !== undefined) profile.last_name = dto.last_name;
    return this.parentRepo.save(profile);
  }

  async getProfile(userId: string) {
    const profile = await this.getParentOrFail(userId);

    const links = await this.parentStudentRepo.find({
      where: { parent_id: profile.id },
    });

    return { ...profile, children: links };
  }

  async linkChild(userId: string, dto: LinkChildDto) {
    if (!dto.email && !dto.link_code) {
      throw new BadRequestException('Debés proveer email o link_code del alumno.');
    }

    const parent = await this.getParentOrFail(userId);

    let student: StudentProfile | null = null;

    if (dto.link_code) {
      student = await this.studentRepo.findOne({ where: { link_code: dto.link_code.toUpperCase() } });
    } else if (dto.email) {
      const user = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase(), role: 'student' } });
      if (user) {
        student = await this.studentRepo.findOne({ where: { user_id: user.id } });
      }
    }

    if (!student) throw new NotFoundException('Alumno no encontrado.');

    const existing = await this.parentStudentRepo.findOne({
      where: { parent_id: parent.id, student_id: student.id },
    });

    if (existing) {
      if (existing.status === 'confirmed') throw new ConflictException('Este alumno ya está vinculado.');
      if (existing.status === 'pending') throw new ConflictException('Ya existe una solicitud pendiente para este alumno.');
      // If rejected, allow re-request
      existing.status = 'pending';
      await this.parentStudentRepo.save(existing);
      return { message: 'Solicitud de vinculación enviada al alumno.' };
    }

    const link = this.parentStudentRepo.create({
      parent_id: parent.id,
      student_id: student.id,
      status: 'pending',
    });

    await this.parentStudentRepo.save(link);

    return { message: 'Solicitud de vinculación enviada al alumno.' };
  }

  async getChildren(userId: string) {
    const parent = await this.getParentOrFail(userId);

    const links = await this.parentStudentRepo.find({
      where: { parent_id: parent.id, status: 'confirmed' },
    });

    if (links.length === 0) return [];

    const studentIds = links.map((l) => l.student_id);

    const students = await this.dataSource.query(
      `SELECT
         sp.id::text            AS student_id,
         sp.alias,
         sp.avatar_id,
         sp.level,
         sp.xp_total,
         sp.bio,
         sp.status_message,
         u.email,
         (SELECT COUNT(*)::int FROM classroom_students cs
          WHERE cs.student_id::text = sp.id::text AND cs.left_at IS NULL) AS active_classrooms
       FROM student_profiles sp
       JOIN users u ON u.id::text = sp.user_id::text
       WHERE sp.id::text = ANY($1::text[])`,
      [studentIds],
    );

    return students;
  }

  async unlinkChild(userId: string, studentId: string) {
    const parent = await this.getParentOrFail(userId);

    const link = await this.parentStudentRepo.findOne({
      where: { parent_id: parent.id, student_id: studentId },
    });

    if (!link) throw new NotFoundException('Vínculo no encontrado.');

    await this.parentStudentRepo.remove(link);

    return { message: 'Vínculo eliminado correctamente.' };
  }
}

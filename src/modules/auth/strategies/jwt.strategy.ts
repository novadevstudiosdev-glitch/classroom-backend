import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload & { exp: number }) {
    // Chequear blacklist — si el token fue invalidado por logout
    let isBlacklisted: string | null = null;
    try {
      isBlacklisted = await this.redisService.get(`blacklist:${payload.jti}`);
    } catch {
      // Redis es opcional: si falla, seguimos (fail-open) y el logout real queda degradado.
    }
    if (isBlacklisted) {
      throw new UnauthorizedException('Token inválido.');
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user || user.deleted_at) {
      throw new UnauthorizedException('Token inválido.');
    }

    if (!user.is_verified) {
      throw new UnauthorizedException('Verificá tu email antes de continuar.');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      profile_id: payload.profile_id,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}

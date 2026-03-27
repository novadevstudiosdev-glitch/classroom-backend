import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() === 'ws') return true;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);

    // Si el endpoint no tiene @Roles(), cualquier usuario autenticado puede acceder
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) return false;

    // Admin puede acceder a todo
    if (user.role === 'admin') return true;

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(`Esta acción requiere el rol: ${requiredRoles.join(' o ')}.`);
    }

    return true;
  }
}

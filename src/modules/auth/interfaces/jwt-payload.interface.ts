export interface JwtPayload {
  sub: string;       // user.id
  email: string;
  role: string;      // teacher | student | parent | admin
  profile_id: string;
  jti: string;       // JWT ID único por token — usado para blacklist en logout
}

export interface JwtRefreshPayload extends JwtPayload {
  refreshToken: string;
}

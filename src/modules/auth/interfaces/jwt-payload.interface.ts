export interface JwtPayload {
  sub: string; // user.id
  email: string;
  role: string; // teacher | student | parent | admin
  profile_id: string; // id del perfil correspondiente
}

export interface JwtRefreshPayload extends JwtPayload {
  refreshToken: string;
}

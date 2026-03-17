import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions, TypeOrmModuleOptions } from '@nestjs/typeorm';

function buildTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  const databaseUrl = configService.get<string>('database.url');

  if (databaseUrl) {
    return {
      type: 'postgres',
      url: databaseUrl,
      autoLoadEntities: true,
      synchronize: false,
      logging: true,
    };
  }

  const host = configService.get<string>('database.host');
  const port = configService.get<number>('database.port');
  const username = configService.get<string>('database.user');
  const password = configService.get<string>('database.password');
  const database = configService.get<string>('database.name');

  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    autoLoadEntities: true,
    synchronize: false,
    logging: true,
  };
}

export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: buildTypeOrmOptions,
};

/**
 * Seed: Minijuego mock para el MVP
 * Ejecutar con: npm run seed:minigames
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { Minigame } from '../modules/minigames/entities/minigame.entity';

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? 5432),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  entities: [Minigame],
  synchronize: false,
});

const MINIGAMES: Partial<Minigame>[] = [
  {
    slug: 'quiz-rush-v1',
    title: 'Quiz Rush',
    description: 'Respondé preguntas de opción múltiple contra el reloj. ¡El tiempo importa!',
    type: 'quiz_rush',
    is_active: true,
    config_json: {
      default_time_seconds: 20,
      points_correct: 100,
      points_wrong: 0,
      xp_multiplier: 1,
      max_xp: 500,
      shuffle_questions: false,
    },
  },
  {
    slug: 'word-runner-v1',
    title: 'Word Runner',
    description: 'Atrapá las palabras correctas mientras corren por la pantalla. ¡Cuidado con las trampas!',
    type: 'word_runner',
    is_active: true,
    config_json: {
      duration_seconds: 60,
      lives: 3,
      speed_initial: 1,
      speed_increment: 0.1,
      xp_per_correct: 5,
      categories: ['animales', 'colores', 'números'],
      difficulty: 'easy',
      phaser_scene: 'WordRunnerScene',
    },
  },
];

async function seed() {
  await dataSource.initialize();
  console.log('✓ Conectado a la base de datos');

  const repo = dataSource.getRepository(Minigame);

  for (const data of MINIGAMES) {
    const existing = await repo.findOne({ where: { slug: data.slug } });
    if (existing) {
      await repo.update(existing.id, data);
      console.log(`✓ Actualizado: ${data.slug} (${existing.id})`);
    } else {
      const m = repo.create(data);
      await repo.save(m);
      console.log(`✓ Creado: ${data.slug} (${m.id})`);
    }
  }

  await dataSource.destroy();
  console.log('✓ Seed completado');
}

seed().catch((err) => {
  console.error('✗ Error en seed:', err);
  process.exit(1);
});

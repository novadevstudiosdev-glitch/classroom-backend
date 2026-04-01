import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MinigameInstance } from './entities/minigame-instance.entity';

export type GenerateGameType = 'quiz' | 'wordsearch' | 'preguntados';

export interface GenerateGameDto {
  type: GenerateGameType;
  topic: string;          // e.g. "Historia Argentina"
  language?: string;      // default 'es'
  count?: number;         // questions for quiz, words for wordsearch
  categories?: string[];  // optional fixed category names for preguntados classic mode
}

const MAX_TOPIC_LENGTH = 120;
const MIN_COUNT = 2;
const MAX_COUNT = 25;

// IDs configured via env so they're not hardcoded in source
// See GAME_DEFAULT_TEACHER_ID / GAME_DEFAULT_MINIGAME_ID in .env

@Injectable()
export class AIService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(MinigameInstance)
    private readonly instanceRepo: Repository<MinigameInstance>,
  ) {}

  async generateGame(dto: GenerateGameDto): Promise<Record<string, any>> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) throw new BadRequestException('Servicio de IA no disponible.');

    // Validate inputs
    const topic = (dto.topic ?? '').trim();
    if (!topic) throw new BadRequestException('La temática no puede estar vacía.');
    if (topic.length > MAX_TOPIC_LENGTH)
      throw new BadRequestException(`La temática no puede superar ${MAX_TOPIC_LENGTH} caracteres.`);
    const count = Math.min(MAX_COUNT, Math.max(MIN_COUNT, Number(dto.count) || 8));
    const lang = dto.language ?? 'es';

    const prompt = dto.type === 'quiz'
      ? this.buildQuizPrompt(topic, count, lang)
      : dto.type === 'preguntados'
      ? this.buildPreguntadosPrompt(topic, count, lang, dto.categories)
      : this.buildWordsearchPrompt(topic, count, lang);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      await res.text(); // consume body, don't expose internal API details
      throw new BadRequestException('El servicio de IA no pudo generar el contenido. Intentá de nuevo.');
    }

    const data = await res.json() as any;
    const text: string = data?.choices?.[0]?.message?.content ?? '';

    return this.parseResponse(text, dto.type, topic);
  }

  // ── Prompts ────────────────────────────────────────────────────────────────

  private buildQuizPrompt(topic: string, count: number, lang: string): string {
    return `Generá un quiz educativo sobre "${topic}" en idioma ${lang === 'es' ? 'español' : lang}.

Devolvé SOLO un JSON válido con esta estructura exacta, sin texto adicional, sin bloques de código:
{
  "title": "Título atractivo del quiz",
  "questions": [
    {
      "question": "Texto de la pregunta",
      "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
      "correct_option_id": "0",
      "points_correct": 100,
      "time_limit_ms": 20000
    }
  ]
}

Reglas:
- Generá exactamente ${count} preguntas
- correct_option_id es el índice (como string) de la opción correcta: "0", "1", "2" o "3"
- Las preguntas deben ser educativas, claras y variadas en dificultad
- Cada pregunta tiene exactamente 4 opciones
- No uses markdown ni bloques de código en tu respuesta`;
  }

  private buildWordsearchPrompt(topic: string, count: number, lang: string): string {
    return `Generá una lista de palabras para una sopa de letras sobre "${topic}" en idioma ${lang === 'es' ? 'español' : lang}.

Devolvé SOLO un JSON válido con esta estructura exacta, sin texto adicional, sin bloques de código:
{
  "title": "Título atractivo de la sopa de letras",
  "words": ["PALABRA1", "PALABRA2", "PALABRA3"]
}

Reglas:
- Generá exactamente ${count} palabras relacionadas con el tema
- Todas en MAYÚSCULAS, sin espacios ni acentos ni caracteres especiales
- Longitud entre 4 y 12 letras por palabra
- Palabras variadas y representativas del tema
- No uses markdown ni bloques de código en tu respuesta`;
  }

  private buildPreguntadosPrompt(topic: string, questionsPerCat: number, lang: string, fixedCategories?: string[]): string {
    const langLabel = lang === 'es' ? 'español' : lang;
    const catRule = fixedCategories && fixedCategories.length > 0
      ? `- Usá EXACTAMENTE estas 6 categorías (en ese orden): ${fixedCategories.join(', ')}. Asigná a cada una un color hex vibrante y un emoji representativo.`
      : `- Generá exactamente 6 categorías relacionadas con "${topic}": podés usar Historia, Ciencia, Geografía, Arte, Deportes, Entretenimiento u otras apropiadas al tema. Asigná colores hex vibrantes y emojis apropiados.`;
    const titleHint = fixedCategories && fixedCategories.length > 0
      ? 'Preguntados Clásico'
      : `Preguntados: ${topic}`;

    return `Generá un juego de Preguntados (estilo Trivial Pursuit) sobre "${topic}" en idioma ${langLabel}.

Devolvé SOLO un JSON válido con esta estructura exacta, sin texto adicional:
{
  "title": "${titleHint}",
  "rounds": 6,
  "categories": [
    {
      "name": "Historia",
      "color": "#ef4444",
      "icon": "📜",
      "questions": [
        {
          "question": "Texto de la pregunta",
          "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
          "correct_option_id": "0"
        }
      ]
    }
  ]
}

Reglas:
${catRule}
- Cada categoría tiene exactamente ${questionsPerCat} preguntas
- correct_option_id es el índice (como string) de la opción correcta: "0", "1", "2" o "3"
- Las preguntas deben ser educativas, variadas en dificultad y específicas del tema
- Cada pregunta tiene exactamente 4 opciones
- No uses markdown ni bloques de código`;
  }

  // ── Parse ──────────────────────────────────────────────────────────────────

  private parseResponse(text: string, type: GenerateGameType, topic: string): Record<string, any> {
    // Strip markdown code fences if present
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Try to extract JSON from text
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new BadRequestException('La IA no devolvió JSON válido. Intentá de nuevo.');
      try { parsed = JSON.parse(match[0]); }
      catch { throw new BadRequestException('La IA no devolvió JSON válido. Intentá de nuevo.'); }
    }

    if (type === 'quiz') {
      const questions = parsed.questions ?? [];
      if (!questions.length) throw new BadRequestException('La IA no generó preguntas. Intentá de nuevo.');
      // Normalise correct_option_id to string
      return {
        type: 'quiz',
        title: parsed.title ?? `Quiz: ${topic}`,
        questions: questions.map((q: any) => {
          const opts: string[] = Array.isArray(q.options) ? q.options : [];
          const mapped = opts.map((o: string, i: number) => ({ id: String(i), text: o }));
          // Shuffle options so the correct answer isn't always first
          for (let i = mapped.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [mapped[i], mapped[j]] = [mapped[j], mapped[i]];
          }
          return {
            text: q.question ?? q.text ?? '',
            options: mapped,
            correct_option_id: String(q.correct_option_id ?? '0'),
            points_correct: q.points_correct ?? 100,
            time_limit_ms: q.time_limit_ms ?? 20000,
          };
        }),
      };
    } else if (type === 'preguntados') {
      const cats = parsed.categories ?? [];
      if (!cats.length) throw new BadRequestException('La IA no generó categorías. Intentá de nuevo.');
      const CAT_COLORS = ['#ef4444','#3b82f6','#22c55e','#a855f7','#eab308','#f97316'];
      const CAT_ICONS  = ['📜','🔬','🌍','🎨','⚽','🎬'];
      return {
        type: 'preguntados',
        title: parsed.title ?? `Preguntados: ${topic}`,
        rounds: parsed.rounds ?? 6,
        categories: cats.map((c: any, ci: number) => ({
          name: c.name ?? `Categoría ${ci + 1}`,
          color: c.color ?? CAT_COLORS[ci % CAT_COLORS.length],
          icon: c.icon ?? CAT_ICONS[ci % CAT_ICONS.length],
          questions: (c.questions ?? []).map((q: any) => {
            const opts: string[] = Array.isArray(q.options) ? q.options : [];
            const mapped = opts.map((o: string, i: number) => ({ id: String(i), text: o }));
            // Shuffle options so the correct answer isn't always first
            for (let i = mapped.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [mapped[i], mapped[j]] = [mapped[j], mapped[i]];
            }
            return {
              text: q.question ?? q.text ?? '',
              options: mapped,
              correct_option_id: String(q.correct_option_id ?? '0'),
            };
          }),
        })),
      };
    } else {
      const words: string[] = (parsed.words ?? []).map((w: string) =>
        w.toUpperCase().replace(/[^A-Z]/g, ''),
      ).filter((w: string) => w.length >= 3);
      if (!words.length) throw new BadRequestException('La IA no generó palabras. Intentá de nuevo.');
      return {
        type: 'wordsearch',
        title: parsed.title ?? `Sopa de letras: ${topic}`,
        words,
        grid_size: Math.max(10, Math.min(15, words.length + 2)),
      };
    }
  }

  async deleteGame(id: string): Promise<void> {
    await this.instanceRepo.delete(id);
  }

  async saveGeneratedGame(title: string, topic: string, content_json: any): Promise<MinigameInstance> {
    const teacherId = this.config.get<string>('GAME_DEFAULT_TEACHER_ID');
    const minigameId = this.config.get<string>('GAME_DEFAULT_MINIGAME_ID');
    if (!teacherId || !minigameId)
      throw new BadRequestException('Configuración de juegos de IA incompleta en el servidor.');

    // Basic content size guard (~500 KB)
    const contentStr = JSON.stringify(content_json);
    if (contentStr.length > 500_000)
      throw new BadRequestException('El contenido del juego es demasiado grande.');

    const safeTitle = String(title ?? '').trim().slice(0, 120) || 'Juego IA';
    const safeTopic = String(topic ?? '').trim().slice(0, 120);

    // Derive game_type and question_count from content_json
    const gameType: string = content_json?.type ?? 'quiz';
    let questionCount = 0;
    if (gameType === 'quiz') {
      questionCount = Array.isArray(content_json?.questions) ? content_json.questions.length : 0;
    } else if (gameType === 'wordsearch') {
      questionCount = Array.isArray(content_json?.words) ? content_json.words.length : 0;
    } else if (gameType === 'preguntados') {
      const cats = Array.isArray(content_json?.categories) ? content_json.categories : [];
      questionCount = cats.reduce((acc: number, c: any) =>
        acc + (Array.isArray(c.questions) ? c.questions.length : 0), 0);
    }

    const instance = this.instanceRepo.create({
      teacher_id: teacherId,
      minigame_id: minigameId,
      title: safeTitle,
      description: `Generado con IA · Temática: ${safeTopic}`,
      content_json,
      config_json: {},
      is_public: true,
      game_type: gameType,
      question_count: questionCount,
    });
    return this.instanceRepo.save(instance);
  }
}

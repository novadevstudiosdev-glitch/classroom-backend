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

const DEFAULT_TEACHER_ID = '2fdabcfd-d297-4e48-ac96-de8a85d151f1';
const DEFAULT_MINIGAME_ID = 'b87ccbc2-9de1-4a61-bd62-9afbddf221ce';

@Injectable()
export class AIService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(MinigameInstance)
    private readonly instanceRepo: Repository<MinigameInstance>,
  ) {}

  async generateGame(dto: GenerateGameDto): Promise<Record<string, any>> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) throw new BadRequestException('GROQ_API_KEY no configurada.');

    const lang = dto.language ?? 'es';
    const prompt = dto.type === 'quiz'
      ? this.buildQuizPrompt(dto.topic, dto.count ?? 10, lang)
      : dto.type === 'preguntados'
      ? this.buildPreguntadosPrompt(dto.topic, dto.count ?? 3, lang, dto.categories)
      : this.buildWordsearchPrompt(dto.topic, dto.count ?? 10, lang);

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
      const err = await res.text();
      throw new BadRequestException(`Error de IA: ${err}`);
    }

    const data = await res.json() as any;
    const text: string = data?.choices?.[0]?.message?.content ?? '';

    return this.parseResponse(text, dto.type, dto.topic);
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
          return {
            text: q.question ?? q.text ?? '',
            options: opts.map((o: string, i: number) => ({ id: String(i), text: o })),
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
            return {
              text: q.question ?? q.text ?? '',
              options: opts.map((o: string, i: number) => ({ id: String(i), text: o })),
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
    const instance = this.instanceRepo.create({
      teacher_id: DEFAULT_TEACHER_ID,
      minigame_id: DEFAULT_MINIGAME_ID,
      title,
      description: `Generado con IA · Temática: ${topic}`,
      content_json,
      config_json: {},
      is_public: true,
    });
    return this.instanceRepo.save(instance);
  }
}

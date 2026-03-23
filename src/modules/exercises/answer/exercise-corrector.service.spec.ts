import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExerciseCorrectorService } from './exercise-corrector.service';

describe('ExerciseCorrectorService', () => {
  let service: ExerciseCorrectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExerciseCorrectorService],
    }).compile();

    service = module.get<ExerciseCorrectorService>(ExerciseCorrectorService);
  });

  // ──────────────────────────────────────────────
  // OPCIÓN MÚLTIPLE
  // ──────────────────────────────────────────────

  describe('multiple_choice', () => {
    const config = {
      question: '¿Cuántos planetas hay?',
      options: ['6', '7', '8', '9'],
      correct_index: 2,
    };

    it('devuelve is_correct: true cuando el índice es correcto', () => {
      const result = service.correct('multiple_choice', config, { selected_index: 2 });
      expect(result.is_correct).toBe(true);
      expect(result.feedback).toContain('Correcto');
    });

    it('devuelve is_correct: false cuando el índice es incorrecto', () => {
      const result = service.correct('multiple_choice', config, { selected_index: 0 });
      expect(result.is_correct).toBe(false);
      expect(result.correct_answer).toMatchObject({ correct_index: 2, correct_text: '8' });
    });

    it('lanza BadRequestException si selected_index está fuera de rango', () => {
      expect(() => service.correct('multiple_choice', config, { selected_index: 10 })).toThrow(BadRequestException);
    });

    it('lanza BadRequestException si falta selected_index', () => {
      expect(() => service.correct('multiple_choice', config, {})).toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────
  // COMPLETAR ESPACIO EN BLANCO
  // ──────────────────────────────────────────────

  describe('fill_blank', () => {
    const config = {
      text_with_blanks: 'El cielo es ___ y el sol es ___.',
      answers: ['azul', 'amarillo'],
    };

    it('devuelve is_correct: true con respuestas exactas', () => {
      const result = service.correct('fill_blank', config, { answers: ['azul', 'amarillo'] });
      expect(result.is_correct).toBe(true);
    });

    it('es case-insensitive', () => {
      const result = service.correct('fill_blank', config, { answers: ['AZUL', 'AMARILLO'] });
      expect(result.is_correct).toBe(true);
    });

    it('ignora acentos', () => {
      const cfgAccent = { text_with_blanks: 'La ___ es bonita.', answers: ['música'] };
      const result = service.correct('fill_blank', cfgAccent, { answers: ['musica'] });
      expect(result.is_correct).toBe(true);
    });

    it('ignora espacios al inicio y al final (trim)', () => {
      const result = service.correct('fill_blank', config, { answers: ['  azul  ', ' amarillo '] });
      expect(result.is_correct).toBe(true);
    });

    it('devuelve is_correct: false con respuestas parcialmente incorrectas', () => {
      const result = service.correct('fill_blank', config, { answers: ['azul', 'rojo'] });
      expect(result.is_correct).toBe(false);
      expect(result.detail?.results[0].is_correct).toBe(true);
      expect(result.detail?.results[1].is_correct).toBe(false);
    });

    it('lanza BadRequestException si la cantidad de respuestas no coincide', () => {
      expect(() => service.correct('fill_blank', config, { answers: ['azul'] })).toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────
  // VERDADERO O FALSO
  // ──────────────────────────────────────────────

  describe('true_false', () => {
    const config = { statement: 'La Tierra es plana.', correct_answer: false };

    it('devuelve is_correct: true con la respuesta correcta', () => {
      const result = service.correct('true_false', config, { answer: false });
      expect(result.is_correct).toBe(true);
    });

    it('devuelve is_correct: false con la respuesta incorrecta', () => {
      const result = service.correct('true_false', config, { answer: true });
      expect(result.is_correct).toBe(false);
      expect(result.feedback).toContain('Falso');
    });

    it('lanza BadRequestException si answer no es boolean', () => {
      expect(() => service.correct('true_false', config, { answer: 'false' })).toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────
  // UNIR COLUMNAS
  // ──────────────────────────────────────────────

  describe('match_columns', () => {
    const config = {
      pairs: [
        { left: 'Perro', right: 'Dog' },
        { left: 'Gato', right: 'Cat' },
        { left: 'Pájaro', right: 'Bird' },
      ],
    };

    it('devuelve is_correct: true con todos los pares correctos', () => {
      const result = service.correct('match_columns', config, {
        pairs: [
          { left_index: 0, right_index: 0 },
          { left_index: 1, right_index: 1 },
          { left_index: 2, right_index: 2 },
        ],
      });
      expect(result.is_correct).toBe(true);
    });

    it('devuelve is_correct: false con pares incorrectos', () => {
      const result = service.correct('match_columns', config, {
        pairs: [
          { left_index: 0, right_index: 1 }, // Perro → Cat (mal)
          { left_index: 1, right_index: 0 }, // Gato → Dog (mal)
          { left_index: 2, right_index: 2 }, // Pájaro → Bird (bien)
        ],
      });
      expect(result.is_correct).toBe(false);
      expect(result.detail?.results[2].is_correct).toBe(true);
      expect(result.detail?.results[0].is_correct).toBe(false);
    });

    it('lanza BadRequestException si la cantidad de pares no coincide', () => {
      expect(() =>
        service.correct('match_columns', config, {
          pairs: [{ left_index: 0, right_index: 0 }],
        }),
      ).toThrow(BadRequestException);
    });

    it('lanza BadRequestException si un índice está fuera de rango', () => {
      expect(() =>
        service.correct('match_columns', config, {
          pairs: [
            { left_index: 0, right_index: 99 },
            { left_index: 1, right_index: 1 },
            { left_index: 2, right_index: 2 },
          ],
        }),
      ).toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────
  // ORDENAR ELEMENTOS
  // ──────────────────────────────────────────────

  describe('order_items', () => {
    const config = {
      items: ['Mezclar', 'Hornear', 'Enfriar'],
      instruction: 'Ordená los pasos.',
    };

    it('devuelve is_correct: true con el orden correcto', () => {
      const result = service.correct('order_items', config, { order: [0, 1, 2] });
      expect(result.is_correct).toBe(true);
    });

    it('devuelve is_correct: false con el orden incorrecto', () => {
      const result = service.correct('order_items', config, { order: [1, 0, 2] });
      expect(result.is_correct).toBe(false);
      expect(result.detail?.results[0].is_correct).toBe(false);
      expect(result.detail?.results[2].is_correct).toBe(true);
    });

    it('lanza BadRequestException si hay índices duplicados', () => {
      expect(() => service.correct('order_items', config, { order: [0, 0, 2] })).toThrow(BadRequestException);
    });

    it('lanza BadRequestException si la cantidad de elementos no coincide', () => {
      expect(() => service.correct('order_items', config, { order: [0, 1] })).toThrow(BadRequestException);
    });

    it('lanza BadRequestException si un índice está fuera de rango', () => {
      expect(() => service.correct('order_items', config, { order: [0, 1, 99] })).toThrow(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────
  // TIPO DESCONOCIDO
  // ──────────────────────────────────────────────

  it('lanza BadRequestException para un tipo desconocido', () => {
    expect(() => service.correct('tipo_inventado' as any, {}, {})).toThrow(BadRequestException);
  });
});

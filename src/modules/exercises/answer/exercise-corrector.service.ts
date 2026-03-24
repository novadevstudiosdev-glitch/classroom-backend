import { Injectable, BadRequestException } from '@nestjs/common';
import { CorrectionResult } from '../dto/answer-exercise.dto';
import { ExerciseType } from '../entities/exercise.entity';

@Injectable()
export class ExerciseCorrectorService {
  correct(type: ExerciseType, content_json: Record<string, any>, answer: Record<string, any>): CorrectionResult {
    switch (type) {
      case 'multiple_choice':
        return this.correctMultipleChoice(content_json, answer);
      case 'fill_blank':
        return this.correctFillBlank(content_json, answer);
      case 'true_false':
        return this.correctTrueFalse(content_json, answer);
      case 'match_columns':
        return this.correctMatchColumns(content_json, answer);
      case 'order_items':
        return this.correctOrderItems(content_json, answer);
      default:
        throw new BadRequestException(`Tipo de ejercicio desconocido: ${type}`);
    }
  }

  // ─────────────────────────────────────────────────
  // OPCIÓN MÚLTIPLE
  // content_json: { question, options: string[], correct_index: number }
  // answer:       { selected_index: number }
  // ─────────────────────────────────────────────────

  private correctMultipleChoice(config: Record<string, any>, answer: Record<string, any>): CorrectionResult {
    const { options, correct_index } = config;
    const { selected_index } = answer;

    if (typeof selected_index !== 'number') {
      throw new BadRequestException('La respuesta debe tener selected_index (número).');
    }

    if (selected_index < 0 || selected_index >= options.length) {
      throw new BadRequestException(`selected_index fuera de rango. El ejercicio tiene ${options.length} opciones (0–${options.length - 1}).`);
    }

    const is_correct = selected_index === correct_index;

    return {
      is_correct,
      feedback: is_correct ? '¡Correcto! 🎉' : '¡Casi! Esa no era la opción correcta.',
      correct_answer: { correct_index, correct_text: options[correct_index] },
    };
  }

  // ─────────────────────────────────────────────────
  // COMPLETAR ESPACIO EN BLANCO
  // content_json: { text_with_blanks: string, answers: string[] }
  // answer:       { answers: string[] }
  //
  // Reglas de corrección:
  //   - Case-insensitive
  //   - Se ignoran espacios al inicio y al final (trim)
  //   - Se considera correcto si el alumno acertó TODOS los blancos
  //   - Se reporta qué blancos acertó y cuáles no
  // ─────────────────────────────────────────────────

  private correctFillBlank(config: Record<string, any>, answer: Record<string, any>): CorrectionResult {
    const correct_answers: string[] = config.answers;
    const given_answers: string[] = answer.answers;

    if (!Array.isArray(given_answers)) {
      throw new BadRequestException('La respuesta debe tener answers (array de strings).');
    }

    if (given_answers.length !== correct_answers.length) {
      throw new BadRequestException(`La respuesta debe tener ${correct_answers.length} elemento(s), recibí ${given_answers.length}.`);
    }

    const results = correct_answers.map((correct, i) => ({
      blank_index: i,
      given: given_answers[i] ?? '',
      expected: correct,
      is_correct: this.normalizeText(given_answers[i] ?? '') === this.normalizeText(correct),
    }));

    const all_correct = results.every((r) => r.is_correct);
    const correct_count = results.filter((r) => r.is_correct).length;

    return {
      is_correct: all_correct,
      feedback: all_correct ? '¡Perfecto! Completaste todos los espacios correctamente. 🎉' : `Acertaste ${correct_count} de ${correct_answers.length} espacio(s). ¡Seguí intentando!`,
      correct_answer: { answers: correct_answers },
      detail: { results },
    };
  }

  // ─────────────────────────────────────────────────
  // VERDADERO O FALSO
  // content_json: { statement: string, correct_answer: boolean }
  // answer:       { answer: boolean }
  // ─────────────────────────────────────────────────

  private correctTrueFalse(config: Record<string, any>, answer: Record<string, any>): CorrectionResult {
    const { correct_answer } = config;
    const { answer: given } = answer;

    if (typeof given !== 'boolean') {
      throw new BadRequestException('La respuesta debe tener answer (boolean: true o false).');
    }

    const is_correct = given === correct_answer;

    return {
      is_correct,
      feedback: is_correct ? '¡Correcto! 🎉' : `La respuesta correcta era ${correct_answer ? 'Verdadero' : 'Falso'}.`,
      correct_answer: { correct_answer },
    };
  }

  // ─────────────────────────────────────────────────
  // UNIR COLUMNAS
  // content_json: { pairs: [{ left: string, right: string }] }
  // answer:       { pairs: [{ left_index: number, right_index: number }] }
  //
  // Reglas:
  //   - El alumno envía qué left unió con qué right (por índice)
  //   - Se considera correcto si TODOS los pares son correctos
  //   - Un par es correcto si left_index[i] fue asociado con el right_index
  //     que le corresponde según el config original
  // ─────────────────────────────────────────────────

  private correctMatchColumns(config: Record<string, any>, answer: Record<string, any>): CorrectionResult {
    const correct_pairs: Array<{ left: string; right: string }> = config.pairs;
    const given_pairs: Array<{ left_index: number; right_index: number }> = answer.pairs;

    if (!Array.isArray(given_pairs)) {
      throw new BadRequestException('La respuesta debe tener pairs (array de { left_index, right_index }).');
    }

    if (given_pairs.length !== correct_pairs.length) {
      throw new BadRequestException(`Se esperaban ${correct_pairs.length} par(es), recibí ${given_pairs.length}.`);
    }

    // Validar que los índices estén en rango
    for (const pair of given_pairs) {
      if (pair.left_index < 0 || pair.left_index >= correct_pairs.length || pair.right_index < 0 || pair.right_index >= correct_pairs.length) {
        throw new BadRequestException(`Índice fuera de rango. El ejercicio tiene ${correct_pairs.length} pares (0–${correct_pairs.length - 1}).`);
      }
    }

    // El par i es correcto si left_index === i y right_index === i
    // (porque en el config, pairs[i].left siempre va con pairs[i].right)
    const results = given_pairs.map((given) => {
      const is_correct = given.left_index === given.right_index;
      return {
        left_index: given.left_index,
        right_index: given.right_index,
        left_text: correct_pairs[given.left_index]?.left ?? '',
        right_text: correct_pairs[given.right_index]?.right ?? '',
        expected_right: correct_pairs[given.left_index]?.right ?? '',
        is_correct,
      };
    });

    const all_correct = results.every((r) => r.is_correct);
    const correct_count = results.filter((r) => r.is_correct).length;

    return {
      is_correct: all_correct,
      feedback: all_correct ? '¡Excelente! Uniste todos los pares correctamente. 🎉' : `Acertaste ${correct_count} de ${correct_pairs.length} par(es). ¡Revisá los que están en rojo!`,
      correct_answer: {
        pairs: correct_pairs.map((p, i) => ({
          left_index: i,
          right_index: i,
          left_text: p.left,
          right_text: p.right,
        })),
      },
      detail: { results },
    };
  }

  // ─────────────────────────────────────────────────
  // ORDENAR ELEMENTOS
  // content_json: { items: string[], instruction?: string }
  // answer:       { order: number[] }
  //
  // Reglas:
  //   - El alumno envía los índices originales en el orden que eligió
  //   - Es correcto si order === [0, 1, 2, ..., n-1]
  //   - Se reporta qué posiciones son correctas
  // ─────────────────────────────────────────────────

  private correctOrderItems(config: Record<string, any>, answer: Record<string, any>): CorrectionResult {
    const items: string[] = config.items;
    const given_order: number[] = answer.order;

    if (!Array.isArray(given_order)) {
      throw new BadRequestException('La respuesta debe tener order (array de números).');
    }

    if (given_order.length !== items.length) {
      throw new BadRequestException(`Se esperaban ${items.length} elemento(s), recibí ${given_order.length}.`);
    }

    // Validar que no haya índices duplicados ni fuera de rango
    const unique = new Set(given_order);
    if (unique.size !== items.length) {
      throw new BadRequestException('El orden no puede tener índices duplicados.');
    }

    for (const idx of given_order) {
      if (idx < 0 || idx >= items.length) {
        throw new BadRequestException(`Índice ${idx} fuera de rango. Los ítems son 0–${items.length - 1}.`);
      }
    }

    // El orden correcto es siempre [0, 1, 2, ..., n-1]
    const correct_order = items.map((_, i) => i);

    const results = given_order.map((given_idx, position) => ({
      position,
      given_index: given_idx,
      given_text: items[given_idx],
      expected_index: correct_order[position],
      expected_text: items[correct_order[position]],
      is_correct: given_idx === correct_order[position],
    }));

    const all_correct = results.every((r) => r.is_correct);
    const correct_count = results.filter((r) => r.is_correct).length;

    return {
      is_correct: all_correct,
      feedback: all_correct ? '¡Perfecto! Ordenaste todos los elementos correctamente. 🎉' : `Acertaste ${correct_count} de ${items.length} posición/posiciones. ¡Revisá el orden!`,
      correct_answer: { order: correct_order, items_in_order: items },
      detail: { results },
    };
  }

  // ─────────────────────────────────────────────────
  // HELPER
  // ─────────────────────────────────────────────────

  private normalizeText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .normalize('NFD') // descompone acentos: á → a + ́
      .replace(/[\u0300-\u036f]/g, ''); // elimina los diacríticos
  }
}

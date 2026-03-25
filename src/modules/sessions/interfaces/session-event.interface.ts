export interface SessionEvent {
  type: 'minigame';
  minigame_id: string;
  minigame_slug: string;
  score: number;
  max_score: number;
  completed: boolean;
  xp_earned: number;
  occurred_at: string; // ISO 8601
}

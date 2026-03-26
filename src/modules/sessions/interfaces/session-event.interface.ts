export interface SessionEvent {
  type: 'minigame';
  minigame_id: string;
  minigame_slug: string;
  score: number;
  max_score: number;
  completed: boolean;
  xp_earned: number;
  occurred_at: string; // ISO 8601
  content_snapshot?: Record<string, any>[]; // snapshot del content_json al momento de jugar
}

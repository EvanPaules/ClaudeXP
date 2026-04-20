import { checkQuest, QUEST_BREAKDOWN_MARKER } from './quests.js';
import { hasQuestCompletionOnDate } from './db.js';

// Gates the daily quest bonus to at most one award per UTC day, per user.
// Returns a new { xp, breakdown } — does not mutate the input breakdown.
export function applyQuestBonus({ db, userId, signals, baseXP, breakdown, today = new Date() }) {
  const { completed, bonus, quest } = checkQuest(signals, today);
  if (!completed) return { xp: baseXP, breakdown };

  const todayISO = today.toISOString().slice(0, 10);
  if (hasQuestCompletionOnDate(db, userId, todayISO)) {
    return { xp: baseXP, breakdown };
  }

  return {
    xp: baseXP + bonus,
    breakdown: [
      ...breakdown,
      { xp: bonus, reason: `${QUEST_BREAKDOWN_MARKER} "${quest.label}" ✓` },
    ],
  };
}

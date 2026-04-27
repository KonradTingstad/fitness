import { SetType, WorkoutSet } from '@/domain/models';

export function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${mins}:${sec.toString().padStart(2, '0')}`;
}

export function elapsedSecondsSince(startedAtIso: string, nowMs = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - new Date(startedAtIso).getTime()) / 1000));
}

export function displaySetLabel(set: Pick<WorkoutSet, 'setType' | 'sortOrder'>): string {
  if (set.setType === 'warmup') return 'W';
  if (set.setType === 'drop') return 'D';
  if (set.setType === 'failure') return 'F';
  return String(set.sortOrder);
}

export function setTypeTone(type: SetType): 'normal' | 'warmup' | 'drop' | 'failure' {
  if (type === 'warmup') return 'warmup';
  if (type === 'drop') return 'drop';
  if (type === 'failure') return 'failure';
  return 'normal';
}

import { Dumbbell, Flag, Footprints, HeartPulse, Minus, Volleyball } from 'lucide-react-native';

import { ProgramActivityType } from '@/data/repositories/workoutRepository';

interface Props {
  activityType: ProgramActivityType;
  color: string;
  size?: number;
}

export function ProgramActivityIcon({ activityType, color, size = 18 }: Props) {
  if (activityType === 'cardio') {
    return <HeartPulse size={size} color={color} />;
  }
  if (activityType === 'padel') {
    return <Volleyball size={size} color={color} />;
  }
  if (activityType === 'strength') {
    return <Dumbbell size={size} color={color} />;
  }
  if (activityType === 'golf') {
    return <Flag size={size} color={color} />;
  }
  if (activityType === 'recovery') {
    return <Footprints size={size} color={color} />;
  }
  return <Minus size={size} color={color} />;
}

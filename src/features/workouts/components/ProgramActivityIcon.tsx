import { Dumbbell, Footprints, Minus } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

import { ProgramActivityType } from '@/data/repositories/workoutRepository';

interface Props {
  activityType: ProgramActivityType;
  color: string;
  size?: number;
}

interface ActivitySvgIconProps {
  color: string;
  size: number;
}

function PadelTennisIcon({ color, size }: ActivitySvgIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 5.3a9 9 0 0 1 0 13.4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18 5.3a9 9 0 0 0 0 13.4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function GolfIcon({ color, size }: ActivitySvgIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 18v-15l7 4l-7 4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M9 17.67c-.62 .36 -1 .82 -1 1.33c0 1.1 1.8 2 4 2s4 -.9 4 -2c0 -.5 -.38 -.97 -1 -1.33"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CardioRunIcon({ color, size }: ActivitySvgIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16.5 5.5A2 2 0 0 0 18.5 3.5A2 2 0 0 0 16.5 1.5A2 2 0 0 0 14.5 3.5A2 2 0 0 0 16.5 5.5M12.9 19.4L13.9 15L16 17V23H18V15.5L15.9 13.5L16.5 10.5C17.89 12.09 19.89 13 22 13V11C20.24 11.03 18.6 10.11 17.7 8.6L16.7 7C16.34 6.4 15.7 6 15 6C14.7 6 14.5 6.1 14.2 6.1L9 8.3V13H11V9.6L12.8 8.9L11.2 17L6.3 16L5.9 18L12.9 19.4M4 9A1 1 0 0 1 3 8A1 1 0 0 1 4 7H7V9H4M5 5A1 1 0 0 1 4 4A1 1 0 0 1 5 3H10V5H5M3 13A1 1 0 0 1 2 12A1 1 0 0 1 3 11H7V13H3Z"
        fill={color}
      />
    </Svg>
  );
}

export function ProgramActivityIcon({ activityType, color, size = 18 }: Props) {
  if (activityType === 'cardio') {
    return <CardioRunIcon size={size} color={color} />;
  }
  if (activityType === 'padel') {
    return <PadelTennisIcon size={size} color={color} />;
  }
  if (activityType === 'strength') {
    return <Dumbbell size={size} color={color} />;
  }
  if (activityType === 'golf') {
    return <GolfIcon size={size} color={color} />;
  }
  if (activityType === 'recovery') {
    return <Footprints size={size} color={color} />;
  }
  return <Minus size={size} color={color} />;
}

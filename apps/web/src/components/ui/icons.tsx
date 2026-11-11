import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Copy,
  Flag,
  Gamepad2,
  Home,
  Hourglass,
  Info,
  Loader2,
  Lock,
  Mail,
  Menu,
  Play,
  Plus,
  ShieldCheck,
  Star,
  Trophy,
  Undo2,
  Upload,
  User,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { SVGProps } from 'react';

export type IconName =
  | 'circle'
  | 'check'
  | 'check-circle'
  | 'play'
  | 'clock'
  | 'alert-triangle'
  | 'ban'
  | 'hourglass'
  | 'flag'
  | 'undo'
  | 'info'
  | 'wifi-off'
  | 'x'
  | 'loader'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'shield'
  | 'copy'
  | 'plus'
  | 'menu'
  | 'home'
  | 'gamepad-2'
  | 'trophy'
  | 'mail'
  | 'user'
  | 'star'
  | 'upload'
  | 'lock';

const ICONS: Record<IconName, LucideIcon> = {
  circle: Circle,
  check: Check,
  'check-circle': CheckCircle2,
  play: Play,
  clock: Clock,
  'alert-triangle': AlertTriangle,
  ban: Ban,
  hourglass: Hourglass,
  flag: Flag,
  undo: Undo2,
  info: Info,
  'wifi-off': WifiOff,
  x: X,
  loader: Loader2,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  shield: ShieldCheck,
  copy: Copy,
  plus: Plus,
  menu: Menu,
  home: Home,
  'gamepad-2': Gamepad2,
  trophy: Trophy,
  mail: Mail,
  user: User,
  star: Star,
  upload: Upload,
  lock: Lock,
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

/** Lucide, tree-shaken, 1.5px square-cap stroke per Design §6. Sizes 16/20/24 (+14 in dense chips). */
export function Icon({ name, size = 24, className, ...props }: IconProps) {
  const Component = ICONS[name];
  return (
    <Component
      size={size}
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    />
  );
}

const STATE_ICON: Record<string, IconName> = {
  open: 'circle',
  accepted: 'check',
  in_progress: 'play',
  awaiting_result: 'clock',
  awaiting_confirmation: 'clock',
  confirmed: 'check-circle',
  disputed: 'alert-triangle',
  resolved: 'check-circle',
  cancelled: 'ban',
  expired: 'hourglass',
  forfeited: 'flag',
  voided: 'undo',
};

export function matchStateIcon(state: string): IconName {
  return STATE_ICON[state] ?? 'circle';
}

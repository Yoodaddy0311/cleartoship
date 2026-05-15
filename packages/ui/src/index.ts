/**
 * @cleartoship/ui — design system primitives.
 * All components consume tokens from globals.css @theme.
 */
export { cn } from './lib/cn';

export { Button } from './button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './button';

export { Input, Textarea } from './input';
export type { InputProps, TextareaProps } from './input';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardBody,
  CardFooter,
} from './card';
export type { CardProps, CardVariant, CardPadding } from './card';

export { Badge } from './badge';
export type {
  BadgeProps,
  BadgeVariant,
  Severity,
  StatusVariant,
} from './badge';

export { Progress } from './progress';
export type { ProgressProps } from './progress';

export { ScoreRing } from './score-ring';
export type { ScoreRingProps } from './score-ring';

export { ScoreGauge } from './score-gauge';
export type { ScoreGaugeProps } from './score-gauge';

export { EvidenceCard } from './evidence-card';
export type { EvidenceCardProps } from './evidence-card';

export { FeatureGraphNode } from './feature-graph-node';
export type {
  FeatureGraphNodeProps,
  FeatureNodeType,
  ImplementationStatus,
} from './feature-graph-node';

export { ToastProvider, Toast } from './toast';
export type { ToastProps, ToastTone } from './toast';

export { Skeleton } from './skeleton';
export type { SkeletonProps } from './skeleton';

export { Glass } from './glass';
export type { GlassProps } from './glass';

export { AuroraBackground } from './aurora-background';
export type { AuroraBackgroundProps } from './aurora-background';

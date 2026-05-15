import * as React from 'react';
import { cn } from './lib/cn';

export type CardVariant = 'default' | 'glass' | 'elevated';
export type CardPadding = 'sm' | 'md' | 'lg' | 'none';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  as?: keyof JSX.IntrinsicElements;
}

const variantStyles: Record<CardVariant, string> = {
  default:
    'bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border-subtle)] rounded-[16px] shadow-[var(--elev-1)]',
  glass: 'glass-card',
  elevated:
    'bg-[color:var(--color-bg-elevated)] rounded-[16px] shadow-[var(--elev-2)]',
};

const paddingStyles: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = 'default', padding = 'md', as = 'div', children, ...rest },
  ref
) {
  const Component = as as React.ElementType;
  return (
    <Component
      ref={ref}
      className={cn(variantStyles[variant], paddingStyles[padding], className)}
      {...rest}
    >
      {children}
    </Component>
  );
});

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardHeader({ className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'mb-4 flex items-start justify-between gap-3',
        className
      )}
      {...rest}
    />
  );
});

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function CardTitle({ className, ...rest }, ref) {
  return (
    <h3
      ref={ref}
      className={cn(
        'text-lg font-semibold text-[color:var(--color-fg-primary)]',
        className
      )}
      {...rest}
    />
  );
});

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...rest }, ref) {
  return (
    <p
      ref={ref}
      className={cn('text-sm text-[color:var(--color-fg-secondary)]', className)}
      {...rest}
    />
  );
});

export const CardBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardBody({ className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn('text-md text-[color:var(--color-fg-primary)]', className)}
      {...rest}
    />
  );
});

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(function CardFooter({ className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'mt-6 flex items-center justify-between gap-3 pt-4 border-t border-[color:var(--color-border-subtle)]',
        className
      )}
      {...rest}
    />
  );
});

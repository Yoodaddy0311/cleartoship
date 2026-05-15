'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    // Aurora gradient bg + violet glow on hover (Von Restorff: reserved for primary CTA)
    'text-white font-medium',
    'bg-[image:var(--gradient-aurora)]',
    'shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]',
    'hover:shadow-[var(--glow-violet),0_0_0_1px_rgba(255,255,255,0.12)_inset]',
    'active:opacity-95',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none',
  ].join(' '),
  secondary: [
    // Glass background + subtle border
    'text-[color:var(--color-fg-primary)] font-medium',
    'bg-[rgba(255,255,255,0.04)] backdrop-blur-md',
    'border border-[color:var(--color-border-default)]',
    'hover:bg-[rgba(255,255,255,0.08)] hover:border-[color:var(--color-border-emphasis)]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' '),
  ghost: [
    'text-[color:var(--color-fg-secondary)] font-medium bg-transparent',
    'hover:bg-[rgba(255,255,255,0.04)] hover:text-[color:var(--color-fg-primary)]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' '),
  destructive: [
    'text-white font-medium',
    'bg-[color:var(--color-severity-p0)]',
    'hover:shadow-[0_0_24px_rgba(255,59,105,0.45)]',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none',
  ].join(' '),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-[6px]',
  md: 'h-10 px-4 text-md gap-2 rounded-[10px]',
  lg: 'h-12 px-6 text-lg gap-2.5 rounded-[10px]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      leadingIcon,
      trailingIcon,
      fullWidth,
      children,
      type = 'button',
      ...rest
    },
    ref
  ) {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        className={cn(
          'relative inline-flex items-center justify-center select-none whitespace-nowrap',
          'transition-[box-shadow,background,opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
          'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
          // Min touch target on mobile (Fitts's Law)
          size === 'sm' ? 'min-h-[32px]' : 'min-h-[44px] sm:min-h-0',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        {...rest}
      >
        {loading && (
          <Loader2
            aria-hidden="true"
            className="absolute h-4 w-4 animate-spin"
          />
        )}
        <span
          className={cn(
            'inline-flex items-center gap-[inherit]',
            loading && 'invisible'
          )}
        >
          {leadingIcon ? (
            <span aria-hidden="true" className="inline-flex">
              {leadingIcon}
            </span>
          ) : null}
          {children}
          {trailingIcon ? (
            <span aria-hidden="true" className="inline-flex">
              {trailingIcon}
            </span>
          ) : null}
        </span>
      </button>
    );
  }
);

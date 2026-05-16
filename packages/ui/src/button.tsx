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
    'text-[color:var(--app-bg)] font-medium',
    'bg-[color:var(--app-fg)]',
    'hover:opacity-90',
    'active:opacity-95',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' '),
  secondary: [
    'text-[color:var(--app-fg)] font-medium',
    'bg-[color:var(--app-surface)]',
    'border border-[color:var(--app-border)]',
    'hover:bg-[color:var(--app-bg-soft)]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' '),
  ghost: [
    'text-[color:var(--app-fg-muted)] font-medium bg-transparent',
    'hover:bg-[color:var(--app-bg-soft)] hover:text-[color:var(--app-fg)]',
    'disabled:opacity-50 disabled:cursor-not-allowed',
  ].join(' '),
  destructive: [
    'text-white font-medium',
    'bg-[color:var(--sev-p0)]',
    'hover:opacity-90',
    'disabled:opacity-50 disabled:cursor-not-allowed',
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
          'focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]',
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

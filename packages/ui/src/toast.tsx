'use client';

import * as React from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { cn } from './lib/cn';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_VAR: Record<ToastTone, string> = {
  info: '--color-nebula-blue',
  success: '--color-plasma-cyan',
  warning: '--color-severity-p2',
  danger: '--color-severity-p0',
};

export interface ToastProviderProps {
  children?: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  return (
    <RadixToast.Provider swipeDirection="right" duration={5000}>
      {children}
      <RadixToast.Viewport
        className={cn(
          'fixed bottom-4 right-4 z-[100] flex max-h-screen w-[360px] max-w-[calc(100vw-2rem)]',
          'flex-col gap-2 outline-none'
        )}
      />
    </RadixToast.Provider>
  );
}

export interface ToastProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone?: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function Toast({
  open,
  onOpenChange,
  tone = 'info',
  title,
  description,
  action,
}: ToastProps) {
  const colorVar = TONE_VAR[tone];
  return (
    <RadixToast.Root
      open={open}
      onOpenChange={onOpenChange}
      className={cn(
        'relative grid grid-cols-[auto_1fr_auto] items-start gap-3',
        'rounded-[12px] border border-[color:var(--color-border-default)]',
        'bg-[color:var(--color-bg-elevated)] p-4 shadow-[var(--elev-3)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]'
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-2 left-0 w-[3px] rounded-r-full"
        style={{ background: `var(${colorVar})` }}
      />
      <div className="col-start-2 flex flex-col gap-1">
        <RadixToast.Title className="text-sm font-semibold text-[color:var(--color-fg-primary)]">
          {title}
        </RadixToast.Title>
        {description ? (
          <RadixToast.Description className="text-xs text-[color:var(--color-fg-secondary)]">
            {description}
          </RadixToast.Description>
        ) : null}
      </div>
      <div className="col-start-3 flex items-center gap-1">
        {action ? (
          <RadixToast.Action
            altText={action.label}
            asChild
            onClick={action.onClick}
          >
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-[color:var(--color-aurora-violet)] hover:bg-[rgba(255,255,255,0.04)]"
            >
              {action.label}
            </button>
          </RadixToast.Action>
        ) : null}
        <RadixToast.Close
          aria-label="닫기"
          className="rounded-md p-1 text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-fg-primary)] hover:bg-[rgba(255,255,255,0.04)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </RadixToast.Close>
      </div>
    </RadixToast.Root>
  );
}

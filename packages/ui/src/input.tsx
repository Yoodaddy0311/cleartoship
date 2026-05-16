'use client';

import * as React from 'react';
import { cn } from './lib/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  hint?: string;
  label?: string;
  required?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { className, error, hint, label, required, id, ...rest },
    ref
  ) {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const describedById = error
      ? `${inputId}-err`
      : hint
      ? `${inputId}-hint`
      : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={inputId}
            className="text-sm text-[color:var(--app-fg-muted)]"
          >
            {label}
            {required ? (
              <span
                aria-hidden="true"
                className="ml-1 text-[color:var(--sev-p0)]"
              >
                *
              </span>
            ) : null}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedById}
          aria-required={required || undefined}
          className={cn(
            'h-11 w-full rounded-[10px] px-3.5 text-md',
            'bg-[color:var(--app-surface)]',
            'text-[color:var(--app-fg)]',
            'placeholder:text-[color:var(--app-fg-muted)]',
            'border border-[color:var(--app-border)]',
            'transition-[box-shadow,border-color,background] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
            'hover:border-[color:var(--app-fg-muted)]',
            'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]',
            error &&
              'border-[color:var(--sev-p0)] focus:border-[color:var(--sev-p0)]',
            className
          )}
          {...rest}
        />
        {error ? (
          <p
            id={`${inputId}-err`}
            role="alert"
            className="text-xs text-[color:var(--sev-p0)]"
          >
            {error}
          </p>
        ) : hint ? (
          <p
            id={`${inputId}-hint`}
            className="text-xs text-[color:var(--app-fg-muted)]"
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  hint?: string;
  label?: string;
  required?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { className, error, hint, label, required, id, rows = 5, ...rest },
    ref
  ) {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const describedById = error
      ? `${inputId}-err`
      : hint
      ? `${inputId}-hint`
      : undefined;
    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={inputId}
            className="text-sm text-[color:var(--app-fg-muted)]"
          >
            {label}
            {required ? (
              <span
                aria-hidden="true"
                className="ml-1 text-[color:var(--sev-p0)]"
              >
                *
              </span>
            ) : null}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedById}
          aria-required={required || undefined}
          className={cn(
            'w-full rounded-[10px] px-3.5 py-2.5 text-md leading-[1.55] resize-y',
            'bg-[color:var(--app-surface)]',
            'text-[color:var(--app-fg)]',
            'placeholder:text-[color:var(--app-fg-muted)]',
            'border border-[color:var(--app-border)]',
            'transition-[box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
            'hover:border-[color:var(--app-fg-muted)]',
            'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]',
            error &&
              'border-[color:var(--sev-p0)] focus:border-[color:var(--sev-p0)]',
            className
          )}
          {...rest}
        />
        {error ? (
          <p
            id={`${inputId}-err`}
            role="alert"
            className="text-xs text-[color:var(--sev-p0)]"
          >
            {error}
          </p>
        ) : hint ? (
          <p
            id={`${inputId}-hint`}
            className="text-xs text-[color:var(--app-fg-muted)]"
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);

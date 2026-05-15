import * as React from 'react';
import { cn } from './lib/cn';

export interface GlassProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Apply the gradient-aurora hover ring (see globals.css .glass-card). */
  hoverRing?: boolean;
  as?: keyof JSX.IntrinsicElements;
}

/**
 * Glass — utility wrapper that applies the `glass` recipe.
 * For full hover ring effect (gradient aurora outline), set `hoverRing`.
 */
export const Glass = React.forwardRef<HTMLDivElement, GlassProps>(function Glass(
  { className, hoverRing, as = 'div', children, ...rest },
  ref
) {
  const Component = as as React.ElementType;
  return (
    <Component
      ref={ref}
      className={cn(hoverRing ? 'glass-card' : 'glass', className)}
      {...rest}
    >
      {children}
    </Component>
  );
});

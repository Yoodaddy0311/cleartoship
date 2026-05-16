import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders a <button type="button"> with the provided label', () => {
    render(<Button>Click</Button>);
    const btn = screen.getByRole('button', { name: 'Click' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('variant=primary applies app-token classes and mk-accent focus ring (no aurora legacy)', () => {
    render(<Button variant="primary">Go</Button>);
    const btn = screen.getByRole('button', { name: 'Go' });
    const cls = btn.className;
    expect(cls).toContain('--app-fg');
    expect(cls).toContain('--app-bg');
    expect(cls).toContain('--mk-accent');
    expect(cls).not.toMatch(/aurora|gradient-aurora|glow-violet/);
  });

  it('invokes onClick when the user clicks the button', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Press' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT invoke onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Nope
      </Button>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nope' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading sets aria-busy and suppresses the click handler', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Loading
      </Button>
    );
    const btn = screen.getByRole('button', { name: /Loading/ });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

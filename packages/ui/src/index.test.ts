// Barrel export integrity tests — sibling-located on purpose.
// The light 2-theme migration removed aurora-background + glass and added
// finding-card / filter-chips / data-table. If the index.ts regresses (e.g.
// someone reintroduces an aurora alias or drops a Semgrep-surface export),
// downstream consumers break silently — this test fails loudly instead.

import { describe, it, expect } from 'vitest';
import * as UI from './index.js';

describe('@cleartoship/ui barrel', () => {
  it('exports the design-system primitives', () => {
    expect(UI.cn).toBeTypeOf('function');
    expect(UI.Button).toBeTypeOf('object'); // forwardRef returns object
    expect(UI.Input).toBeTypeOf('object');
    expect(UI.Textarea).toBeTypeOf('object');
    expect(UI.Card).toBeTypeOf('object');
    expect(UI.Badge).toBeTypeOf('object');
    expect(UI.Progress).toBeTypeOf('object'); // forwardRef returns object
    expect(UI.ScoreRing).toBeTypeOf('function');
    expect(UI.ScoreGauge).toBeTypeOf('function');
    expect(UI.EvidenceCard).toBeTypeOf('function');
    expect(UI.FeatureGraphNode).toBeTypeOf('function');
    expect(UI.Skeleton).toBeTypeOf('function');
    expect(UI.Toast).toBeTypeOf('function');
    expect(UI.ToastProvider).toBeTypeOf('function');
  });

  it('exports the Semgrep-surface components (post-redesign)', () => {
    expect(UI).toHaveProperty('FindingCard');
    expect(UI).toHaveProperty('FilterChips');
    expect(UI).toHaveProperty('DataTable');
  });

  it('does NOT export the deleted aurora/glass legacy components', () => {
    expect(UI).not.toHaveProperty('AuroraBackground');
    expect(UI).not.toHaveProperty('Glass');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { forceSyncCursorRendering } from '../../src/renderer/utils/force-sync-cursor';

/**
 * Builds a minimal fake xterm Terminal exposing the same private internals the
 * patch reaches into: _core._renderService._renderer.value._renderLayers, with
 * a CursorRenderLayer-shaped object (identified by `_cursorRenderers`).
 */
function makeFakeTerminal(opts: { blink?: boolean } = {}) {
  const render = vi.fn();
  const restartBlinkAnimation = vi.fn();
  const cursorLayer: any = {
    _cursorRenderers: { block: () => {} },
    _cursorBlinkStateManager: opts.blink ? { value: { restartBlinkAnimation } } : { value: undefined },
    _render: render,
    handleCursorMove: vi.fn(),
    handleGridChanged: vi.fn(),
  };
  const textLayer: any = { _render: vi.fn() }; // no _cursorRenderers
  const terminal: any = {
    _core: { _renderService: { _renderer: { value: { _renderLayers: [textLayer, cursorLayer] } } } },
  };
  return { terminal, cursorLayer, render, restartBlinkAnimation };
}

describe('forceSyncCursorRendering', () => {
  it('makes handleGridChanged repaint the cursor synchronously', () => {
    const { terminal, cursorLayer, render } = makeFakeTerminal();
    expect(forceSyncCursorRendering(terminal)).toBe(true);
    cursorLayer.handleGridChanged(0, 5);
    expect(render).toHaveBeenCalledWith(false);
  });

  it('makes handleCursorMove repaint the cursor synchronously', () => {
    const { terminal, cursorLayer, render } = makeFakeTerminal();
    forceSyncCursorRendering(terminal);
    cursorLayer.handleCursorMove();
    expect(render).toHaveBeenCalledWith(false);
  });

  it('keeps the blink timer alive by restarting it on each repaint', () => {
    const { terminal, cursorLayer, restartBlinkAnimation } = makeFakeTerminal({ blink: true });
    forceSyncCursorRendering(terminal);
    cursorLayer.handleGridChanged(0, 0);
    expect(restartBlinkAnimation).toHaveBeenCalledOnce();
  });

  it('works when cursorBlink is off (no blink manager)', () => {
    const { terminal, cursorLayer, render } = makeFakeTerminal({ blink: false });
    forceSyncCursorRendering(terminal);
    expect(() => cursorLayer.handleCursorMove()).not.toThrow();
    expect(render).toHaveBeenCalledWith(false);
  });

  it('is idempotent — patching twice does not double-invoke render', () => {
    const { terminal, cursorLayer, render } = makeFakeTerminal();
    expect(forceSyncCursorRendering(terminal)).toBe(true);
    expect(forceSyncCursorRendering(terminal)).toBe(false);
    cursorLayer.handleGridChanged(0, 0);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('returns false (no throw) when renderer internals are absent', () => {
    expect(forceSyncCursorRendering({} as any)).toBe(false);
    expect(forceSyncCursorRendering({ _core: {} } as any)).toBe(false);
  });
});

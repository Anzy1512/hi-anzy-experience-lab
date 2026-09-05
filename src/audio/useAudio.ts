import { useCallback, useEffect, useState } from 'react';
import type { CleanupScope } from '../core/cleanup';
import { audio, type AudioState, type Scene } from './engine';

/**
 * Binds the shared audio engine to one mode's lifetime.
 *
 * The scene is created on enable and disposed by the mode's `CleanupScope`, so
 * leaving a mode by *any* route — Escape, the exit control, browser back, a hash
 * change, the engine's watchdog — stops every source and disconnects every node.
 * The context itself is closed too: an idle AudioContext left open is exactly
 * the "hidden persistent context" the brief rules out.
 */
export function useAudio(scope: CleanupScope) {
  const [state, setState] = useState<AudioState>(audio.state);
  const [scene, setScene] = useState<Scene | null>(null);
  const [muted, setMuted] = useState(audio.muted);

  useEffect(() => audio.subscribe(setState), []);

  /** Must be called from a user gesture. */
  const enable = useCallback(async () => {
    const ok = await audio.enable();
    if (!ok) return false;
    const s = audio.scene();
    setScene(s);
    return !!s;
  }, []);

  const disable = useCallback(() => {
    setScene((prev) => {
      prev?.dispose();
      return null;
    });
    audio.disable();
  }, []);

  const toggleMute = useCallback(() => {
    const next = !audio.muted;
    audio.setMuted(next);
    setMuted(next);
  }, []);

  // Whatever happens, sound does not outlive the mode.
  useEffect(() => {
    const teardown = () => {
      audio.disable();
    };
    scope.add(teardown);
    return teardown;
  }, [scope]);

  return { state, scene, enable, disable, muted, toggleMute };
}

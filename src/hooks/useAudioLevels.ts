import { useEffect, useMemo, useRef, useState } from 'react';
import { getAudioContext } from '../lib/background';

export type AudioSource = { id: string; stream: MediaStream | null; muted: boolean };

type Node = {
  trackId: string;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buf: Uint8Array<ArrayBuffer>;
  level: number;
};

const SPEAK_THRESHOLD = 0.035;
const ACTIVE_HOLD_MS = 1500;

/**
 * Lightweight voice-activity detection for the "who's talking" glow and for
 * picking which video to show in Picture-in-Picture. Analyses at ~7 Hz.
 */
export function useAudioLevels(sources: AudioSource[]) {
  const [speaking, setSpeaking] = useState<ReadonlySet<string>>(() => new Set());
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const nodes = useRef(new Map<string, Node>());
  const mutedRef = useRef(new Map<string, boolean>());
  const activeRef = useRef<{ id: string | null; since: number }>({ id: null, since: 0 });

  const key = sources
    .map((s) => `${s.id}:${s.stream?.getAudioTracks()[0]?.id ?? '-'}:${s.muted ? 1 : 0}`)
    .join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableSources = useMemo(() => sources, [key]);

  useEffect(() => {
    const ctx = getAudioContext();
    const seen = new Set<string>();
    for (const s of stableSources) {
      mutedRef.current.set(s.id, s.muted);
      const track = s.stream?.getAudioTracks()[0];
      if (!ctx || !track || track.readyState !== 'live') continue;
      seen.add(s.id);
      const existing = nodes.current.get(s.id);
      if (existing && existing.trackId === track.id) continue;
      if (existing) existing.source.disconnect();
      try {
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser); // not connected to destination → no double playback
        nodes.current.set(s.id, {
          trackId: track.id,
          source,
          analyser,
          buf: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
          level: 0,
        });
      } catch {
        /* some browsers refuse remote streams in WebAudio; just skip */
      }
    }
    for (const [id, node] of nodes.current) {
      if (!seen.has(id)) {
        node.source.disconnect();
        nodes.current.delete(id);
        mutedRef.current.delete(id);
      }
    }
  }, [stableSources]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now();
      const next = new Set<string>();
      let loudest: string | null = null;
      let loudestLevel = 0;
      for (const [id, node] of nodes.current) {
        node.analyser.getByteTimeDomainData(node.buf);
        let sum = 0;
        for (let i = 0; i < node.buf.length; i++) {
          const v = (node.buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / node.buf.length);
        node.level = node.level * 0.5 + rms * 0.5;
        if (mutedRef.current.get(id)) continue;
        if (node.level > SPEAK_THRESHOLD) {
          next.add(id);
          if (node.level > loudestLevel) {
            loudestLevel = node.level;
            loudest = id;
          }
        }
      }
      setSpeaking((prev) => (sameSet(prev, next) ? prev : next));
      const a = activeRef.current;
      if (loudest && loudest !== a.id && now - a.since > ACTIVE_HOLD_MS) {
        activeRef.current = { id: loudest, since: now };
        setActiveSpeaker(loudest);
      } else if (loudest === a.id) {
        a.since = now;
      }
    }, 140);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      for (const node of nodes.current.values()) node.source.disconnect();
      nodes.current.clear();
    },
    [],
  );

  return { speaking, activeSpeaker };
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { errorText, getPlayUrl, type QueueEntry } from "./musicApi";

interface Queue {
  entries: QueueEntry[];
  index: number;
  name: string;
}

interface MusicPlayback extends Queue {
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  error: string;
  start: (entries: QueueEntry[], name: string, index?: number) => void;
  select: (index: number) => void;
  toggle: () => void;
  seek: (time: number) => void;
}

const Context = createContext<MusicPlayback | null>(null);
const StartContext = createContext<MusicPlayback["start"] | null>(null);
const EMPTY: Queue = { entries: [], index: -1, name: '' };

export function MusicPlaybackProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController>();
  const current = useRef<Queue>(EMPTY);
  const [queue, setQueue] = useState<Queue>(EMPTY);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = audio.current!;
    return () => {
      request.current?.abort();
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, []);

  const attemptPlay = async (element: HTMLAudioElement, signal?: AbortSignal) => {
    try {
      await element.play();
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
      setError(err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Нажмите «Воспроизвести», чтобы включить звук.'
        : 'Браузер не смог воспроизвести исходный файл. Попробуйте ещё раз или выберите другой трек.');
    }
  };

  const open = useCallback(async (next: Queue) => {
    const element = audio.current;
    const entry = next.entries[next.index];
    if (!element || !entry) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    current.current = next;
    setQueue(next);
    element.pause();
    element.removeAttribute('src');
    element.load();
    setPosition(0);
    setDuration(entry.track.duration);
    setPlaying(false);
    setLoading(true);
    setError('');
    try {
      const { url } = await getPlayUrl(entry.track.id, controller.signal);
      if (controller.signal.aborted) return;
      element.src = url;
      await attemptPlay(element, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) setError('Не удалось открыть трек. ' + errorText(err));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const select = useCallback((index: number) => { void open({ ...current.current, index }); }, [open]);
  const start = useCallback((entries: QueueEntry[], name: string, index = 0) => { void open({ entries, index, name }); }, [open]);
  const toggle = () => {
    const element = audio.current;
    if (!element || current.current.index < 0) return;
    if (!element.paused) { element.pause(); return; }
    setError('');
    if (element.error || !element.getAttribute('src')) { void open(current.current); return; }
    void attemptPlay(element, request.current?.signal);
  };
  const seek = (time: number) => {
    if (audio.current && audio.current.readyState >= HTMLMediaElement.HAVE_METADATA) {
      audio.current.currentTime = Math.max(0, Math.min(duration, time));
      setPosition(audio.current.currentTime);
    }
  };

  return <Context.Provider value={{ ...queue, start, select, toggle, seek, playing, loading, position, duration, error }}>
    <StartContext.Provider value={start}>{children}</StartContext.Provider>
    <audio ref={audio} preload="metadata"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onLoadedMetadata={e => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration); }}
      onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
      onEnded={() => { setPlaying(false); select(current.current.index + 1); }}
      onError={e => { if (e.currentTarget.getAttribute('src') && e.currentTarget.error) {
        setPlaying(false);
        setError('Не удалось прочитать исходный аудиофайл. Проверьте доступ к Jellyfin и поддержку кодека в браузере.');
      } }}
    />
  </Context.Provider>;
}

export function useMusicPlayback() {
  const state = useContext(Context);
  if (!state) throw new Error("Music playback provider is missing");
  return state;
}

export function useStartMusic() {
  const start = useContext(StartContext);
  if (!start) throw new Error("Music playback provider is missing");
  return start;
}

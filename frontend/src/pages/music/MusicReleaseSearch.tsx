import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Search, X } from "lucide-react";
import { errorText, getMusicDownloads, getMusicReleases, grabMusicRelease, type MusicDownload } from "./musicApi";

const statusNames: Record<string, string> = { queued: 'В очереди', downloading: 'Скачивается', paused: 'Приостановлено', stalled: 'Ожидает пиров', 'scan-pending': 'Скачано · ожидает запроса в Jellyfin', 'scan-requested': 'Скачано · сканирование Jellyfin запрошено', downloaded: 'Скачано', missing: 'Отсутствует в qBittorrent', error: 'Ошибка' };
const bytes = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 });
function sizeText(size: number) {
  if (!size) return 'Размер неизвестен';
  return size >= 1024 ** 3 ? bytes.format(size / 1024**3) + ' ГБ' : bytes.format(size / 1024**2) + ' МБ';
}

export function MusicReleaseSearch({ query, search, onComplete }: { query: string; search: (query: string) => void; onComplete: () => void }) {
  const [input, setInput] = useState(query);
  const [result, setResult] = useState<Awaited<ReturnType<typeof getMusicReleases>> | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [limit, setLimit] = useState(12);
  const [downloads, setDownloads] = useState<MusicDownload[]>([]);
  const [downloadError, setDownloadError] = useState('');
  const [qb, setQb] = useState<boolean>();
  const [downloadTick, setDownloadTick] = useState(0);
  const [pending, setPending] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [grabError, setGrabError] = useState('');
  const previous = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    setInput(query); setError(''); setGrabError(''); setResult(null); setLimit(12);
    getMusicReleases(query, controller.signal).then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(err => { if (!controller.signal.aborted) setError(errorText(err)); });
    return () => controller.abort();
  }, [query, retry]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await getMusicDownloads(controller.signal);
        if (controller.signal.aborted) return;
        setDownloads(data.downloads); setQb(data.configured); setDownloadError('');
        if (data.downloads.some(d => d.status === 'scan-requested' && previous.current.get(d.id) !== 'scan-requested')) onComplete();
        previous.current = new Map(data.downloads.map(d => [d.id, d.status]));
      } catch (err) { if (!controller.signal.aborted) setDownloadError(errorText(err)); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 12_000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [downloadTick, onComplete]);

  const grab = useCallback(async (id: string) => {
    setPending(p => [...p, id]); setGrabError('');
    try {
      await grabMusicRelease(id);
      setAdded(p => [...p, id]); setDownloadTick(n => n + 1);
      window.dispatchEvent(new Event('download-quota-changed'));
    } catch (err) { setGrabError(errorText(err)); }
    finally { setPending(p => p.filter(x => x !== id)); }
  }, []);

  return <>
    <section className="mu-finder"><h1>Discovery</h1><p>Найдите альбом или исполнителя в раздачах FLAC.</p>
      <form className="mu-search" onSubmit={e => { e.preventDefault(); if (input.trim() === query) setRetry(n => n + 1); else search(input.trim()); }}>
        <Search /><input type="search" aria-label="Альбом или исполнитель" placeholder="Альбом или исполнитель" value={input} onChange={e => setInput(e.target.value)} maxLength={180}/>
        <button className="mu-primary">Найти</button>
      </form>
    </section>
    <section aria-label="Раздачи"><div className="mu-heading"><h2>{query ? 'Результаты поиска' : 'Новые раздачи'}</h2>
      {query && <button className="mu-text" onClick={() => search('')}><X />Сбросить поиск</button>}</div>
      {error ? <p className="mu-note" role="alert">Поиск недоступен. {error} <button className="mu-text" onClick={() => setRetry(n => n + 1)}>Повторить</button></p>
        : !result ? <p className="mu-note" role="status">Ищем FLAC-раздачи…</p>
        : !result.configured ? <p className="mu-note">Подключите Jackett в настройках интеграций для поиска музыкальных раздач.</p>
        : !result.releases.length ? <p className="mu-note">{query ? 'По этому запросу нет FLAC-раздач. Попробуйте имя исполнителя или оригинальное название альбома.' : 'Индексаторы пока не вернули свежие FLAC-раздачи. Попробуйте поиск по названию.'}</p>
        : <>{(result.qbConfigured === false || qb === false) && <p className="mu-note">Для загрузки подключите qBittorrent.</p>}
          <div className="mu-rows">{result.releases.slice(0, limit).map(r => {
            const submitted = added.includes(r.id) || downloads.some(d => d.id === r.id && !['error','missing'].includes(d.status));
            return <div className="mu-row mu-release" key={r.id}>
              <span className="mu-name"><strong>{r.title}</strong><small>{[r.indexer, r.publishedAt && new Date(r.publishedAt).toLocaleDateString('ru')].filter(Boolean).join(' · ')}</small></span>
              <span className="mu-quality">{r.quality}</span><span className="mu-size">{sizeText(r.size)}{r.seeders !== null && <small>Сидов: {r.seeders}</small>}</span>
              <button className="mu-button" disabled={submitted || pending.includes(r.id) || result.qbConfigured === false || qb === false}
                onClick={() => void grab(r.id)}>{submitted ? <Check /> : <ArrowDownToLine />}{submitted ? 'Добавлено' : pending.includes(r.id) ? 'Добавляем…' : 'Скачать'}</button>
            </div>;
          })}</div>
          {limit < result.releases.length && <button className="mu-button mu-more" onClick={() => setLimit(limit + 12)}>Показать ещё</button>}</>}
      {grabError && <p className="mu-issue" role="alert">Не удалось добавить раздачу. {grabError}</p>}
    </section>
    {(downloads.length > 0 || downloadError) && <section><div className="mu-heading"><h2>Загрузки</h2></div>
      {downloadError && <p className="mu-note" role="alert">Статус qBittorrent недоступен. {downloadError}</p>}
      <div className="mu-rows">{downloads.map(d => <div key={d.id} className="mu-download">
        <strong>{d.title}</strong><small>{statusNames[d.status] ?? d.status} · {Math.round(d.progress)}%</small>
        <progress aria-label={'Загрузка ' + d.title} max={100} value={d.progress} />
      </div>)}</div>
    </section>}
  </>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Disc3 } from "lucide-react";
import { getMusicTaste, setMusicLike } from "../../lib/musicTaste";
import { useRegisterTabs } from "../../lib/tabsContext";
import { MusicDiscovery } from "./MusicDiscovery";
import { useStartMusic } from "./MusicPlayback";
import { MusicPlaylists, useTrackMatches, type Taste } from "./MusicPlaylists";
import { MusicMiniPlayer, MusicSession } from "./MusicSession";
import { AlbumDialog, MusicShelf, type StartQueue } from "./MusicShelf";
import { albumEntries, errorText, getMusicLibrary, type MusicAlbum, type MusicLibrary } from "./musicApi";
import "./music.css";

const tabs = ['Витрина', 'Discovery', 'Сеанс'];
const paths = ['/music', '/music/discovery', '/music/session'];
const noAlbums: MusicAlbum[] = [];
const emptyTaste: Taste = { likes: [], playlists: [] };

export function MusicRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = paths.indexOf(location.pathname.replace(/\/+$/, ''));
  useRegisterTabs(tabs, Math.max(0, tab), i => navigate(paths[i]));
  const [library, setLibrary] = useState<MusicLibrary | null>(null);
  const [libraryError, setLibraryError] = useState('');
  const [reload, setReload] = useState(0);
  const [taste, setTaste] = useState<Taste | null>(null);
  const [tasteError, setTasteError] = useState('');
  const [likeBusy, setLikeBusy] = useState(false);
  const tasteVersion = useRef(0);
  const [tasteReload, setTasteReload] = useState(0);
  const [selected, setSelected] = useState<MusicAlbum | null>(null);
  const startPlayback = useStartMusic();

  useEffect(() => {
    const controller = new AbortController();
    setLibraryError('');
    getMusicLibrary(controller.signal)
      .then(data => { if (!controller.signal.aborted) setLibrary(data); })
      .catch(err => { if (!controller.signal.aborted) setLibraryError(errorText(err)); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) setReload(n => n + 1); }, 180_000);
    return () => window.clearInterval(timer);
  }, []);
  const refreshLibrary = useCallback(() => setReload(n => n + 1), []);

  useEffect(() => {
    let active = true;
    setTasteError('');
    const version = tasteVersion.current;
    getMusicTaste().then(data => { if (active && version === tasteVersion.current) setTaste(data); })
      .catch(err => { if (active && version === tasteVersion.current) setTasteError(errorText(err)); });
    return () => { active = false; };
  }, [tasteReload]);

  const setLike = async (id: string, liked: boolean) => {
    setLikeBusy(true); setTasteError('');
    try {
      await setMusicLike(id, liked);
      tasteVersion.current++;
      setTaste(t => t && ({ ...t, likes: liked ? [...new Set([...t.likes, id])] : t.likes.filter(key => key !== id) }));
    } catch (err) { setTasteError(errorText(err)); }
    finally { setLikeBusy(false); }
  };
  useEffect(() => {
    setSelected(null);
    if (location.hash === '#music-playlists') document.getElementById('music-playlists')?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [location.key]);

  const albums = library?.albums ?? noAlbums;
  const entries = useMemo(() => albums.flatMap(albumEntries), [albums]);
  const matches = useTrackMatches(entries);
  const search = (q: string) => navigate(paths[1] + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''));
  const start: StartQueue = (queue, name, index = 0) => {
    if (!queue[index]) return;
    startPlayback(queue, name, index);
    navigate(paths[2]);
  };
  const playlistPanel = <MusicPlaylists taste={taste ?? emptyTaste} matches={matches} onImport={data => { tasteVersion.current++; setTasteError(''); setTaste(data); }} search={search} start={start}
    compact={tab === 0} openImports={() => navigate('/music/discovery#music-playlists')} />;
  const libraryNote = !library?.configured ? 'Подключите Jellyfin в настройках интеграций. Уже сейчас можно искать и загружать FLAC-раздачи в Discovery.'
    : !library.linked ? 'Привяжите пользователя Jellyfin и войдите в Pultra повторно, чтобы открыть свои альбомы.'
    : 'Добавьте музыку в библиотеку Jellyfin или выберите FLAC-раздачу в Discovery. После индексации здесь появятся обложки и треки.';

  if (tab < 0) return <Navigate to="/music" replace />;
  return <main className="mu-page" aria-label="Музыка">
    {libraryError && <p className="mu-issue" role="alert">Не удалось обновить фонотеку. {libraryError} <button className="mu-text" onClick={refreshLibrary}>Повторить</button></p>}
    {tasteError && <p className="mu-issue" role="alert">Отметки и плейлисты: {tasteError} <button className="mu-text" onClick={() => setTasteReload(n => n + 1)}>Обновить</button></p>}
    {tab === 0 && (albums.length ? <MusicShelf albums={albums} start={start} onAlbum={setSelected} playlists={playlistPanel}/>
      : <><section className="mu-empty mu-empty-shelf"><Disc3 /><h1>{!library && !libraryError ? 'Открываем фонотеку…' : 'Ваша фонотека'}</h1>
        <p>{libraryError && !library ? 'Проверьте подключение к Jellyfin или продолжите поиск музыки в Discovery.' : library ? libraryNote : 'Получаем альбомы и треки из Jellyfin.'}</p>
        <button className="mu-primary" onClick={() => navigate(paths[1])}>Открыть Discovery <ArrowRight /></button>
        {library && <button className="mu-button" onClick={refreshLibrary}>Обновить фонотеку</button>}</section>{playlistPanel}</>)}
    {tab === 1 && <MusicDiscovery albums={albums} entries={entries} taste={taste ?? emptyTaste} query={new URLSearchParams(location.search).get('q') ?? ''}
      search={search} start={start} onAlbum={setSelected} onComplete={refreshLibrary} playlists={playlistPanel}/>}
    {tab === 2 ? <MusicSession likes={taste?.likes ?? []} onLike={setLike} likeBusy={likeBusy} canLike={taste !== null} openShelf={() => navigate(paths[0])} />
      : <MusicMiniPlayer openSession={() => navigate(paths[2])} />}
    {selected && <AlbumDialog album={selected} onClose={() => setSelected(null)} start={start}/>}
  </main>;
}

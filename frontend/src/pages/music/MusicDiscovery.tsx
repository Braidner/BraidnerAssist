import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Heart, Play } from "lucide-react";
import { Artwork } from "./MusicArtwork";
import { normalizeName, trackKey, type Taste } from "./MusicPlaylists";
import { MusicReleaseSearch } from "./MusicReleaseSearch";
import { type StartQueue } from "./MusicShelf";
import { tracksCount, type MusicAlbum, type QueueEntry } from "./musicApi";

const moods = [
  { name: 'После полуночи', genres: 'Джаз и ночные ритмы', query: 'jazz', style: 'jazz' },
  { name: 'В движении', genres: 'Электронная музыка', query: 'electronic', style: 'electronic' },
  { name: 'Погружение', genres: 'Эмбиент', query: 'ambient', style: 'ambient' },
];

export function MusicDiscovery({ albums, entries, taste, query, search, start, onAlbum, onComplete, playlists }: {
  albums: MusicAlbum[]; entries: QueueEntry[]; taste: Taste; query: string; search: (q: string) => void;
  start: StartQueue; onAlbum: (a: MusicAlbum) => void; onComplete: () => void; playlists: ReactNode;
}) {
  const [likesLimit, setLikesLimit] = useState(8);
  const personal = useMemo(() => {
    const localLikes = new Set(taste.likes);
    const importedLikes = new Set(taste.playlists.filter(p => normalizeName(p.name) === 'мне нравится')
      .flatMap(p => p.tracks.map(t => trackKey(t.artist, t.title))));
    const favs = entries.filter(e => localLikes.has(e.track.id) || importedLikes.has(trackKey(e.track.artist || e.album.artist, e.track.title)));
    const artists = new Map<string, string>();
    for (const p of taste.playlists) for (const t of p.tracks) artists.set(normalizeName(t.artist), t.artist);
    for (const e of favs) artists.set(normalizeName(e.album.artist), e.album.artist);
    const genres = new Set(favs.flatMap(e => e.album.genres).map(normalizeName));
    const likedAlbums = new Set(favs.map(e => e.album.id));
    const ranked = albums.filter(a => !likedAlbums.has(a.id)).map(album => {
      const byArtist = artists.has(normalizeName(album.artist));
      const genre = album.genres.find(g => genres.has(normalizeName(g)));
      return { album, score: (byArtist ? 2 : 0) + (genre ? 1 : 0), reason: byArtist ? 'Знакомый исполнитель' : 'Любимый жанр · ' + genre };
    }).filter(a => a.score).sort((a, b) => b.score - a.score).slice(0, 6);
    return { favs, ranked, artists: [...artists.values()].slice(0, 6) };
  }, [albums, entries, taste]);
  return <>
    <MusicReleaseSearch query={query} search={search} onComplete={onComplete} />
    <section><div className="mu-heading"><h2>Подборки по настроению</h2></div><div className="mu-moods">
      {moods.map(m => <button className={'mu-mood mu-mood-' + m.style} key={m.name} onClick={() => search(m.query)}>
        <span className="mu-grooves" aria-hidden="true" /><strong>{m.name}</strong><small>{m.genres}</small><ArrowRight />
      </button>)}
    </div></section>
    <section><div className="mu-heading"><h2>Для вас</h2></div>
      {personal.ranked.length > 0 && <div className="mu-grid">{personal.ranked.map(({ album, reason }) => <button className="mu-tile" onClick={() => onAlbum(album)} key={album.id}>
        <Artwork album={album} /><strong>{album.title}</strong><small>{album.artist}</small><small>{reason}</small>
      </button>)}</div>}
      {personal.artists.length > 0 ? <><p className="mu-note">Новые раздачи исполнителей из ваших отметок и плейлистов</p>
        <div className="mu-actions">{personal.artists.map(a => <button className="mu-button" key={a} onClick={() => search(a)}>{a}<ArrowRight /></button>)}</div></>
        : <p className="mu-note">Отметьте трек сердцем в сеансе или импортируйте плейлист. Здесь появятся альбомы знакомых исполнителей и жанров.</p>}
    </section>
    <section><div className="mu-heading"><h2>Мне нравится</h2>
      {!!personal.favs.length && <button className="mu-text" onClick={() => start(personal.favs, 'Мне нравится')}><Play />Слушать всё</button>}</div>
      {personal.favs.length ? <><div className="mu-rows">{personal.favs.slice(0, likesLimit).map((e, i) => <button className="mu-row" key={e.track.id} onClick={() => start(personal.favs, 'Мне нравится', i)}>
        <Artwork album={e.album} /><span className="mu-name"><strong>{e.track.title}</strong><small>{e.track.artist || e.album.artist}</small></span><Heart className="mu-liked" />
      </button>)}</div>{likesLimit < personal.favs.length && <button className="mu-button mu-more" onClick={() => setLikesLimit(likesLimit + 20)}>Ещё {tracksCount(personal.favs.length - likesLimit)}</button>}</>
        : <p className="mu-note">Здесь будут любимые треки, доступные в вашей фонотеке.</p>}
    </section>{playlists}
  </>;
}

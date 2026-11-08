import { memo, useState } from "react";
import { jellyfinPosterUrl } from "../../lib/api";
import { type MusicAlbum } from "./musicApi";

const inks = [
  ['#ed6946', '#421b26'], ['#e6c653', '#332b31'], ['#b3c8b8', '#23443b'],
  ['#542e3e', '#f0a9a6'], ['#c6dae4', '#354963'], ['#afbf8d', '#344a36'],
];
const sleeves = new Map<number, string>();

function sleeveArt(index: number) {
  const cached = sleeves.get(index);
  if (cached) return cached;
  const [paper, ink] = inks[index % inks.length];
  const motif = Math.floor(index / inks.length);
  const shapes = Array.from({ length: 34 }, (_, n) => {
    if (motif === 0) return '<ellipse cx="101" cy="81" rx="25" ry="45" transform="rotate(' + n * 360 / 34 + ' 80 84)"/>';
    if (motif === 1) return '<path d="M-5 ' + (35 + n * 2.8) + ' Q42 ' + (14 + n) + ' 81 ' + (55 + n * 1.6) + ' T165 ' + (35 + n * 2.8) + '"/>';
    return '<ellipse cx="' + (55 + n * 1.55) + '" cy="' + (92 - n * .3) + '" rx="' + (20 + n * .6) + '" ry="' + (50 - n * .4) + '" transform="rotate(-23 80 80)"/>';
  }).join('');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="' + paper + '"/><g fill="none" stroke="' + ink + '" stroke-width=".65">' + shapes + '<path d="M7 24h146M7 150h146"/></g></svg>';
  const url = 'data:image/svg+xml,' + encodeURIComponent(svg);
  sleeves.set(index, url);
  return url;
}

export const Artwork = memo(function Artwork({ album, eager = false }: { album: MusicAlbum; eager?: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  const loading = eager ? 'eager' : 'lazy';
  if (album.coverId && broken !== album.coverId) return <img className="mu-art" src={jellyfinPosterUrl(album.coverId)}
    alt="" decoding="async" loading={loading} onError={() => setBroken(album.coverId)} />;
  const seed = Array.from(album.id).reduce((hash, c) => Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const index = seed % (inks.length * 3);
  return <span className="mu-art mu-fallback" aria-hidden="true" style={{ color: inks[index % inks.length][1] }}>
    <img src={sleeveArt(index)} alt="" decoding="async" loading={loading} /><span className="mu-cover-type">
      <b>{album.title}</b><small>{album.artist}</small>
    </span>
    <span className="mu-cover-foot"><span>Pultra / Фонотека</span><span>PLT. {seed.toString(16).slice(-5).toUpperCase()}</span></span>
  </span>;
});

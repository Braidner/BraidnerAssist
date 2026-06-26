import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { MediaPage } from "./MediaPage.tsx";
import { MediaSeriesPage } from "./MediaSeriesPage.tsx";
import { MediaMoviePage } from "./MediaMoviePage.tsx";
import { getMedia, type MediaData } from "../../lib/api.ts";

const DEFAULT_MEDIA: MediaData = { configured: false, torrserver: false, tmdb: false, nowPlaying: [], downloads: [] };

export function MediaRoutes() {
  const [media, setMedia] = useState<MediaData>(DEFAULT_MEDIA);

  const dlActive = media.downloads.some(
    (d) => d.progress < 100 && !/paused|stopped|completed|error/i.test(d.state),
  );

  useEffect(() => {
    getMedia().then(setMedia);
    const t = setInterval(() => getMedia().then(setMedia), dlActive ? 5_000 : 15_000);
    return () => clearInterval(t);
  }, [dlActive]);

  const onMediaUpdate = () => getMedia().then(setMedia);

  return (
    <Routes>
      <Route path="/" element={<MediaPage media={media} onMediaUpdate={onMediaUpdate} />} />
      <Route path="/series/:id" element={<MediaSeriesPage media={media} onMediaUpdate={onMediaUpdate} />} />
      <Route path="/movie/:id" element={<MediaMoviePage media={media} onMediaUpdate={onMediaUpdate} />} />
      <Route path="/discover/series/:id" element={<MediaSeriesPage media={media} onMediaUpdate={onMediaUpdate} source="discover" />} />
      <Route path="/discover/movie/:id" element={<MediaMoviePage media={media} onMediaUpdate={onMediaUpdate} source="discover" />} />
    </Routes>
  );
}

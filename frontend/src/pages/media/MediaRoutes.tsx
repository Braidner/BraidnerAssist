import { Routes, Route } from "react-router-dom";
import { MediaPage } from "./MediaPage.tsx";
import { MediaSeriesPage } from "./MediaSeriesPage.tsx";
import { MediaMoviePage } from "./MediaMoviePage.tsx";
import type { MediaData } from "../../lib/api.ts";

interface MediaRoutesProps {
  media: MediaData;
  onMediaUpdate: () => void;
}

export function MediaRoutes({ media, onMediaUpdate }: MediaRoutesProps) {
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

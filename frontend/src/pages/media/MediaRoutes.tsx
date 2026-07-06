import { useState, useEffect, useRef } from "react";
import { Routes, Route, useLocation, useNavigate, matchPath } from "react-router-dom";
import { MediaPage } from "./MediaPage.tsx";
import { MediaSeriesPage } from "./MediaSeriesPage.tsx";
import { MediaMoviePage } from "./MediaMoviePage.tsx";
import { MediaGenrePage } from "./MediaGenrePage.tsx";
import { getMedia, type MediaData } from "../../lib/api.ts";

type MediaTab = "library" | "list" | "discover" | "system";

const DEFAULT_MEDIA: MediaData = {
  configured: false,
  torrserver: false,
  tmdb: false,
  nowPlaying: [],
  downloads: [],
};

const tabForPath = (pathname: string): MediaTab | null => {
  if (pathname === "/media" || pathname === "/media/") return "library";
  if (pathname === "/media/list") return "list";
  if (pathname === "/media/discover") return "discover";
  if (pathname === "/media/system") return "system";
  return null;
};

const isDetailPath = (pathname: string) =>
  Boolean(
    matchPath("/media/movie/:id", pathname) ||
      matchPath("/media/series/:id", pathname) ||
      matchPath("/media/jellyfin/movie/:id", pathname) ||
      matchPath("/media/jellyfin/series/:id", pathname) ||
      matchPath("/media/discover/movie/:id", pathname) ||
      matchPath("/media/discover/series/:id", pathname) ||
      matchPath("/media/discover/genre/:kind/:genreId", pathname),
  );

export function MediaRoutes({ allowSystem = true }: { allowSystem?: boolean }) {
  const location = useLocation();
  const nav = useNavigate();
  const [media, setMedia] = useState<MediaData>(DEFAULT_MEDIA);
  const currentTab = tabForPath(location.pathname);
  const [lastTab, setLastTab] = useState<MediaTab>(currentTab ?? "library");
  const [savedScrollY, setSavedScrollY] = useState<number | null>(null);
  const previousPathRef = useRef(location.pathname);
  const latestListScrollYRef = useRef(0);

  const dlActive = media.downloads.some(
    (d) => d.progress < 100 && !/paused|stopped|completed|error/i.test(d.state),
  );

  useEffect(() => {
    getMedia().then(setMedia);
    const t = setInterval(
      () => getMedia().then(setMedia),
      dlActive ? 3_000 : 15_000,
    );
    return () => clearInterval(t);
  }, [dlActive]);

  useEffect(() => {
    if (!allowSystem && location.pathname === "/media/system") {
      nav("/media", { replace: true });
    }
  }, [allowSystem, location.pathname, nav]);

  const onMediaUpdate = () => getMedia().then(setMedia);
  const showingDetail = isDetailPath(location.pathname);

  useEffect(() => {
    if (currentTab) setLastTab(currentTab);
  }, [currentTab]);

  useEffect(() => {
    if (!currentTab) return;
    latestListScrollYRef.current = window.scrollY;
    const rememberScroll = () => {
      latestListScrollYRef.current = window.scrollY;
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => window.removeEventListener("scroll", rememberScroll);
  }, [currentTab]);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    const wasDetail = isDetailPath(previousPath);
    const wasList = Boolean(tabForPath(previousPath));
    const isList = Boolean(currentTab);

    if (wasList && showingDetail) {
      const entryScrollY =
        typeof location.state === "object" &&
        location.state !== null &&
        "scrollY" in location.state &&
        typeof location.state.scrollY === "number"
          ? location.state.scrollY
          : latestListScrollYRef.current;
      setSavedScrollY(entryScrollY);
      requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
    }

    if (wasDetail && isList) {
      const restoredY =
        typeof location.state === "object" &&
        location.state !== null &&
        "scrollY" in location.state &&
        typeof location.state.scrollY === "number"
          ? location.state.scrollY
          : savedScrollY;
      if (restoredY != null) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => window.scrollTo({ top: restoredY, left: 0 }));
        });
      }
    }

    previousPathRef.current = location.pathname;
  }, [currentTab, location.pathname, location.state, savedScrollY, showingDetail]);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  return (
    <>
      <div
        aria-hidden={showingDetail}
        style={{ display: showingDetail ? "none" : "contents" }}
      >
        <MediaPage
          media={media}
          onMediaUpdate={onMediaUpdate}
          tab={!allowSystem && lastTab === "system" ? "library" : lastTab}
          allowSystem={allowSystem}
        />
      </div>

      {showingDetail && (
        <Routes>
          <Route
            path="/series/:id"
            element={
              <MediaSeriesPage media={media} onMediaUpdate={onMediaUpdate} />
            }
          />
          <Route
            path="/movie/:id"
            element={<MediaMoviePage media={media} onMediaUpdate={onMediaUpdate} />}
          />
          <Route
            path="/jellyfin/series/:id"
            element={
              <MediaSeriesPage
                media={media}
                onMediaUpdate={onMediaUpdate}
                source="jellyfin"
              />
            }
          />
          <Route
            path="/jellyfin/movie/:id"
            element={
              <MediaMoviePage
                media={media}
                onMediaUpdate={onMediaUpdate}
                source="jellyfin"
              />
            }
          />
          <Route
            path="/discover/series/:id"
            element={
              <MediaSeriesPage
                media={media}
                onMediaUpdate={onMediaUpdate}
                source="discover"
              />
            }
          />
          <Route
            path="/discover/movie/:id"
            element={
              <MediaMoviePage
                media={media}
                onMediaUpdate={onMediaUpdate}
                source="discover"
              />
            }
          />
          <Route
            path="/discover/genre/:kind/:genreId"
            element={<MediaGenrePage media={media} />}
          />
        </Routes>
      )}
    </>
  );
}

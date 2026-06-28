# Media Play-To + Recommendations Implementation Plan

> **Status:** partially superseded by Batch v8 (2026-06-28). The Jellyfin
> Play-To portions remain useful historical context. The recommendations panel
> and `get_recommendations`/Radarr/Sonarr import-list path were removed; current
> discovery is TMDB-based and current library additions use native `MediaMonitor`
> + Jackett Torznab + qBittorrent `mc-native`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add (1) "play a library title on an external device" via Jellyfin remote control, and (2) a recommendations panel of not-yet-downloaded titles with one-click add into the existing Radarr/Sonarr pipeline.

**Architecture:** Both features extend the existing media module. Backend integration functions in `backend/src/integrations/media.ts`, REST routes in `backend/src/api/index.ts`, MCP tools in `backend/src/mcp/server.ts`. Frontend API helpers in `frontend/src/lib/api.ts`, UI in `frontend/src/components/panels/MediaPage.tsx`. Each source is isolated (`Promise.allSettled` / `try/catch` per route) so a failure never breaks the page; unconfigured sources return `503 {configured:false}`.

**Tech Stack:** Node + Express + TypeScript (backend), React + TS + Vite (frontend), `@modelcontextprotocol/sdk` + zod (MCP). Posters reuse the existing anti-SSRF poster proxy.

**Testing note:** This repo has **no test framework**. Introducing one is out of scope. Each task's verification gate is the TypeScript build (`npm run build` in `backend`/`frontend`), which type-checks the contract between tasks. Functional verification against the live homelab services (Jellyfin/Radarr/Sonarr on hermes.lan) is consolidated in Task 8 — it requires either pointing the dev `.env` at hermes.lan services or deploying.

**Parallelization:** Tasks 1–4 (backend) and Task 5 (frontend api helpers) can run in parallel — they only share the JSON contract defined here, not code. Tasks 6–7 (frontend UI) depend on Task 5. Task 8 (verification) runs after all. Suggested split: one Sonnet agent on Tasks 1–4, one Sonnet agent on Tasks 5–7, then a verification pass.

---

## File Structure

- `backend/src/integrations/media.ts` — **modify**: add `PlayDevice`/`Recommendation` interfaces, `jellyfinSessions()`, `jellyfinPlayTo()`, `getRecommendations()` (+ private `arrImportList()`). Extend the `JfSession` interface with `Id`/`DeviceName`/`SupportsRemoteControl`.
- `backend/src/api/index.ts` — **modify**: add routes `GET /media/devices`, `POST /media/play-to`, `GET /media/recommendations`; extend the media import line.
- `backend/src/mcp/server.ts` — **modify**: add tools `list_devices`, `play_on_device`, `get_recommendations`; extend the media import line.
- `frontend/src/lib/api.ts` — **modify**: add `PlayDevice`/`Recommendation` types + `getMediaDevices()`, `playOnDevice()`, `getRecommendations()`.
- `frontend/src/components/panels/MediaPage.tsx` — **modify**: add a "cast" control on each library tile, and a "Подборки" recommendations Card.
- `frontend/src/styles.css` — **modify**: small classes for the cast control/menu and the recommendation add button.
- `CLAUDE.md` — **modify**: update module 11 description + MCP tool list.

---

## Contract (shared JSON shapes — both agents code against these)

```ts
// Jellyfin controllable device
interface PlayDevice { id: string; deviceName: string; client: string; nowPlaying: string | null; }

// GET /api/media/devices            -> PlayDevice[]
// POST /api/media/play-to {sessionId, itemId} -> { ok: true }

// Recommendation (id = tmdbId for movie / tvdbId for series — same id arrAdd takes)
interface Recommendation { kind: "movie" | "series"; id: number; title: string; year: number | null; overview: string; poster: string | null; }

// GET /api/media/recommendations    -> Recommendation[]
// Add reuses existing POST /api/media/add { type, id }
```

---

## Task 1: Backend — Jellyfin sessions + play-to

**Files:**
- Modify: `backend/src/integrations/media.ts` (extend `JfSession` ~line 54; add new exports after `jellyfinRefresh` ~line 199)

- [ ] **Step 1: Extend the `JfSession` interface** with the fields needed for remote control. Replace the existing interface (currently lines ~54–64):

```ts
interface JfSession {
  Id?: string;
  DeviceName?: string;
  SupportsRemoteControl?: boolean;
  UserName?: string;
  Client?: string;
  NowPlayingItem?: {
    Name?: string;
    SeriesName?: string;
    Type?: string;
    RunTimeTicks?: number;
  };
  PlayState?: { PositionTicks?: number };
}
```

- [ ] **Step 2: Add the `PlayDevice` interface** near the other exported interfaces (after `interface SearchResult { ... }`, ~line 49):

```ts
export interface PlayDevice {
  id: string;
  deviceName: string;
  client: string;
  nowPlaying: string | null;
}
```

- [ ] **Step 3: Add `jellyfinSessions()` and `jellyfinPlayTo()`** right after `jellyfinRefresh()` (~line 199):

```ts
// Сессии Jellyfin, которыми можно дистанционно управлять (приложение Jellyfin
// открыто на устройстве и поддерживает remote-control). Цели для «играть на ТВ».
export async function jellyfinSessions(): Promise<PlayDevice[]> {
  if (!config.media.jellyfin.configured) return [];
  const res = await fetch(`${config.media.jellyfin.url}/Sessions`, {
    headers: jfHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Jellyfin /Sessions responded ${res.status}`);
  const sessions = (await res.json()) as JfSession[];
  return sessions
    .filter((s) => s.SupportsRemoteControl && s.Id && s.DeviceName)
    .map((s) => ({
      id: s.Id!,
      deviceName: s.DeviceName!,
      client: s.Client ?? "—",
      nowPlaying: s.NowPlayingItem?.Name ?? null,
    }));
}

// Отправить элемент на устройство: PlayNow в указанную сессию.
export async function jellyfinPlayTo(sessionId: string, itemId: string): Promise<void> {
  if (!config.media.jellyfin.configured) throw new Error("Jellyfin не настроен");
  const url = new URL(`${config.media.jellyfin.url}/Sessions/${sessionId}/Playing`);
  url.searchParams.set("playCommand", "PlayNow");
  url.searchParams.set("itemIds", itemId);
  const res = await fetch(url, {
    method: "POST",
    headers: jfHeaders(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok && res.status !== 204) throw new Error(`Jellyfin Playing responded ${res.status}`);
}
```

- [ ] **Step 4: Type-check** — Run: `cd backend && npm run build`. Expected: PASS (no TS errors).

- [ ] **Step 5: Commit**

```bash
git add backend/src/integrations/media.ts
git commit -m "feat(media): jellyfin sessions + play-to (remote control)"
```

---

## Task 2: Backend — recommendations from *arr import lists

**Files:**
- Modify: `backend/src/integrations/media.ts` (add after `arrAdd`, ~line 602, before the `getMedia` summary)

- [ ] **Step 1: Add the `Recommendation` interface** near the other exported interfaces (after `PlayDevice` from Task 1):

```ts
export interface Recommendation {
  kind: "movie" | "series";
  id: number; // tmdbId (movie) | tvdbId (series) — то, что принимает arrAdd
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
}
```

- [ ] **Step 2: Add the import-list reader + aggregator** after `arrAdd()` (~line 602). Reuses existing `arrCfg()` and `arrPoster()` helpers:

```ts
// ── Подборки (discover) из import-list'ов Radarr/Sonarr ─────────────────────
// Radarr GET /api/v3/importlist/movie и Sonarr /api/v3/importlist/series отдают
// тайтлы из настроенных import-list'ов с флагами isExisting/isExcluded. Ключ TMDB
// не нужен — discover живёт внутри *arr. Предусловие: включён хотя бы один список.
interface ArrImportListRecord {
  title?: string;
  year?: number;
  tmdbId?: number;
  tvdbId?: number;
  overview?: string;
  images?: ArrImage[];
  isExisting?: boolean;
  isExcluded?: boolean;
}

async function arrImportList(kind: "movie" | "series"): Promise<Recommendation[]> {
  const cfg = arrCfg(kind);
  if (!cfg.configured) return [];
  const path = kind === "movie" ? "movie" : "series";
  const res = await fetch(`${cfg.url}/api/v3/importlist/${path}`, {
    headers: { "X-Api-Key": cfg.apiKey! },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${kind} importlist ${res.status}`);
  const items = (await res.json()) as ArrImportListRecord[];
  return items
    .filter((it) => !it.isExisting && !it.isExcluded)
    .map((it) => ({
      kind,
      id: (kind === "movie" ? it.tmdbId : it.tvdbId) ?? 0,
      title: it.title ?? "—",
      year: it.year ?? null,
      overview: it.overview ?? "",
      poster: arrPoster(it.images),
    }))
    .filter((r) => r.id > 0);
}

// Подборки фильмов+сериалов, которых ещё нет в библиотеке.
export async function getRecommendations(): Promise<Recommendation[]> {
  if (!config.media.radarr.configured && !config.media.sonarr.configured) return [];
  const [movies, series] = await Promise.allSettled([
    arrImportList("movie"),
    arrImportList("series"),
  ]);
  const all = [
    ...(movies.status === "fulfilled" ? movies.value : []),
    ...(series.status === "fulfilled" ? series.value : []),
  ];
  const seen = new Set<string>();
  const deduped = all.filter((r) => {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.slice(0, 40);
}
```

- [ ] **Step 3: Type-check** — Run: `cd backend && npm run build`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/integrations/media.ts
git commit -m "feat(media): recommendations from Radarr/Sonarr import lists"
```

---

## Task 3: Backend — REST routes

**Files:**
- Modify: `backend/src/api/index.ts` (import line ending ~line 24; add routes after the `POST /media/add` route ~line 334)

- [ ] **Step 1: Extend the media import.** Find the import block that ends with `} from "../integrations/media.js";` (~line 24) and add the three new names to it:

```ts
  jellyfinSessions,
  jellyfinPlayTo,
  getRecommendations,
```

(Add these alongside the existing imported names like `getMedia`, `arrLookup`, `arrAdd`, etc. — inside the same `{ ... } from "../integrations/media.js"` braces.)

- [ ] **Step 2: Add the three routes** immediately after the `POST /media/add` route (~line 334):

```ts
// Устройства Jellyfin, которыми можно управлять (цели для «играть на ТВ»).
apiRouter.get("/media/devices", async (_req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  try {
    res.json(await jellyfinSessions());
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Отправить элемент библиотеки на устройство Jellyfin.
apiRouter.post("/media/play-to", async (req, res) => {
  if (!config.media.jellyfin.configured) return res.status(503).json({ configured: false });
  const sessionId = String(req.body?.sessionId ?? "").trim();
  const itemId = String(req.body?.itemId ?? "").trim();
  if (!sessionId || !itemId) return res.status(400).json({ error: "sessionId and itemId required" });
  try {
    await jellyfinPlayTo(sessionId, itemId);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

// Подборки (ещё не в библиотеке) из import-list'ов Radarr/Sonarr.
apiRouter.get("/media/recommendations", async (_req, res) => {
  if (!config.media.radarr.configured && !config.media.sonarr.configured) {
    return res.status(503).json({ configured: false });
  }
  try {
    res.json(await getRecommendations());
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});
```

- [ ] **Step 3: Type-check** — Run: `cd backend && npm run build`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/index.ts
git commit -m "feat(media): REST routes for devices, play-to, recommendations"
```

---

## Task 4: Backend — MCP tools for Hermes

**Files:**
- Modify: `backend/src/mcp/server.ts` (import line ~line 10; add tools after the `add_series` tool ~line 259)

- [ ] **Step 1: Extend the media import** (~line 10). Change:

```ts
import { getMedia, qbAdd, arrLookup, arrAdd } from "../integrations/media.js";
```

to:

```ts
import { getMedia, qbAdd, arrLookup, arrAdd, jellyfinSessions, jellyfinPlayTo, getRecommendations } from "../integrations/media.js";
```

- [ ] **Step 2: Add the three tools** after the `add_series` tool (~line 259, before the closing of the registration block):

```ts
  server.tool(
    "list_devices",
    "List Jellyfin devices that can be remotely controlled (the Jellyfin app must be open on the device). Use to find a target for play_on_device.",
    async () => {
      const devices = await jellyfinSessions();
      return ok(devices);
    },
  );

  server.tool(
    "play_on_device",
    "Play a library item on an external device (e.g. the TV). itemId is a Jellyfin item id (from get_media_status / the library); deviceName is matched case-insensitively against list_devices. The Jellyfin app must be open on the target device.",
    { itemId: z.string(), deviceName: z.string() },
    async ({ itemId, deviceName }) => {
      const devices = await jellyfinSessions();
      const target = devices.find((d) => d.deviceName.toLowerCase() === deviceName.toLowerCase());
      if (!target) {
        return ok({ ok: false, error: `Устройство "${deviceName}" не найдено`, available: devices.map((d) => d.deviceName) });
      }
      await jellyfinPlayTo(target.id, itemId);
      return ok({ ok: true, device: target.deviceName });
    },
  );

  server.tool(
    "get_recommendations",
    "Get movie/series recommendations not yet in the library (from Radarr/Sonarr import lists). Add a title with add_movie/add_series.",
    async () => {
      const items = await getRecommendations();
      return ok(items);
    },
  );
```

- [ ] **Step 3: Type-check** — Run: `cd backend && npm run build`. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/mcp/server.ts
git commit -m "feat(mcp): list_devices, play_on_device, get_recommendations"
```

---

## Task 5: Frontend — API helpers

**Files:**
- Modify: `frontend/src/lib/api.ts` (add after `addTitle` ~line 700, or any clear spot in the media section)

- [ ] **Step 1: Add types + helpers** in the media section:

```ts
export interface PlayDevice {
  id: string;
  deviceName: string;
  client: string;
  nowPlaying: string | null;
}

export async function getMediaDevices(): Promise<PlayDevice[]> {
  try {
    const res = await apiFetch("/api/media/devices");
    if (!res.ok) return [];
    return (await res.json()) as PlayDevice[];
  } catch {
    return [];
  }
}

export async function playOnDevice(sessionId: string, itemId: string): Promise<boolean> {
  try {
    const res = await apiFetch("/api/media/play-to", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, itemId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface Recommendation {
  kind: "movie" | "series";
  id: number;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
}

export async function getRecommendations(): Promise<Recommendation[]> {
  try {
    const res = await apiFetch("/api/media/recommendations");
    if (!res.ok) return [];
    return (await res.json()) as Recommendation[];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Type-check** — Run: `cd frontend && npm run build`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(media): frontend api helpers for devices + recommendations"
```

---

## Task 6: Frontend — "Play on device" control on library tiles

**Files:**
- Modify: `frontend/src/components/panels/MediaPage.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Extend the media imports** at the top of `MediaPage.tsx`. The existing import (lines ~9–12) pulls from the api module. Add `getMediaDevices, playOnDevice` to the function imports and `PlayDevice` to the type imports. Result:

```ts
import {
  getMediaLibrary, getMediaPlayUrl, searchReleases, addTorrent, torrentAction, refreshJellyfin,
  lookupTitle, addTitle, posterUrl, jellyfinPosterUrl, getMediaDevices, playOnDevice, getRecommendations,
  type MediaData, type DownloadItem, type LibraryItem, type SearchResult, type ArrLookupItem,
  type PlayDevice, type Recommendation,
} from "../../lib/api";
```

(`getRecommendations` and `Recommendation` are used in Task 7 — adding them here keeps a single import edit.)

- [ ] **Step 2: Add state + loader** inside `MediaPage`, after the existing `useState`/`useEffect` block (~line 271–275):

```ts
  const [devices, setDevices] = useState<PlayDevice[]>([]);
  const [castFor, setCastFor] = useState<string | null>(null);

  useEffect(() => {
    if (media.configured) getMediaDevices().then(setDevices);
  }, [media.configured]);
```

- [ ] **Step 3: Add the cast handler** alongside the other handlers (after `onPlay`, ~line 294):

```ts
  const onCast = async (item: LibraryItem, device: PlayDevice) => {
    setBusy("cast" + item.id);
    await playOnDevice(device.id, item.id);
    setBusy(null);
    setCastFor(null);
  };
```

- [ ] **Step 4: Wrap each library tile** to host the cast control. Replace the library map body (the `<button key={it.id} className="neu media-item" ...> ... </button>` block, ~lines 362–384) with a wrapper containing the play button plus the cast menu:

```tsx
                {library.map((it) => (
                  <div key={it.id} className="media-item-wrap">
                    <button
                      className="neu media-item"
                      disabled={busy === it.id}
                      onClick={() => onPlay(it)}
                      title={it.seriesName ? `${it.seriesName} — ${it.name}` : it.name}
                    >
                      <img
                        className="media-item-poster"
                        src={jellyfinPosterUrl(it.id)}
                        alt=""
                        loading="lazy"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                      <span className="media-item-name">{it.seriesName ? `${it.seriesName} — ${it.name}` : it.name}</span>
                      <span className="media-item-meta mono">
                        {it.type === "Episode" ? "эпизод" : it.type === "Movie" ? "фильм" : it.type}
                        {it.year ? ` · ${it.year}` : ""}
                      </span>
                      <span className="media-item-play">{busy === it.id ? "…" : "▶"}</span>
                    </button>
                    {devices.length > 0 && (
                      <div className="media-cast">
                        <button
                          className="btn btn-icon btn-sm media-cast-btn"
                          title="Играть на устройстве"
                          onClick={() => setCastFor(castFor === it.id ? null : it.id)}
                        >
                          📺
                        </button>
                        {castFor === it.id && (
                          <div className="media-cast-menu neu">
                            {devices.map((d) => (
                              <button
                                key={d.id}
                                className="media-cast-item"
                                disabled={busy === "cast" + it.id}
                                onClick={() => onCast(it, d)}
                              >
                                {d.deviceName}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
```

- [ ] **Step 5: Add CSS** to `frontend/src/styles.css` (append near the other `.media-item` rules — search for `.media-item` to find them):

```css
.media-item-wrap { position: relative; }
.media-cast { position: absolute; top: 8px; right: 8px; z-index: 2; }
.media-cast-btn { padding: 2px 6px; line-height: 1; }
.media-cast-menu {
  position: absolute;
  top: 30px;
  right: 0;
  min-width: 140px;
  padding: 6px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 10;
}
.media-cast-item {
  text-align: left;
  background: none;
  border: none;
  color: var(--fg);
  font: inherit;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.media-cast-item:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); }
.media-cast-item:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 6: Type-check + build** — Run: `cd frontend && npm run build`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/panels/MediaPage.tsx frontend/src/styles.css
git commit -m "feat(media): play-on-device control on library tiles"
```

---

## Task 7: Frontend — Recommendations panel

**Files:**
- Modify: `frontend/src/components/panels/MediaPage.tsx`

(Imports for `getRecommendations` / `Recommendation` were already added in Task 6 Step 1. If Task 7 runs before Task 6, add them per Task 6 Step 1.)

- [ ] **Step 1: Add state + loader** next to the other media loaders (after the devices loader from Task 6, or after the library loader ~line 275):

```ts
  const [recs, setRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    if (media.configured) getRecommendations().then(setRecs);
  }, [media.configured]);
```

- [ ] **Step 2: Add the add-recommendation handler** alongside the other handlers (after `onAddTitle`, ~line 309):

```ts
  const onAddRec = async (rec: Recommendation) => {
    const key = "rec" + rec.kind + rec.id;
    setBusy(key);
    const okAdd = await addTitle(rec.kind, rec.id);
    setBusy(null);
    if (okAdd) {
      setRecs((prev) => prev.filter((r) => !(r.kind === rec.kind && r.id === rec.id)));
      onMediaUpdate();
    }
  };
```

- [ ] **Step 3: Render the "Подборки" Card** in the main column, immediately after the closing `</Card>` of the Библиотека card (~line 387, still inside `<div className="page-col-main">`):

```tsx
          {/* Подборки — ещё не в библиотеке */}
          {recs.length > 0 && (
            <Card icon="pulse" title="Подборки" action={<span className="panel-count">{recs.length}</span>}>
              <div className="media-grid">
                {recs.map((r) => {
                  const key = "rec" + r.kind + r.id;
                  return (
                    <div key={key} className="neu media-item">
                      {r.poster ? (
                        <img
                          className="media-item-poster"
                          src={posterUrl(r.poster)}
                          alt=""
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <span className="media-item-poster lk-poster-ph">{r.kind === "movie" ? "🎬" : "📺"}</span>
                      )}
                      <span className="media-item-name">{r.title}</span>
                      <span className="media-item-meta mono">
                        {r.kind === "movie" ? "фильм" : "сериал"}{r.year ? ` · ${r.year}` : ""}
                      </span>
                      <button
                        className="btn btn-sm btn-accent media-item-add"
                        disabled={busy === key}
                        onClick={() => onAddRec(r)}
                      >
                        {busy === key ? "…" : "+ Добавить"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
```

- [ ] **Step 4: Add CSS** for the add button to `frontend/src/styles.css` (near the `.media-item` rules):

```css
.media-item-add { margin-top: 6px; width: 100%; }
```

- [ ] **Step 5: Type-check + build** — Run: `cd frontend && npm run build`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/panels/MediaPage.tsx frontend/src/styles.css
git commit -m "feat(media): recommendations panel with one-click add"
```

---

## Task 8: Verification (functional, against live services)

This repo has no automated tests; this task verifies behavior against the real homelab services. The backend talks to Jellyfin/Radarr/Sonarr via the server `.env` (`host.docker.internal:<port>` on hermes.lan). On a dev machine these are usually unconfigured, so functional checks require either (a) pointing the dev `backend/.env` at the hermes.lan service URLs/keys, or (b) deploying.

**Prerequisites to confirm with the user before functional checks:**
- At least one **import list** is enabled in Radarr and/or Sonarr (e.g. "TMDB Popular", "Trakt Trending") — otherwise `/api/media/recommendations` is correctly empty and the panel won't render.
- The **Jellyfin app is open on the Sber TV** (or another device) — otherwise `/api/media/devices` is correctly empty and the cast control won't render.

- [ ] **Step 1: Both builds pass** — Run: `cd backend && npm run build && cd ../frontend && npm run build`. Expected: PASS for both.

- [ ] **Step 2: Confirm the *arr import-list contract** (the field names flagged in the spec). With backend env pointed at the real services, run against the real Radarr/Sonarr (replace host/key):

```bash
curl -s -H "X-Api-Key: $RADARR_KEY" "$RADARR_URL/api/v3/importlist/movie" | head -c 800
curl -s -H "X-Api-Key: $SONARR_KEY" "$SONARR_URL/api/v3/importlist/series" | head -c 800
```

Expected: a JSON array of objects each containing `title`, `year`, `tmdbId` (Radarr) / `tvdbId` (Sonarr), `images`, and the `isExisting`/`isExcluded` booleans. **If field names differ** (e.g. Sonarr uses a different path or flag), update `arrImportList()` in Task 2 accordingly and rebuild.

- [ ] **Step 3: Start the dev servers and verify in the browser** (use preview tools). Backend: `cd backend && npm run dev`; frontend: `cd frontend && npm run dev` (port 3000). Open `/media` and check:
  - The **Подборки** Card renders with posters and "+ Добавить" buttons (if an import list is configured).
  - Library tiles show the **📺 cast** control (if a device session is active); clicking it lists devices.

- [ ] **Step 4: Exercise the endpoints** (with dev backend running, app JWT in `$TOKEN`):

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/media/devices
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/media/recommendations | head -c 600
```

Expected: `devices` → array (possibly empty); `recommendations` → array of `Recommendation`. Unconfigured → `503 {configured:false}`.

- [ ] **Step 5: End-to-end happy paths** (requires live services + open Jellyfin app on TV):
  - Click "+ Добавить" on a recommendation → title disappears from the panel, appears shortly in the Radarr/Sonarr queue (Загрузки card / `get_media_status`).
  - Click 📺 on a library tile → pick the TV → playback starts on the TV.

- [ ] **Step 6: Deploy** (only with explicit user go-ahead — this touches the shared hermes.lan host). Per `CLAUDE.md`: push to `main` triggers the GHCR image build; then on the server `git pull && IMAGE_TAG=latest docker compose -f docker-compose.prod.yml pull && ... up -d`. Re-run Steps 4–5 against hermes.lan.

---

## Task 9: Docs

**Files:**
- Modify: `CLAUDE.md` (module 11 "Медиа-стек" section + MCP tool list)

- [ ] **Step 1: Update module 11** to mention: "Играть на устройство" (`GET /media/devices`, `POST /media/play-to` via Jellyfin `/Sessions/{id}/Playing`) and the recommendations panel (`GET /media/recommendations` from Radarr/Sonarr `/api/v3/importlist/*`, one-click add via existing `POST /media/add`). Add the new MCP tools `list_devices`/`play_on_device`/`get_recommendations` to the tool list. Note the two prerequisites (import list enabled; Jellyfin app open on the target device).

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: media Play-To + recommendations (module 11)"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** Feature 1 (devices/play-to) → Tasks 1, 3, 4, 6. Feature 2 (recommendations) → Tasks 2, 3, 4, 7. MCP tools → Task 4. Frontend → Tasks 5–7. Isolation/`allSettled`/`503` pattern → carried in Tasks 1–3. Poster proxy reuse → Tasks 6–7 use `posterUrl`/`jellyfinPosterUrl`. Spec's two flagged uncertainties (import-list field names; `itemIds` format) → Task 8 Steps 2 & 4. No new env vars → honored. All covered.
- **Placeholder scan:** No TBD/TODO; every code step has full code; every command has expected output.
- **Type consistency:** `PlayDevice { id, deviceName, client, nowPlaying }` and `Recommendation { kind, id, title, year, overview, poster }` are identical across backend (Tasks 1–2), routes (Task 3), MCP (Task 4) and frontend (Task 5). Route paths `/media/devices`, `/media/play-to`, `/media/recommendations` consistent between Tasks 3 and 5. `arrAdd` reuse via existing `POST /media/add` (no new add route) consistent in Tasks 2/7.

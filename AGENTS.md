# Mission Control — Personal Life Dashboard

Персональный центр управления жизнью. Локальный self-hosted дашборд на Ubuntu
Desktop (Proxmox VM). Используется человеком И AI-агентом **Hermes** (Codex-based),
который читает данные и управляет задачами через MCP/REST API.

## Стек

- **Frontend**: React + TypeScript + Vite, nginx в проде
- **Backend**: Node.js + Express + TypeScript
- **БД**: SQLite через Prisma ORM (локальные задачи, логи агента, кеш)
- **MCP**: `@modelcontextprotocol/sdk` — транспорты stdio + Streamable HTTP (НЕ SSE)
- **Деплой**: Docker Compose, доступ только в LAN

## Структура

```
mission-control/
├── frontend/          # React + TS + Vite
├── backend/
│   ├── src/
│   │   ├── api/           # REST endpoints
│   │   ├── mcp/           # MCP server для Hermes
│   │   ├── integrations/  # GitLab, HomeAssistant, Weather, Services, Proxmox
│   │   ├── db/            # Prisma client
│   │   └── index.ts
│   └── prisma/schema.prisma
├── docker-compose.yml
├── .env.example
├── AGENTS.md
└── TASKS.md
```

## Порты

- backend: **3001** (REST API + MCP Streamable HTTP)
- frontend: **3000** (nginx → 80 в контейнере)
- НЕ использовать один общий `PORT` — будет конфликт.

## Ключевые принципы (из ТЗ)

1. **Все интеграции опциональны** — если env-переменная не задана, виджет показывает
   "Not configured" без ошибок. Каждая интеграция изолирована.
2. **Ошибки интеграций не ломают дашборд** — каждый виджет изолирован, ошибки локальны.
3. **Polling интервалы** настраиваются через env (сервисы 60с, погода 30мин, задачи 5мин).
4. **Логи Hermes** хранятся в SQLite, не в файлах (для запроса через MCP).
5. **MCP**: транспорты stdio + Streamable HTTP. SSE — deprecated, НЕ использовать.
6. **Безопасность**: bearer-токен `MCP_TOKEN` + валидация `Origin` header на Streamable
   HTTP (защита от DNS-rebinding — требование спеки MCP).
7. **Секреты** только в `.env` (в `.gitignore`). В репо — только `.env.example`.

## Команды

```bash
# Backend
cd backend && npm install
npx prisma migrate dev          # миграции
npx prisma generate             # клиент
npm run dev                     # dev-сервер (tsx watch)
npm run build && npm start      # прод

# Frontend
cd frontend && npm install
npm run dev                     # vite dev (порт 3000)
npm run build                   # прод-сборка

# Всё вместе (локальная сборка)
docker compose up --build
```

## Деплой (GHCR + сервер hermes.lan)

CI (`.github/workflows/build.yml`) на push в main / тег `v*` собирает образы
`ghcr.io/braidner/braidnerassist-{backend,frontend}` и пушит в GHCR (публичные).

На сервере (`~/mission-control`, доступ по SSH-ключу `braidner@hermes.lan`):

```bash
cd ~/mission-control && git pull
IMAGE_TAG=latest docker compose -f docker-compose.prod.yml pull
IMAGE_TAG=latest docker compose -f docker-compose.prod.yml up -d
```

`docker-compose.yml` (с `build:`) — для локальной разработки;
`docker-compose.prod.yml` (с `image:` из GHCR) — для сервера.
`.env` создаётся на сервере из `.env.example` (в гит не коммитится).

### Временный внешний доступ через CloudPub

CloudPub запускается как сервис `cloudpub` в `docker-compose.yml` и
`docker-compose.prod.yml`. Публикуем **frontend** (`frontend:80`); nginx сам проксирует
`/api` на backend. Токен хранится только в `.env` как `CLOUDPUB_TOKEN`. Перед публикацией
убедиться, что первый admin уже создан, иначе публичный setup-экран позволит создать
администратора.

```bash
# start / update
ssh braidner@hermes.lan 'cd ~/mission-control && IMAGE_TAG=latest docker compose -f docker-compose.prod.yml up -d cloudpub'

# logs / public URL
ssh braidner@hermes.lan 'cd ~/mission-control && docker compose -f docker-compose.prod.yml logs -f cloudpub'

# stop tunnel
ssh braidner@hermes.lan 'cd ~/mission-control && docker compose -f docker-compose.prod.yml stop cloudpub'
```

## Модули (виджеты)

1. **Tasks Hub** — GitLab issues/MRs + локальные задачи (SQLite), CRUD, клик → drawer с деталями.
2. **Homelab Services** — статус сервисов (ping/HTTP healthcheck), из `/data/services.json`.
3. **Home Assistant** — автоматизации (list/toggle), реальные данные через REST HA API.
4. **Weather** — Open-Meteo (без ключа), текущая + прогноз 3 дня.
5. **Proxmox** — статус ноды (cpu/ram/disk) + виртуалки (QEMU+LXC, cpu/ram/статус) через
   PVE REST API. API-токен `PVEAPIToken=user@realm!id=secret`, self-signed TLS (undici Agent).
   Env: `PROXMOX_URL`/`PROXMOX_TOKEN`/`PROXMOX_NODE`. Отображается в StatStrip (не отдельная панель).
6. **Hermes Agent** — **локальная MCP→SQLite модель** (НЕ Nous session API; `HERMES_URL`/
   `HERMES_API_KEY` в коде НЕ используются). Hermes пишет статус/лог/задачи в SQLite через
   MCP-инструменты (`report_status`, `log_action`, `claim_task`, `complete_task`…), а UI читает
   их по REST (`/api/hermes/status|log|tasks|commands`). Командная очередь замкнута end-to-end:
   `POST /api/hermes/command` (+ кнопка «Передать Hermes» в drawer) → `AgentTask(queued)` →
   MCP `get_agent_queue`. Deep-страница `/hermes` (`HermesPage.tsx`): статус + фид + консоль.
7. **Service uptime → `/metrics`** — сэмплер (`backend/src/sampler.ts`) раз в `POLL_SERVICES`
   пишет пинги сервисов в SQLite (`ServiceCheck`, прунинг >7 дней); `GET /api/metrics/uptime`
   агрегирует uptime 24ч/7д + латентность; `MetricsPage.tsx` рисует спарклайны.
8. **Docker** (opt-in `DOCKER_SOCKET`) — `integrations/docker.ts` через unix-сокет (undici
   `Client` с `socketPath`). `GET /api/docker/containers` + `POST /api/docker/containers/:id/:action`
   (whitelist start|stop|restart) + MCP `restart_container` (Hermes сам чинит сервис). Карточка
   на `/system`. Доступ к docker.sock = root-эквивалент — монтировать осознанно (rw, LAN-only).
9. **Нотификации** (opt-in `NTFY_URL`) — `integrations/notify.ts` шлёт ntfy-пуш при переходе
   агента в `error` (хук в MCP `report_status`). Env не задан → no-op.
10. **AdGuard DNS** (opt-in `ADGUARD_URL`/`ADGUARD_USER`/`ADGUARD_PASSWORD`) — `integrations/
    adguard.ts` (basic auth → `/control/stats`). `GET /api/adguard` отдаёт запросы/блокировки/%/
    латентность + топ заблокированных. Карточка на `/system` (Ring по % блокировок).
11. **Медиа-стек** (opt-in, любой из источников) — текущий основной путь (**Batch v9,
    2026-06-30**) максимально простой: TMDB (метаданные/discovery) → Jackett Torznab
    (`integrations/jackett.ts`, `JACKETT_URL`/`JACKETT_API_KEY`/`JACKETT_INDEXERS`) →
    release parse/score (`releaseParse.ts`/`releaseScore.ts`) → qBittorrent →
    Jellyfin library folders (qB savePath = `QBITTORRENT_SAVE_ROOT` + `MEDIA_MOVIES|MEDIA_TV` +
    canonical provider-id folder, e.g. `/data/tv/Creature Commandos (2024) [tmdbid-219543] [tvdbid-430518]`;
    backend/Jellyfin path = `MEDIA_ROOT`, default `/media`) → Jellyfin scan/playback/watch-state.
    Sonarr/Radarr/Prowlarr, native monitor/missing queue, quality profiles, Repair Center,
    importer, hardlink/copy organizer and per-file picker are not part of the active pipeline.
    qB saves the selected release directly into the final Jellyfin folder; Jellyfin is trusted
    to catalogue movies/series.
    **Lightweight registry**: SQLite keeps only `MediaTitle` (kind, TMDB/TVDB metadata,
    optional `jellyfinId`) and `MediaTorrent` (infohash/release/savePath/qB snapshot) to power
    the library rail "Скачивается / Скоро в библиотеке" and link `TMDB → torrent → Jellyfin`.
    This registry is not a monitor and does not search for missing episodes. Empty accidental
    registry titles can be removed from Library via `DELETE /api/media/titles/:kind/:tmdbId`,
    but only while there is no `jellyfinId` and no `MediaTorrent`; this never deletes Jellyfin
    media files or qBittorrent content.
    **Discovery preferences survive cleanup**: `MediaPreference` remains the source of truth for
    `watchlist|hidden|liked|disliked`; endpoints `GET/POST/DELETE /api/media/preferences` stay
    active, Discovery rails filter hidden/disliked, and Cmd-K "Мой список" reads watchlist.
    Batch v10 makes preferences user-aware via `appUserId` with `global` fallback.
    **Active media REST**: `GET /api/media` (qB downloads), `GET /api/media/library`,
    `GET /api/media/torrent-rail`, `GET /api/media/search` (Jackett fallback),
    `GET /api/media/lookup`, `POST /api/media/add` (lookup/registry compatibility),
    `DELETE /api/media/titles/:kind/:tmdbId` (empty registry-title only),
    `POST /api/media/release/search`, `POST /api/media/release/grab`, `POST /api/media/torrent`,
    `POST /api/media/torrent/:hash/:action`, `POST /api/media/scan`, Jellyfin playback/detail/
    devices/play-to routes, and Discovery routes. Removed active endpoints include
    quality-profiles, repair, monitor, calendar, import candidates/execute and torrent picker.
    **Hermes MCP active media tools**: `search_releases`, `grab_release`, `get_media_status`,
    `add_torrent`, `list_jackett_indexers`, `test_jackett_search`, discovery preference tools,
    `list_devices`, `play_on_device`, `watch_now`. Removed monitor/import tools:
    `add_movie`, `add_series`, `list_import_candidates`, `import_release`, `list_media_monitor`,
    `search_missing_media`, `retry_media_import`, `explain_release_choice`, quality-profile tools.
    `GET /api/media`, страница `/media` (`MediaPage.tsx`) + пункт в Sidebar.
    **Встроенный плеер**: библиотека Jellyfin (`GET /media/library`) → клик → HTML5 video
    с HLS (`hls.js`); путь воспроизведения форсит HLS-транскод (пустые DirectPlayProfiles в
    DeviceProfile, `GET /media/play/:id`). **Группировка библиотеки**: `GET /media/library` отдаёт
    сгруппированный каталог — плитки `Series` (с `tvdbId`/`childCount`) и `Movie` (раздельные запросы
    Jellyfin `/Items?IncludeItemTypes=Series|Movie`, без плоских эпизодов), сериалы идут первыми.
    **Детальные страницы**: клик по плитке ведёт на отдельную роутовую страницу
    `/media/series/:id` (`MediaSeriesPage`) или `/media/movie/:id` (`MediaMoviePage`), `:id` = Jellyfin item id
    (React Router v6, BrowserRouter + nginx SPA-fallback). Данные — merge `GET /media/detail/{series|movie}/:id`
    (`getSeriesPageDetail`/`getMoviePageDetail`): TMDB/Jellyfin metadata + Jellyfin playback state.
    Для discovery-страниц без Jellyfin item id используются native detail routes по `tmdbId`/`tvdbId`.
    На странице: cinematic hero-player:
    клик «Смотреть» запускает HLS-видео прямо в hero-фоне (без модалки), без дополнительного затемнения после
    старта. Из медиабиблиотеки кнопка «Смотреть» и ряд «Продолжить просмотр» открывают detail-route с query
    `?autoplay=1&play=<jellyfinId>&title=...`; старый модальный плеер для resume удалён. Если браузер блокирует
    autoplay со звуком, HLS стартует muted, а в player chrome есть кнопка включения звука. Постер/описание/title-meta
    и нижняя панель (play/pause, seek, mute, stop, fullscreen) являются единым
    player chrome: после idle они синхронно уезжают вниз/исчезают и возвращаются на mouse/touch. Fullscreen
    вызывается через `requestFullscreen` на hero-контейнере. Горячие клавиши активны только при запущенном
    hero-плеере и не перехватывают поля ввода: пробел play/pause, ←/→ перемотка на 15 сек, Esc stop.
    Для сериалов `MediaSeriesPage` строит frontend-очередь из доступных Jellyfin-эпизодов (`jellyfinId`),
    показывает prev/next в player chrome, автозапускает следующую доступную серию по `ended`, а основная
    кнопка «Смотреть» выбирает первый непосмотренный эпизод (`Смотреть с SxEy`/`Продолжить с SxEy`) или
    первую доступную серию, если всё просмотрено. Также есть `ReleasePicker`
    на сезон/фильм (поиск+grab через Jackett/qB) и игра на устройство (фильм).
    Старый `SeriesDrawer` удалён; общие detail-компоненты (`DetailTopBar`/`DetailHero`/`DetailBody`/
    `DetailStatusBadges`/`SimilarRail`) вынесены в
    `frontend/src/pages/media/shared/mediaDetail.tsx`; HLS/modal/TorrServer player, `ReleasePicker`
    и форматтеры — в `frontend/src/pages/media/shared/mediaShared.tsx`.
    (`GET /media/series/:id` — Jellyfin-only seasons — остаётся для обратной
    совместимости.) Стрим идёт через бэкенд-реверс-прокси
    `ALL /api/media/jellyfin/*` — токен Jellyfin инжектится заголовком и НЕ утекает в браузер;
    `.m3u8` переписывается (вырезается `api_key`), hls.js `xhrSetup` цепляет JWT приложения.
    **Постер-прокси и кэш** (`api/poster.ts`, `GET /api/poster?url=<tmdb>|jf=<id>`):
    `<img>` не может слать bearer → маршрут вынесен из-под `jwtAuth` (публичный, LAN-only), но
    жёстко ограничен анти-SSRF (только `image.tmdb.org`, `artworks.thetvdb.com`,
    `kinozal.tv/i/poster` или Jellyfin по hex-id с инжектом токена). Бэкенд ходит за
    TMDB/TVDB/Jellyfin сам и хранит disk cache в `/data/poster-cache`
    (`integrations/posterCache.ts`, sidecar metadata, LRU cleanup, stale/fresh HIT,
    `GET/DELETE /api/poster-cache`, карточка на `/system`). PWA кэширует `/api/poster`
    через Workbox `CacheFirst` (`poster-cache`), остальные `/api/*` остаются `NetworkFirst`.
    TMDB-постеры по умолчанию режутся до `w342`, backend даунсайзит старые запросы без
    `&w=`, а `backdropUrl()` берёт широкие `w1280`. Фронт: `posterUrl()`/
    `jellyfinPosterUrl()` в дравере lookup и сетках (битые/отсутствующие постеры прячутся
    `onError`).
    **Правильный пайплайн в медиатеку**: `GET /media/lookup?type=movie|series&q=` ищет тайтл в TMDB,
    `POST /media/release/search` ищет релизы через Jackett Torznab, `POST /media/release/grab`
    отправляет выбранный релиз в qBittorrent с категорией `mc-library` и `savePath` сразу в
    provider-id папку внутри `/data/movies` или `/data/tv` (qB namespace), затем пишет
    `MediaTitle`/`MediaTorrent`. Фронт:
    `ReleasePicker` доступен на детальной странице сериала на каждый сезон, на странице фильма
    и в дравере добавления. Batch v10 показывает год/сезон/качество/озвучку/seed chips,
    кнопку «Скачать лучший» и блокирует grab, если явный год или сезон релиза не совпадает
    с выбранным TMDB-title/season; для сериалов учитываются год старта и годы эпизодов сезона.
    **Загрузки (ручной fallback)**: `POST /media/torrent` (magnet или .torrent URL → qBittorrent),
    `POST /media/torrent/:hash/:action` (pause|resume|delete), `GET /media/search` (Jackett),
    `POST /media/scan` (`/Library/Refresh`).
    **Играть на устройство** (Jellyfin remote control): `GET /media/devices` отдаёт сессии с
    `SupportsRemoteControl` (устройства с открытым приложением Jellyfin — напр. Sber TV), `POST /media/play-to
    {sessionId,itemId}` шлёт `PlayNow` в `/Sessions/{id}/Playing`. Фронт: на плитке библиотеки контрол «📺»
    с выпадайкой устройств. Предусловие: на ТВ открыто приложение Jellyfin.
    **Torrent rails**: `GET /media/torrent-rail` показывает выбранные торренты, которые ещё
    скачиваются или уже скачались, но пока не связались с Jellyfin item. Этот library rail исчезает
    после `jellyfinId` link. `GET /media/torrents/:kind/:tmdbId` показывает все раздачи конкретного
    TMDB-title на detail-странице, включая уже связанный с Jellyfin контент. `MediaSystemTab`
    больше не показывает Native pipeline/Repair Center. Batch v10 добавляет `/api/media/home`
    для smart hero, `/api/media/statuses` для pipeline status и группирует очередь по
    пользовательским состояниям.
    Env: `JELLYFIN_*`/`QBITTORRENT_*`/`JACKETT_*`/`TORRSERVER_*`/`TMDB_API_KEY`/`MEDIA_ROOT`/
    `QBITTORRENT_SAVE_ROOT`/`MEDIA_TV`/`MEDIA_MOVIES`.
    MCP: `search_releases`/`grab_release`, `list_jackett_indexers`, `test_jackett_search`,
    `add_torrent`, `get_media_status`, `list_devices`, `play_on_device`, discovery preference tools.
    **Дискавери-таб (LAMPA/ZONA-style подборки на TMDB)** — таб «Дискавери» (`MediaDiscoverTab.tsx`)
    управляется одним вызовом `GET /media/discover/rails` (`getDiscoverHome` в `integrations/discover.ts`):
    cinematic hero на широком `backdrop_path` (отдельно от мелкого `poster_path`) и рейлы
    (в тренде / топ рейтинг / новинки года / популярные сериалы / курируемые жанры); отдельные
    жанровые чипы убраны, переход в жанровый хаб открывается кликом по названию жанровой подборки. **TMDB —
    единственный источник дискавери**: новых провайдеров не добавляли, расширили `integrations/tmdb.ts`
    (`tmdbDiscover` с фильтрами `with_genres`/год/`sort_by`/`vote_average.gte`, `tmdbGenres` кеш 24ч,
    `tmdbSimilar` recommendations→similar, `tmdbHero`, `tmdbMovieCollection`, `tmdbFindByTvdb`). Русские
    тайтлы/описания — `language=ru-RU` (фолбэк на `original_*` при пустом ru). **ID-дисциплина: TMDB tv id
    ≠ Jellyfin tvdbId** — `tmdbFindByTvdb` (`/find?external_source=tvdb_id`) резолвит перед любым
    `/tv/{id}`-вызовом. Жанровый хаб `/media/discover/genre/:kind/:genreId` (`MediaGenrePage.tsx`,
    ZONA-style каталог: фильтры год/сортировка + бесконечный скролл через IntersectionObserver);
    фильтры синхронизируются в URL (`year`/`sort`), загрузка stale-safe через request id, сортировки
    раздельные для movie (`primary_release_date`/`revenue`) и series (`first_air_date`/`popularity`/
    `vote_average`). На
    детальных страницах — рейл «Похожие» (`/media/discover/similar/:kind/:id`, для сериала `idType=tvdb`)
    и «Коллекция» франшизы у фильма (`/media/discover/collection/:tmdbId`). «Потому что вы смотрели»
    (`/media/discover/because`) — персональные рейлы, seed **строго из Jellyfin `ProviderIds`** недавно
    просмотренного (`getRecentlyWatchedSeeds`, `Filters=IsPlayed&SortBy=DatePlayed`), дедуп против
    библиотеки (включая series `tmdbId` из Jellyfin ProviderIds) и hidden/disliked preferences.
    **Локальные preferences** (`MediaPreference` в SQLite): `watchlist|hidden|liked|disliked`,
    endpoints `GET/POST/DELETE /api/media/preferences`; это только состояние дашборда, не Jellyfin
    favorites и не команды *arr. Discovery-карточки дают действия «В список»/«Добавить»/«Скрыть»,
    Cmd-K показывает «Мой список». `/media/discover/rails` **graceful**: TMDB off → `200 {configured:false,…}` (виджет не
    падает). Общий рейл-компонент — `CardRail` + адаптеры `libraryRailCards`/`tmdbRailCards` в
    `shared/mediaDetail.tsx` (бывший `SimilarRail` обобщён под Jellyfin- и TMDB-постеры).
    `MediaRail` (`shared/mediaRails.tsx`) lazy-монтирует rail через IntersectionObserver
    (`rootMargin≈900px`) и дорендеривает горизонтальные карточки пачками (8 mobile / 12 desktop
    на старте, затем +8 по свайпу), чтобы Discovery/Library/detail не создавали все карточки и
    `<img>` сразу после reload. Постер-прокси `api/poster.ts` получил `&w=`
    (`w342|w780|w1280|original`) — бэкдропы тащатся широким кропом.
    Фронт: `getDiscoverRails`/`getDiscoverGenre`/`getDiscoverSimilar`/`getDiscoverBecause`/
    `getDiscoverCollection`/`getTmdbDetail`/preferences helpers + `backdropUrl()` в `lib/api.ts`.
    Detail pages показывают трейлер/жанры/runtime/episodeCount из TMDB и graceful toast, если
    TMDB→TVDB resolve не сработал. MCP: `get_discovery_home`/`search_discovery`/
    `add_media_preference`/`hide_discovery_title`. Старые `/media/recommendations` и
    `/media/discovery/hero` удалены; discovery и рекомендации живут в TMDB rails/preferences.
12. **Командная палитра (Cmd-K)** — `CommandPalette.tsx`: оверлей по Cmd/Ctrl+K. Навигация
    (источник — `NAV_ITEMS`) + отправка команды Hermes (`sendHermesCommand`) + действия:
    создать задачу, рестарт Docker-контейнера (`dockerAction`), пауза/возобновление
    DNS-фильтрации AdGuard (`adguardProtection` → `POST /api/adguard/protection`). Данные
    (контейнеры, adguard) приходят пропсами из `App.tsx`. MCP `get_dns_stats` для Hermes.

## Homelab-стек на hermes.lan (отдельный Docker compose)

На том же VM крутится самостоятельный стек (`/srv/stack/docker-compose.yml`, диск 1ТБ на
`/srv/stack`, **не** в этом репозитории): AdGuard Home, Jellyfin, Jackett, qBittorrent,
TorrServer. Sonarr/Radarr/Prowlarr заменены simplified media pipeline внутри Mission Control:
Jackett search → qB savePath прямо в Jellyfin folders → Jellyfin scan.
Сервисы публикуются на хосте; backend-контейнер дашборда ходит к ним через
`host.docker.internal:<port>` (есть `extra_hosts` в compose). Креды живут только в
`/srv/stack/.creds` (chmod 600) и в server `.env` дашборда — в гит не коммитятся.

## UI / Дизайн-система (неоморфизм)

Текущий визуальный стандарт фронтенда — **неоморфизм** (портирован из Codex Design
бандла). Источник токенов и компонентных классов — `frontend/src/styles.css`.

- **Токены** (`:root`): `--radius` (10px для shadcn), `--card-radius` (19px),
  `--accent` (`#e53333`) + `--accent-glow-sm|glow|glow-lg`; шрифты
  `--font`/`--mono`/`--font-ui` — Syne.
- **Темы** — палитра под `.mc[data-theme="dark"|"light"]` (dark по умолчанию).
  Тема ставится на обёртку `.mc` (не на `:root`); переключатель в `theme.ts`.
- **Примитивы теней**: `.neu` (выпуклый), `.neu-in` (вдавленный), `.neu-sm` (мелкий).
- **Компоненты**: `frontend/src/components/` — `Card`, `Ring`, `icons` (SVG-набор) +
  `panels/` (TopBar, StatStrip, Tasks, HomeAssistant, HermesLog, Placeholder).
  Раскладка — **вариант C (three columns)**: полоса мини-статов + 3 колонки.
  - Левая (`col-fill`): Tasks
  - Средняя (`col`): HomeAssistant
  - Правая (`col-fill`): HermesLog
- **Данные**: Tasks (local + GitLab), Hermes (сессии), Services, Weather, HomeAssistant, Proxmox — реальные.
- **Navigation chrome**: `TopBar` закреплён сверху на всю ширину экрана; логотип перенесён
  в TopBar и работает как burger без hover-эффекта. `Sidebar` без лого: на desktop по умолчанию
  узкая колонка иконок (`76px`), по burger расширяется до подписей; на mobile полностью скрыт
  и открывается fullscreen-меню с body-lock.
- **PWA / iPhone safe-area**: manifest `display: standalone`; iOS meta
  `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`,
  viewport `viewport-fit=cover`. `App.tsx` ставит `.is-standalone` по `display-mode`/
  `navigator.standalone`; CSS tokens `--safe-top`/`--safe-bottom` используют
  `env(safe-area-inset-*)`. `TopBar` получает top safe padding только в standalone, media pages
  и hero-player controls учитывают bottom safe area. Цель — edge-to-edge PWA под status bar,
  но iOS часы/батарея/Dynamic Island не скрываются.
- **StatStrip**: одна горизонтальная полоса мини-тайлов с прокруткой — погода (широкий) +
  один объединённый Proxmox-тайл (CPU/RAM/DISK гейджи в ряд, диск/RAM в ГБ) + по тайлу на
  каждую VM/LXC (cpu/ram/статус) + по тайлу на каждый сервис. Панель «Статус системы»
  (`SystemStatus`) удалена. На ≤760px — scroll-snap карусель со свайпом.
- Новые виджеты/панели делать в этой же системе (классы `.card .neu`, токены тем).

## Прогресс по фазам

- **Фаза 1 — Скелет**: монорепо, Docker, Prisma+SQLite, базовый UI layout. ✅ ГОТОВО
- **Фаза 2 — GitLab + Tasks CRUD + Services + Weather + UI**: неоморфный редизайн,
  GitLab drawer, SHA-версия в TopBar, viewport-lock раскладка. ✅ ГОТОВО
- **Фаза 3 — Calendar + UI**: Calendar удалён (не используется); Health отложен.
  StatStrip carousel (mobile), APP_TOKEN для iOS Shortcuts. ✅ ГОТОВО
- **Фаза 4 — Home Assistant**: HA REST API, automations list/toggle, HomeAssistant панель. ✅ ГОТОВО
- **Фаза 5 — MCP сервер + Hermes integration**: Streamable HTTP `/mcp`, 12 инструментов
  (tasks/agent/HA/services/weather), bearer MCP_TOKEN, Origin-guard. ✅ ГОТОВО
- **Фаза 6 — Polish**: PWA (manifest + service worker), Settings modal (редактор сервисов). ✅ ГОТОВО
- **Proxmox + StatStrip rework**: интеграция Proxmox (нода + VMs/LXC), StatStrip переработан
  в одну полосу мини-тайлов, панель SystemStatus удалена. ✅ ГОТОВО
- **Hermes-очередь + deep-страницы** (782ba2d): командная очередь end-to-end, deep-страницы
  `/hermes`, `/system`, `/tasks`, `/home-assistant`. ✅ ГОТОВО
- **Batch v2 — Docker + uptime + ntfy** (2b1bbc1): история аптайма на `/metrics` (`ServiceCheck`
  + сэмплер), Docker-контроль на `/system` (opt-in), ntfy-нотификации Hermes (opt-in). ✅ ГОТОВО
- **Batch v3 — AdGuard + Media + Cmd-K** (472ada5): развёрнут homelab-стек на `/srv/stack`
  (1ТБ диск); AdGuard DNS-карточка на `/system`, страница `/media` (Jellyfin/Sonarr/Radarr/
  qBittorrent), командная палитра Cmd-K. Все три задеплоены и проверены на hermes.lan. ✅ ГОТОВО
- **Batch v4 — Media++ (плеер + торренты + Prowlarr)**: встроенный HLS-плеер (hls.js +
  бэкенд-прокси, токен не утекает), библиотека Jellyfin, добавление торрентов (magnet +
  поиск Prowlarr), управление очередью qBittorrent (pause/resume/delete + speed/ETA/seeds),
  Cmd-K действия (рестарт контейнера, пауза DNS, создать задачу), MCP `add_torrent`/
  `get_media_status`/`get_dns_stats`. Env: добавлен `PROWLARR_*`.
- **Media detail cinematic refactor** (2026-06-27): detail pages фильмов/сериалов переведены
  на общий cinematic `DetailHero`: HLS играет прямо в hero-фоне, fullscreen через hero,
  auto-hide chrome; poster/описание/meta и controls уходят вместе после idle, возвращаются
  на mouse/touch, затемнение после старта просмотра убрано. Общие `DetailTopBar`/`DetailBody`/
  `DetailStatusBadges`/`SimilarRail`; дублирующая JSX-разметка убрана из
  `MediaMoviePage`/`MediaSeriesPage`, старый `InlinePlayer` удалён. ✅ ГОТОВО
- **Cinematic player controls + series watch queue** (2026-06-28): пробел play/pause,
  стрелки ←/→ перематывают на 15 сек с feedback; для сериалов добавлены prev/next, autoplay
  следующей доступной серии и кнопка «Смотреть/Продолжить с SxEy». ✅ ГОТОВО
- **Media library autoplay handoff** (2026-06-28): «Смотреть» и «Продолжить просмотр» из `/media`
  переходят на detail-route с `?autoplay=1&play=<jellyfinId>` и запускают cinematic hero-player;
  resume-эпизоды получают `seriesId` из Jellyfin, старый modal-player для resume удалён, autoplay
  fallback стартует muted с кнопкой звука. ✅ ГОТОВО
- **UI chrome pass — red glow + responsive menu** (2026-06-27): глобальный красный accent/glow,
  full-width TopBar с logo-burger без hover-эффекта; desktop Sidebar оставлен как rail-меню
  (иконки → расширение по burger), mobile Sidebar открывается fullscreen. ✅ ГОТОВО
- **Discovery overhaul — LAMPA/ZONA-style подборки** (2026-06-28): дискавери-таб переведён на TMDB
  Discover (один `GET /media/discover/rails` → hero на backdrop + рейлы тренды/топ/
  новинки/жанры; названия жанровых рейлов кликабельны и ведут в жанровый хаб), жанровый хаб
  `/media/discover/genre/:kind/:genreId` (`MediaGenrePage`, фильтры +
  бесконечный скролл), рейлы «Похожие»/«Коллекция» на детальных, персональное «Потому что вы смотрели»
  (seed из Jellyfin ProviderIds). Расширен `integrations/tmdb.ts` + новый `integrations/discover.ts`;
  `SimilarRail` обобщён в `CardRail`; poster-прокси получил `&w=`. Русские тайтлы/описания (`ru-RU`),
  graceful при TMDB off. Builds зелёные; полная проверка данных — после деплоя с `TMDB_API_KEY`. ✅ ГОТОВО
- **Batch v8 — Native media pipeline + Jackett cutover** (2026-06-28, 5a30a4e): Sonarr/Radarr/
  Prowlarr убраны из production path; добавлены Prisma-модели `MediaMonitor`/quality profiles/
  import state, Jackett Torznab search+health, release parsing/scoring, qB category `mc-native`,
  background importer, Repair Center summary, native Hermes tools и homelab compose без *arr/Prowlarr.
  Builds backend+frontend зелёные. ✅ ГОТОВО
- **Batch v9 — Simplified media pipeline** (2026-06-30): monitor/importer/*arr-like слой
  удалён из активного pipeline; qB качает выбранные релизы сразу в Jellyfin folders
  `/media/movies|/media/tv`; добавлена lightweight registry `MediaTitle`/`MediaTorrent` и
  library rail «Скачивается / Скоро в библиотеке». Discovery preferences (`MediaPreference`:
  watchlist/hidden/liked/disliked), Cmd-K «Мой список» и TMDB rails сохранены. MCP/REST очищены от
  monitor/import tools; Hermes prompt обновлён на no importer/no hardlinks. ✅ ГОТОВО
- **Mobile/PWA media performance pass** (2026-07-01): серверный disk cache постеров
  `/data/poster-cache` + `/api/poster-cache/status|DELETE`, Workbox `CacheFirst` для
  `/api/poster`, TMDB poster default `w342` (backend fallback для старых URL), virtualized
  `MediaRail` и iPhone standalone safe-area/edge-to-edge polish. ✅ ГОТОВО
- **Batch v10 — Media UX vNext** (2026-07-06): smart Library hero, `/media/list`,
  user-aware preferences with global fallback, `/api/media/statuses`, grouped System queue,
  ReleasePicker safety chips for year/season/quality/voice/seed, and safe removal of empty
  accidental registry titles from the Library pending rail. ✅ ГОТОВО
- **Отложено**: drag-and-drop виджетов (react-grid-layout); будущий этап удаления Jellyfin
  (свой transcoding/watch-state) — отдельная большая тема.

Подробный трекинг — в `TASKS.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

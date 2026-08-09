# Pultra — Personal Life Dashboard (ранее Mission Control)

Персональный центр управления жизнью. Локальный self-hosted дашборд на Ubuntu
Desktop (Proxmox VM). Используется человеком И AI-агентом **Hermes** (Claude-based),
который читает данные и управляет задачами через MCP/REST API.

## Design Context

Стратегия и визуальная система вынесены в отдельные root-файлы (читаются командами impeccable):

- **`PRODUCT.md`** — register (`product`), platform (`web`), пользователи (человек + Hermes как
  co-equal операторы), позиционирование, 5 принципов, anti-references.
- **`DESIGN.md`** (+ `.impeccable/design.json`) — визуальный стандарт «The Cinematic Cockpit»:
  тёмная, плоская система с красным accent-glow; frontmatter-токены + 6 секций + named-правила.
  Каноничный источник дизайн-решений — см. также раздел «UI / Дизайн-система» ниже.

## Стек

- **Frontend**: React + TypeScript + Vite, nginx в проде
- **Backend**: Node.js + Express + TypeScript
- **БД**: SQLite через Prisma ORM (локальные задачи, логи агента, кеш)
- **MCP**: `@modelcontextprotocol/sdk` — транспорты stdio + Streamable HTTP (НЕ SSE)
- **Деплой**: Docker Compose, доступ только в LAN

## Структура

```
pultra/
├── frontend/          # React + TS + Vite
│   └── src/
│       ├── App.tsx                    # auth + routing + UI chrome (lean)
│       ├── main.tsx
│       ├── lib/
│       │   ├── api.ts                 # все REST-вызовы к бэкенду
│       │   ├── auth.ts                # JWT-токен
│       │   ├── tabsContext.tsx        # TabsContext (медиа-табы)
│       │   ├── tasksContext.tsx       # TasksContext — shared tasks state (TasksPanel, Drawer, CommandPalette)
│       │   └── format.ts
│       ├── components/
│       │   ├── layout/                # TopBar, Sidebar, Drawer, CommandPalette
│       │   ├── overlays/              # LoginForm, SettingsPanel, LogsPanel
│       │   ├── panels/                # StatStrip (MiniWidgets), Placeholder
│       │   └── ui/                    # Card, Ring, Toast
│       └── pages/
│           ├── overview/              # OverviewPage + panels (TasksPanel, HermesLogPanel, HAssistantPanel)
│           ├── system/                # HermesPage, SystemPage
│           └── media/                 # MediaRoutes + MediaPage + detail pages
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
├── CLAUDE.md
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

### Временный внешний доступ через ngrok

На `hermes.lan` ngrok установлен как `/tmp/ngrok`, authtoken уже лежит в
`/home/braidner/.config/ngrok/ngrok.yml`. Туннелим **frontend** (`127.0.0.1:3000`);
nginx сам проксирует `/api` на backend. Перед публикацией убедиться, что первый admin уже
создан, иначе публичный setup-экран позволит создать администратора.

```bash
# start
ssh braidner@hermes.lan 'nohup /tmp/ngrok http http://127.0.0.1:3000 \
  --config /home/braidner/.config/ngrok/ngrok.yml \
  --log=stdout > ~/ngrok-mission-control.log 2>&1 &'

# public URL / status
ssh braidner@hermes.lan 'curl -fsS http://127.0.0.1:4040/api/tunnels'

# logs
ssh braidner@hermes.lan 'tail -f ~/ngrok-mission-control.log'

# stop
ssh braidner@hermes.lan "pkill -f '/tmp/ngrok http http://127.0.0.1:3000'"
```

**nginx-прокси (`frontend/nginx.conf`, ВАЖНО):** `location /api/` — это REST + HLS-прокси
(Jellyfin/TorrServer), **без WebSocket**. НЕ ставить здесь `Upgrade`/`Connection "upgrade"`:
безусловные upgrade-заголовки переводят keep-alive соединение в tunnel-режим и **обрезают
большие тела ответа** (длинные HLS-плейлисты фильмов ~1.5МБ резались на ~144КБ → в браузере
`ERR_CONTENT_LENGTH_MISMATCH`, плеер висит; короткие плейлисты сериалов укладывались и играли).
Должно быть `Connection ""` + `proxy_buffering off` (исправлено в 151ba1c). Диагностика обрезки —
nginx `body_bytes_sent` vs `Content-Length`; `curl` с `Connection: close` маскирует баг.

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
11. **Медиа-стек** (opt-in, любой из источников) — `integrations/media.ts` агрегирует Jellyfin
    `/Sessions` (что играет) + qBittorrent `/api/v2/torrents/info` + native media state.
    **Актуальный pipeline (Batch v8, 2026-06-28)**: TMDB (метаданные/discovery/calendar)
    → Jackett Torznab (`JACKETT_URL`/`JACKETT_API_KEY`/`JACKETT_INDEXERS`) → native
    release parser/scoring (`releaseParse.ts`/`releaseScore.ts`) → qBittorrent category
    `mc-native` → native importer (`mediaImporter.ts`, `organizeTorrent`) → `/media/movies|tv`
    → Jellyfin scan/playback/watch-state. Sonarr/Radarr/Prowlarr больше не production path;
    `arr*` код оставлен только как rollback/fallback при `MEDIA_BACKEND=arr`. Мёртвые
    `/media/recommendations` и `/media/discovery/hero` удалены.
    Native API: `GET /media/quality-profiles`, `GET /media/jackett/health`, `GET /media/repair`,
    `GET /media/monitor`; `GET /media/search` ищет через Jackett; `POST /media/add`
    создаёт `MediaMonitor`; `POST /media/release/search|grab` работает через Jackett+
    preview/grab; `POST /media/import/candidates|execute` использует локальную SQLite-модель.
    Hermes MCP: `add_movie`/`add_series`, `search_releases`/`grab_release`,
    `list_import_candidates`/`import_release`, `list_jackett_indexers`, `test_jackett_search`,
    `list_media_monitor`, `search_missing_media`, `retry_media_import`, `explain_release_choice`.
    Ниже в этом разделе встречаются исторические описания Batch v3–v7 про Sonarr/Radarr/
    Prowlarr; считать их legacy context, а не целевым текущим поведением.
    `GET /api/media`, страница `/media` (`MediaPage.tsx`) + пункт в Sidebar.
    **Встроенный плеер**: библиотека Jellyfin (`GET /media/library`) → клик → HTML5 video
    с HLS (`hls.js`); путь воспроизведения форсит HLS-транскод (пустые DirectPlayProfiles в
    DeviceProfile, `GET /media/play/:id`). **Группировка библиотеки**: `GET /media/library` отдаёт
    сгруппированный каталог — плитки `Series` (с `tvdbId`/`childCount`) и `Movie` (раздельные запросы
    Jellyfin `/Items?IncludeItemTypes=Series|Movie`, без плоских эпизодов), сериалы идут первыми.
    **Детальные страницы** (Sonarr/Radarr-style): клик по плитке ведёт на отдельную роутовую страницу
    `/media/series/:id` (`MediaSeriesPage`) или `/media/movie/:id` (`MediaMoviePage`), `:id` = Jellyfin item id
    (React Router v6, BrowserRouter + nginx SPA-fallback). Данные — merge `GET /media/detail/{series|movie}/:id`
    (`getSeriesPageDetail`/`getMoviePageDetail`): метаданные и статус файлов из Sonarr/Radarr (read-only резолвер
    `arrFindByExternalId` по tvdb/tmdb — ничего НЕ добавляет), played-статус и плеер из Jellyfin. Сериал
    показывает ВСЕ эпизоды (вкл. отсутствующие) с датой выхода, «скачано/нет», качеством и размером (Sonarr
    `/api/v3/episode?includeEpisodeFile=true`); фильм — статус файла (качество/размер или «отсутствует»). Если
    тайтла нет в *arr → `inArr:false`, страница деградирует до данных Jellyfin. На странице: cinematic hero-player:
    клик «Смотреть» запускает HLS-видео прямо в hero-фоне (без модалки), без дополнительного затемнения после
    старта. Из медиабиблиотеки кнопка «Смотреть» и ряд «Продолжить просмотр» открывают detail-route с query
    `?autoplay=1&play=<jellyfinId>&title=...`; старый модальный плеер для resume удалён. Если браузер блокирует
    autoplay со звуком, HLS стартует muted, а в player chrome есть кнопка включения звука. Постер/описание/title-meta
    и нижняя панель (play/pause, seek, mute, stop, fullscreen) являются единым
    player chrome: после idle они синхронно уезжают вниз/исчезают и возвращаются на mouse/touch. Fullscreen
    вызывается через `requestFullscreen` на hero-контейнере. Также есть `ReleasePicker`
    на сезон/фильм (поиск+force-grab с озвучкой/качеством), игра на устройство (фильм) и кнопка
    ручного импорта застрявшей раздачи (`ImportDrawer`, если в очереди есть `importPending`-раздача этого тайтла).
    Старый `SeriesDrawer` удалён; общие detail-компоненты (`DetailTopBar`/`DetailHero`/`DetailBody`/
    `DetailStatusBadges`/`StuckImportButtons`/`SimilarRail`) вынесены в
    `frontend/src/pages/media/shared/mediaDetail.tsx`; HLS/modal/TorrServer player, `ReleasePicker`,
    `ImportDrawer` и форматтеры — в `frontend/src/pages/media/shared/mediaShared.tsx`.
    (`GET /media/series/:id` — Jellyfin-only seasons — остаётся для обратной
    совместимости.) Стрим идёт через бэкенд-реверс-прокси
    `ALL /api/media/jellyfin/*` — токен Jellyfin инжектится заголовком и НЕ утекает в браузер;
    `.m3u8` переписывается (вырезается `api_key`), hls.js `xhrSetup` цепляет JWT приложения.
    **Постер-прокси** (`api/poster.ts`, `GET /api/poster?url=<tmdb>|jf=<id>`): `<img>` не может
    слать bearer → маршрут вынесен из-под `jwtAuth` (публичный, LAN-only), но жёстко ограничен
    анти-SSRF (только `image.tmdb.org`, даунсайз `original→w342`; или Jellyfin по hex-id с
    инжектом токена). Решает таймаут постеров: у клиентов нет IPv6-egress до BunnyCDN (TMDB
    отдаёт AAAA), а бэкенд ходит по IPv4. Фронт: `posterUrl()`/`jellyfinPosterUrl()` в дравере
    lookup и в сетке библиотеки (битые/отсутствующие постеры прячутся `onError`).
    **Правильный пайплайн в медиатеку** (основной путь добавления): `GET /media/lookup?type=movie|series&q=`
    ищет тайтл в Radarr/Sonarr (`/api/v3/{movie|series}/lookup`, постер/год/overview/added),
    `POST /media/add {type,id}` (`arrAdd`) добавляет тайтл с первым root folder + quality profile,
    `monitored:true`, и запускает поиск релиза (`searchForMovie`/`searchForMissingEpisodes`). Дальше
    Radarr/Sonarr сами грабят через qBittorrent (категория `radarr`/`sonarr`), импортируют (hardlink
    + rename) в `/data/movies`|`/data/tv` и триггерят скан Jellyfin. В дравере `/media` это верхняя
    секция (сегмент Фильм/Сериал → поиск → постер/«Добавить»); ручной magnet + сырой Prowlarr-поиск —
    в свёрнутой секции «Вручную».
    **Выбор раздачи (release picker)**: интерактивный поиск релизов Sonarr/Radarr `/api/v3/release`
    (`POST /media/release/search {type,id,seasonNumber?}` → `arrReleaseSearch`) — выдаёт торренты с
    качеством, языками/озвучкой, размером, сидами и причинами отклонения (`rejected`/`rejections`).
    `id` = `tmdbId` (movie) / `tvdbId` (series); если тайтла нет в *arr, он добавляется monitored без
    авто-поиска (`arrEnsureAdded(..., false)`) ради internal id. Полные raw-записи кешируются по `guid`
    (10 мин). Force-grab `POST /media/release/grab {type,guid,indexerId}` (`arrReleaseGrab`) переотправляет
    полный объект (надёжнее guid+indexerId; *arr может вернуть 5xx «Failed to connect to qBittorrent», но
    торрент реально добавлен → 5xx считаем успехом, бросаем только на 4xx). Грабит даже отклонённые релизы
    (multi-season паки и т.п.) — это и есть способ дотащить зависший сезон. Фронт: `ReleasePicker` (плашки
    качества/языка/отклонения) доступен на детальной странице сериала на каждый сезон («🔍 Раздача»), на странице
    фильма (карточка «Раздачи»), и в дравере
    «Добавить» на результат поиска («Выбрать раздачу», для сериала — поле сезона).
    **Ручной импорт застрявших раздач (multi-season паки и т.п.)**: после force-grab пака через
    поиск по одному сезону Sonarr помечает раздачу как «релиз сезона N» и **отклоняет авто-импорт**
    серий вне него («Episode 2x01 was not found in the grabbed release») — пак скачан, но не разложен.
    Очередь (`arrQueue`) теперь отдаёт `importPending`/`importMessage` (по `trackedDownloadState`
    `importPending|importBlocked` + statusMessages). `POST /media/import/candidates {type,downloadId}`
    (`manualImportCandidates` → Sonarr/Radarr `GET /api/v3/manualimport?downloadId=`) отдаёт файлы с
    распарсенными сериями/сезоном, качеством, озвучкой и причинами реджекта; сырые записи кешируются по
    `downloadId` (10 мин). `POST /media/import/execute {type,downloadId,fileIds[],importMode?}`
    (`manualImportExecute` → `POST /api/v3/command {name:"ManualImport"}`) импортирует выбранные файлы
    **в обход реджекта** — как кнопка «Import» в UI Sonarr; `importMode:"copy"` (дефолт) сохраняет
    сидирование. `autoSelectImportFileIds` берёт по одному лучшему файлу на серию/фильм (дедуп копий —
    в паке бывает две копии сезона с разной озвучкой). Фронт: застрявшие раздачи в карточке Загрузки
    помечены «⚠ не импортировано» + кнопка «Импорт» → `ImportDrawer` (файлы по сезонам, флажки,
    предвыбран один файл на серию). `downloadId` = qB-хеш (`DownloadItem.downloadId`).
    **Загрузки (ручной fallback)**: `POST /media/torrent` (magnet или .torrent URL → qBittorrent, общий
    с Prowlarr grab), `POST /media/torrent/:hash/:action` (whitelist pause|resume|delete), `GET /media/search`
    (Prowlarr), `POST /media/scan` (`/Library/Refresh`).
    **Играть на устройство** (Jellyfin remote control): `GET /media/devices` отдаёт сессии с
    `SupportsRemoteControl` (устройства с открытым приложением Jellyfin — напр. Sber TV), `POST /media/play-to
    {sessionId,itemId}` шлёт `PlayNow` в `/Sessions/{id}/Playing`. Фронт: на плитке библиотеки контрол «📺»
    с выпадайкой устройств. Предусловие: на ТВ открыто приложение Jellyfin.
    **Native media pipeline**: `GET /media/quality-profiles` отдаёт локальные profiles, `GET /media/
    jackett/health` проверяет Torznab indexers, `GET /media/repair` показывает stuck imports/
    missing episodes/indexer failures. `MediaSystemTab` рисует Native pipeline summary; `ReleasePicker`
    показывает score, reasons, warnings, parsed quality/source/codec/HDR/languages.
    **TorrServer (opt-in `TORRSERVER_URL`)** — `integrations/torrserver.ts` (YouROK): мгновенный
    стрим магнета без полной загрузки и без добавления в библиотеку. `POST /media/torrserver/add`
    (magnet→hash+файлы, `pickVideoFile` берёт крупнейший видеофайл), `GET /media/torrserver/list`,
    `DELETE /media/torrserver/:hash`. **Видеопоток проксируется** через `api/torrserverStream.ts` —
    отдельный публичный роут (вне jwtAuth: `<video src>` не шлёт bearer), анти-SSRF (только hash
    `^[a-f0-9]{40}$`), проброс `Range`→`206` (seek). Direct-play в браузере для mp4/m4v/webm; mkv/avi/HEVC
    → «копировать ссылку / .m3u» для внешнего плеера (Player `direct`-режим). Карточка «Смотреть онлайн»
    на `/media` + кнопка «▶ Сейчас» на Prowlarr-результатах. `media.torrserver:boolean` в `GET /media`.
    **Расписание + удобный пайплайн сериалов**: `GET /media/calendar?days=` (Sonarr+Radarr `/calendar`,
    `getCalendar`) → карточка «Скоро выйдет» на `/media` + страница `/media/calendar` (`MediaCalendarPage`,
    в Sidebar `NAV_ITEMS`). На детальной странице — monitor-toggle (★/☆) сезона/сериала/фильма
    (`POST /media/monitor` → `arrSetMonitored`, GET→patch→PUT) и **bulk-поиск** «⬇ Найти сезон / недостающие»
    (`POST /media/season/search` → `arrTriggerSearch`: Sonarr SeasonSearch/MissingEpisodeSearch, Radarr
    MoviesSearch). `id` = внешний tvdbId/tmdbId (резолв через `arrFindByExternalId`). **Discovery**:
    «Продолжить просмотр» (`GET /media/continue` → Jellyfin `Items/Resume`, прогресс-плитки; для эпизодов
    подтягивается `seriesId`, клик ведёт на `/media/series/:seriesId?autoplay=1&play=<episodeId>`) и единый
    поиск в Cmd-K (`GET /media/unified?q=` → библиотека+`arrLookup`+Prowlarr: открыть detail / добавить /
    скачать). **UX**: тост-система (`components/Toast.tsx`, `ToastProvider` в `main.tsx`, `useToast()`) на
    все действия; сетка с оверлеями (просмотрено✓/N непросмотренных, Jellyfin `UserData`), фильтр тип/
    непросмотренное + сортировка + скелетоны; детальная сериала — прогресс сезона, превью эпизодов
    (`jellyfinPosterUrl(epId)`), относительные даты, вышедшие-но-отсутствующие красным; адаптивный поллинг
    медиа (5с при активной загрузке, иначе 15с) в `App.tsx`; mobile/a11y (focus-visible, ≤760px).
    Env: `JELLYFIN_*`/`QBITTORRENT_*`/`JACKETT_*`/`TORRSERVER_*`/`TMDB_API_KEY`/`MEDIA_ROOT`.
    MCP: `add_movie`/`add_series`, `search_releases`/`grab_release`, `list_import_candidates`/
    `import_release`, `list_jackett_indexers`, `test_jackett_search`, `list_media_monitor`,
    `search_missing_media`, `retry_media_import`, `explain_release_choice`, `watch_now`,
    `add_torrent`, `get_media_status`, `list_devices`, `play_on_device`.
    **Дискавери-таб (LAMPA/ZONA-style подборки на TMDB)** — таб «Дискавери» (`MediaDiscoverTab.tsx`)
    управляется одним вызовом `GET /media/discover/rails` (`getDiscoverHome` в `integrations/discover.ts`):
    cinematic hero на широком `backdrop_path` (отдельно от мелкого `poster_path`) и рейлы
    (в тренде / топ рейтинг / новинки года / популярные сериалы / курируемые жанры); отдельные
    жанровые чипы убраны, переход в жанровый хаб открывается кликом по названию жанровой подборки. **TMDB —
    единственный источник дискавери**: новых провайдеров не добавляли, расширили `integrations/tmdb.ts`
    (`tmdbDiscover` с фильтрами `with_genres`/год/`sort_by`/`vote_average.gte`, `tmdbGenres` кеш 24ч,
    `tmdbSimilar` recommendations→similar, `tmdbHero`, `tmdbMovieCollection`, `tmdbFindByTvdb`). Русские
    тайтлы/описания — `language=ru-RU` (фолбэк на `original_*` при пустом ru). **ID-дисциплина: TMDB tv id
    ≠ Sonarr/Jellyfin tvdbId** — `tmdbFindByTvdb` (`/find?external_source=tvdb_id`) резолвит перед любым
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
    Cmd-K показывает «Мой список». Batch v10 делает preferences user-aware (`appUserId` + `global`
    fallback), добавляет `/media/list`, `/api/media/home` smart hero и `/api/media/statuses`.
    `/media/discover/rails` **graceful**: TMDB off → `200 {configured:false,…}` (виджет не
    падает). Общий рейл-компонент — `CardRail` + адаптеры `libraryRailCards`/`tmdbRailCards` в
    `shared/mediaDetail.tsx` (бывший `SimilarRail` обобщён под Jellyfin- и TMDB-постеры). Постер-прокси
    `api/poster.ts` получил `&w=` (`w342|w780|w1280|original`) — бэкдропы тащатся широким кропом.
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
TorrServer (YouROK, порт 8090, `ghcr.io/yourok/torrserver`). Sonarr/Radarr/Prowlarr заменены
native media pipeline внутри Pultra. Сервисы публикуются на хосте; backend-контейнер дашборда ходит к ним через
`host.docker.internal:<port>` (есть `extra_hosts` в compose). Креды живут только в
`/srv/stack/.creds` (chmod 600) и в server `.env` дашборда — в гит не коммитятся.

## UI / Дизайн-система (flat / «The Cinematic Cockpit»)

Текущий визуальный стандарт фронтенда — **плоский (flat) дизайн** на Tailwind v4 + shadcn
(`Pultra v4`). Глубина — тональные слои поверхностей + hairline-бордеры, НЕ тени;
единственная выразительная «тень» — красный accent-glow. Прежний неоморфизм (`.neu*`) удалён.
Источник токенов и компонентных классов — `frontend/src/styles.css`. Полная визуальная спека
с named-правилами — в `DESIGN.md` (frontmatter-токены + 6 секций) и `.impeccable/design.json`.

- **Токены** (`:root`): `--radius` (10px для shadcn), `--card-radius` (19px),
  `--accent` (`#e53333`) + `--accent-glow-sm|glow|glow-lg`; шрифты
  `--font`/`--mono`/`--font-ui` — Syne.
- **Темы** — палитра под `.mc[data-theme="dark"|"light"]` (dark по умолчанию).
  Тема ставится на обёртку `.mc` (не на `:root`); переключатель в `theme.ts`.
- **Глубина без теней**: тональная лестница поверхностей (`--page` → `--surface` → `--raise`
  → `--surface-2`) + один hairline-бордер (`--hair`, white 4.5%). Тени нет; красный
  accent-glow означает «live/primary», а не «приподнято». Единственная санкционированная
  чёрная drop-тень — hover-lift плитки медиатеки.
- **Компоненты**: `frontend/src/components/` — `Card`, `Ring`, `icons` (SVG-набор) +
  `panels/` (StatStrip/MiniWidgets, Placeholder) + `layout/` (TopBar, Sidebar, Drawer, CommandPalette).
  Раскладка — **вариант C (three columns)**: полоса мини-статов + 3 колонки.
  - Левая (`col-fill`): Tasks
  - Средняя (`col`): HomeAssistant
  - Правая (`col-fill`): HermesLog
- **Архитектура данных (self-contained widgets)**: `App.tsx` не хранит доменные данные.
  Каждый виджет/страница самостоятельно делает fetch и polling:
  - `TasksContext` (`lib/tasksContext.tsx`) — единственное исключение: shared state tasks+selectedTask,
    т.к. используется в `TasksPanel`, `Drawer` и `CommandPalette`. Оборачивает дерево в `App.tsx`.
  - `MiniWidgets` (StatStrip) — weather/proxmox/services + `useTasksCtx()` для счётчика задач
  - `TasksPanel` — `useTasksCtx()` для данных и хендлеров
  - `Drawer` — `useTasksCtx()` для `selectedTask`/`clearSelection`
  - `HermesLogPanel` — hermes+hermesTasks (60с поллинг)
  - `HomeAssistantPanel` — hass automations (30с поллинг)
  - `CommandPalette` — docker+adguard (30с) + `useTasksCtx()` для `onAddTask`
  - `HermesPage`, `SystemPage`, `MediaRoutes` — каждая страница своя (polling внутри)
  - `App.tsx` (~120 строк): только auth, backend health, version, routing и UI-флаги
    (sidebar/settings/logs); часы живут внутри `TopBar`
- **Navigation chrome**: `TopBar` закреплён сверху на всю ширину экрана; логотип перенесён
  в TopBar и работает как burger без hover-эффекта. `Sidebar` без лого: на desktop по умолчанию
  узкая колонка иконок (`76px`), по burger расширяется до подписей; на mobile полностью скрыт
  и открывается fullscreen-меню с body-lock.
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
  `get_media_status`/`get_dns_stats`. Env: добавлен `PROWLARR_*`. ✅ ГОТОВО
- **Batch v5 — *arr пайплайн + детальные страницы**: правильный пайплайн в медиатеку
  (`arrLookup`/`arrAdd`), группировка библиотеки Series/Movie, роутовые детальные страницы
  `/media/series|movie/:id`, интерактивный release-picker (force-grab), ручной импорт застрявших
  multi-season паков (ManualImport), постер-прокси. ✅ ГОТОВО
- **Batch v6 — TorrServer + пайплайн сериалов + UX/UI** (2026-06-23, 280c866+e5a089f): TorrServer
  стриминг (мгновенный просмотр магнета, прокси с Range вне jwtAuth), расписание `/media/calendar`,
  monitor-toggle + bulk-поиск сезона/недостающих, «Продолжить просмотр» (Jellyfin Resume), единый
  поиск в Cmd-K, тост-система, полиш сетки/детальной/мобилки. Env: добавлен `TORRSERVER_*`. ✅ ГОТОВО
- **Batch v6.1 — фикс воспроизведения** (151ba1c): nginx `/api/` резал большие HLS-плейлисты из-за
  upgrade-заголовков → убраны, `Connection ""`+`proxy_buffering off`. См. раздел «Деплой». ✅ ГОТОВО
- **Media detail cinematic refactor** (2026-06-27): detail pages фильмов/сериалов переведены
  на общий cinematic `DetailHero`: HLS играет прямо в hero-фоне, fullscreen через hero,
  auto-hide chrome; poster/описание/meta и controls уходят вместе после idle, возвращаются
  на mouse/touch, затемнение после старта просмотра убрано. Общие `DetailTopBar`/`DetailBody`/
  `DetailStatusBadges`/`SimilarRail`; дублирующая JSX-разметка убрана из
  `MediaMoviePage`/`MediaSeriesPage`, старый `InlinePlayer` удалён. ✅ ГОТОВО
- **Media library autoplay handoff** (2026-06-28): «Смотреть» и «Продолжить просмотр» из `/media`
  переходят на detail-route с `?autoplay=1&play=<jellyfinId>` и запускают cinematic hero-player;
  resume-эпизоды получают `seriesId` из Jellyfin, старый modal-player для resume удалён, autoplay
  fallback стартует muted с кнопкой звука. ✅ ГОТОВО
- **Refactor — self-contained widgets + TabsContext** (fa19b5d → 20e7658): `App.tsx` split на
  domain-файлы (`TabsContext`, `OverviewPage`, `MediaRoutes`); затем полный рефакторинг — каждый виджет
  самостоятельно делает fetch/polling, `App.tsx` стал lean (~120 строк, только auth+routing+UI chrome).
  `TasksContext` (`lib/tasksContext.tsx`) — единственный shared context (tasks/selectedTask/handlers).
  `OverviewPage` стала prop-free (20 строк). ✅ ГОТОВО
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
- **Batch v10 — Media UX vNext** (2026-07-06): smart Library hero, first-class `/media/list`,
  personal preferences with global fallback, title pipeline statuses, grouped media queue, and
  ReleasePicker year/season safety chips with blocked mismatches. ✅ ГОТОВО
- **Отложено**: drag-and-drop виджетов (react-grid-layout); будущий этап удаления Jellyfin
  (свой transcoding/watch-state) — отдельная большая тема.

Подробный трекинг — в `TASKS.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

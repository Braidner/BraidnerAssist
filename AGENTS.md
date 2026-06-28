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
    `/Sessions` (что играет) + Sonarr/Radarr `/api/v3/queue` + qBittorrent `/api/v2/torrents/info`
    (очередь) + Prowlarr `/api/v1/search` (поиск релизов) через `Promise.allSettled`.
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
    вызывается через `requestFullscreen` на hero-контейнере. Горячие клавиши активны только при запущенном
    hero-плеере и не перехватывают поля ввода: пробел play/pause, ←/→ перемотка на 15 сек, Esc stop.
    Для сериалов `MediaSeriesPage` строит frontend-очередь из доступных Jellyfin-эпизодов (`jellyfinId`),
    показывает prev/next в player chrome, автозапускает следующую доступную серию по `ended`, а основная
    кнопка «Смотреть» выбирает первый непосмотренный эпизод (`Смотреть с SxEy`/`Продолжить с SxEy`) или
    первую доступную серию, если всё просмотрено. Также есть `ReleasePicker`
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
    **Подборки** (ещё не в библиотеке): `GET /media/recommendations` агрегирует import-list discover
    Radarr `/api/v3/importlist/movie` + Sonarr `/api/v3/importlist/series` (фильтр `isExisting`/`isExcluded`),
    добавление в один клик через существующий `POST /media/add`. Карточка «Подборки» на `/media`.
    Предусловие: в Radarr/Sonarr включён хотя бы один import-list (встроенный, ключ TMDB не нужен).
    Env: `JELLYFIN_*`/`SONARR_*`/`RADARR_*`/`QBITTORRENT_*`/`PROWLARR_*`. MCP: `add_movie`/`add_series`
    (правильный пайплайн, основной), `search_releases`/`grab_release` (интерактивный выбор раздачи с
    нужной озвучкой/качеством; `grab_release` после своего `search_releases` — кеш по guid),
    `list_import_candidates`/`import_release` (разложить застрявший multi-season пак: ManualImport
    в обход реджекта; `import_release` без `fileIds` — авто-выбор по одному файлу на серию),
    `add_torrent`/`get_media_status`/`list_devices`/`play_on_device`/`get_recommendations` (Hermes).
    **Дискавери-таб (LAMPA/ZONA-style подборки на TMDB)** — таб «Дискавери» (`MediaDiscoverTab.tsx`)
    управляется одним вызовом `GET /media/discover/rails` (`getDiscoverHome` в `integrations/discover.ts`):
    cinematic hero на широком `backdrop_path` (отдельно от мелкого `poster_path`), чипы жанров и
    рейлы (в тренде / топ рейтинг / новинки года / популярные сериалы / курируемые жанры). **TMDB —
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
    Cmd-K показывает «Мой список». `/media/discover/rails` **graceful**: TMDB off → `200 {configured:false,…}` (виджет не
    падает). Общий рейл-компонент — `CardRail` + адаптеры `libraryRailCards`/`tmdbRailCards` в
    `shared/mediaDetail.tsx` (бывший `SimilarRail` обобщён под Jellyfin- и TMDB-постеры). Постер-прокси
    `api/poster.ts` получил `&w=` (`w342|w780|w1280|original`) — бэкдропы тащатся широким кропом.
    Фронт: `getDiscoverRails`/`getDiscoverGenre`/`getDiscoverSimilar`/`getDiscoverBecause`/
    `getDiscoverCollection`/`getTmdbDetail`/preferences helpers + `backdropUrl()` в `lib/api.ts`.
    Detail pages показывают трейлер/жанры/runtime/episodeCount из TMDB и graceful toast, если
    TMDB→TVDB resolve не сработал. MCP: `get_discovery_home`/`search_discovery`/
    `add_media_preference`/`hide_discovery_title`. (Старые `/media/recommendations` и
    `/media/discovery/hero` оставлены для MCP/Hermes, дискавери-таб их больше не использует.)
12. **Командная палитра (Cmd-K)** — `CommandPalette.tsx`: оверлей по Cmd/Ctrl+K. Навигация
    (источник — `NAV_ITEMS`) + отправка команды Hermes (`sendHermesCommand`) + действия:
    создать задачу, рестарт Docker-контейнера (`dockerAction`), пауза/возобновление
    DNS-фильтрации AdGuard (`adguardProtection` → `POST /api/adguard/protection`). Данные
    (контейнеры, adguard) приходят пропсами из `App.tsx`. MCP `get_dns_stats` для Hermes.

## Homelab-стек на hermes.lan (отдельный Docker compose)

На том же VM крутится самостоятельный стек (`/srv/stack/docker-compose.yml`, диск 1ТБ на
`/srv/stack`, **не** в этом репозитории): AdGuard Home, Jellyfin, Sonarr, Radarr, Prowlarr,
qBittorrent. Сервисы публикуются на хосте; backend-контейнер дашборда ходит к ним через
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
  Discover (один `GET /media/discover/rails` → hero на backdrop + чипы жанров + рейлы тренды/топ/
  новинки/жанры), жанровый хаб `/media/discover/genre/:kind/:genreId` (`MediaGenrePage`, фильтры +
  бесконечный скролл), рейлы «Похожие»/«Коллекция» на детальных, персональное «Потому что вы смотрели»
  (seed из Jellyfin ProviderIds). Расширен `integrations/tmdb.ts` + новый `integrations/discover.ts`;
  `SimilarRail` обобщён в `CardRail`; poster-прокси получил `&w=`. Русские тайтлы/описания (`ru-RU`),
  graceful при TMDB off. Builds зелёные; полная проверка данных — после деплоя с `TMDB_API_KEY`. ✅ ГОТОВО
- **Отложено**: drag-and-drop виджетов (react-grid-layout); Sonarr/Radarr interactive search
  (авто-раскладка файлов в библиотеки Jellyfin) — кандидат на отдельную партию.

Подробный трекинг — в `TASKS.md`.

# Mission Control — Personal Life Dashboard

Персональный центр управления жизнью. Локальный self-hosted дашборд на Ubuntu
Desktop (Proxmox VM). Используется человеком И AI-агентом **Hermes** (Claude-based),
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
    DeviceProfile, `GET /media/play/:id`). Стрим идёт через бэкенд-реверс-прокси
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
    (правильный пайплайн, основной), `add_torrent`/`get_media_status`/`list_devices`/`play_on_device`/
    `get_recommendations` (Hermes).
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

Текущий визуальный стандарт фронтенда — **неоморфизм** (портирован из Claude Design
бандла). Источник токенов и компонентных классов — `frontend/src/styles.css`.

- **Токены** (`:root`): `--depth` (0.8), `--radius` (19px), `--accent` (`#34d399`),
  шрифты `--font` Inconsolata (моно/числа) + `--font-ui` Outfit (UI).
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
- **Отложено**: drag-and-drop виджетов (react-grid-layout); Sonarr/Radarr interactive search
  (авто-раскладка файлов в библиотеки Jellyfin) — кандидат на отдельную партию.

Подробный трекинг — в `TASKS.md`.

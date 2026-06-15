# Дизайн: «Играть на устройство» + плашка подборок (медиа-модуль)

Дата: 2026-06-16
Статус: на ревью

## Контекст

Медиа-модуль (модуль 11 в `CLAUDE.md`) уже агрегирует Jellyfin (now-playing,
библиотека, встроенный HLS-плеер), Sonarr/Radarr/qBittorrent (очередь), Prowlarr
(поиск) и «правильный» пайплайн добавления в медиатеку через `arrAdd`. Весь бэкенд
в `backend/src/integrations/media.ts`, роуты в `backend/src/api/index.ts`
(`/api/media/*`), фронт в `frontend/src/components/panels/MediaPage.tsx`.

Добавляем две независимые фичи:

1. **«Играть на устройство»** — отправить фильм/серию из библиотеки на внешнее
   устройство (Sber TV с приложением Jellyfin) через remote-control Jellyfin.
2. **Плашка подборок** — рекомендации фильмов/сериалов, которых ещё нет в
   библиотеке, с кнопкой «Добавить» в очередь загрузки (переиспользует `arrAdd`).

Принципы из ТЗ соблюдаются: каждый источник опционален и изолирован через
`Promise.allSettled`, падение одного не ломает страницу; не настроено → «Not
configured»; постеры идут через существующий анти-SSRF постер-прокси.

---

## Фича 1 — «Играть на устройство» (Jellyfin remote control)

### Как работает Jellyfin remote control

Jellyfin умеет дистанционно управлять только теми устройствами, где сейчас
**запущено приложение Jellyfin с активной сессией** и `SupportsRemoteControl:
true`. Команда воспроизведения: `POST /Sessions/{sessionId}/Playing` с query
`playCommand=PlayNow&itemIds={itemId}`. Это ограничение протокола: если на Sber TV
приложение Jellyfin не открыто, кидать некуда.

### Backend (`integrations/media.ts`)

- `interface PlayDevice { id: string; deviceName: string; client: string; nowPlaying: string | null; }`
- `jellyfinSessions(): Promise<PlayDevice[]>` — `GET /Sessions` (заголовок токена
  через `jfHeaders()`), отфильтровать `SupportsRemoteControl === true`, исключить
  сессии без `DeviceName`. Маппинг в `PlayDevice` (`nowPlaying` из
  `NowPlayingItem.Name`, если есть).
- `jellyfinPlayTo(sessionId: string, itemId: string): Promise<void>` —
  `POST /Sessions/{sessionId}/Playing?playCommand=PlayNow&itemIds={itemId}` с
  `jfHeaders()`, таймаут 8с; не-2xx → `throw`.

### Роуты (`api/index.ts`)

- `GET /api/media/devices` — `503 {configured:false}` если Jellyfin не настроен;
  иначе `jellyfinSessions()` → `{ devices }`.
- `POST /api/media/play-to` — body `{ sessionId, itemId }`; валидация обоих полей
  (400 при отсутствии); `jellyfinPlayTo()` → `{ ok: true }`.

### Frontend (`MediaPage.tsx`)

- В карточке/дравере элемента библиотеки рядом с кнопкой плеера — выпадающий
  список «Играть на → [устройство]». Источник — `GET /api/media/devices`
  (подгружается при открытии секции библиотеки / дравера).
- Выбор устройства → `POST /api/media/play-to {sessionId, itemId}` → тост успеха.
- Если устройств нет — control в состоянии disabled с подсказкой «открой Jellyfin
  на ТВ». Ошибки — локальный тост, страницу не ломают.

### MCP (`backend/src/mcp/`)

- `list_devices()` → массив `PlayDevice` (для Hermes).
- `play_on_device({ itemId, deviceName })` — резолвит `deviceName` → `sessionId`
  через `jellyfinSessions()` (первое совпадение, case-insensitive); если не найдено
  — понятная ошибка со списком доступных устройств.

### Предусловие

На Sber TV установлено и открыто приложение Jellyfin (даёт remote-control сессию).

---

## Фича 2 — Плашка подборок (ещё не скачано)

### Источник подборок

Встроенный в Radarr/Sonarr discover через import-lists: Radarr
`GET /api/v3/importlist/movie`, Sonarr `GET /api/v3/importlist/series`. Эти ручки
отдают тайтлы из настроенных import-list'ов с флагом, добавлен ли тайтл уже в
библиотеку. Ключ TMDB не нужен — используются встроенные типы import-list'ов
(напр. «TMDB Popular», «Trakt Trending»).

**Предусловие**: в Radarr/Sonarr включён хотя бы один import-list — иначе discover
пуст (плашка покажет пустое состояние / «Not configured»).

### Backend (`integrations/media.ts`)

- `interface Recommendation { kind: "movie" | "series"; id: number; title: string; year: number | null; overview: string; poster: string | null; }`
  (`id` — `tmdbId` для movie / `tvdbId` для series, тот же, что принимает `arrAdd`).
- `getRecommendations(): Promise<Recommendation[]>` — `Promise.allSettled` по
  Radarr `/api/v3/importlist/movie` + Sonarr `/api/v3/importlist/series`; маппинг,
  отфильтровать уже добавленные/исключённые (`isExisting` / `isExcluded`), дедуп
  по `kind+id`, разумный лимит (напр. 40). Постер — `arrPoster(images)`
  (переиспользуем существующий хелпер).

### Роуты (`api/index.ts`)

- `GET /api/media/recommendations` — `503 {configured:false}`, если ни Radarr, ни
  Sonarr не настроены; иначе `{ items }`.
- Добавление переиспользует существующий `POST /api/media/add {type, id}`
  (`arrAdd`) — новый роут не нужен.

### Frontend (`MediaPage.tsx`)

- Секция-плашка с сеткой постеров (через `posterUrl()`); на каждой карточке —
  кнопка «Добавить». Клик → `POST /api/media/add {type: kind, id}` → тост, карточка
  скрывается (оптимистично). Битые постеры прячутся `onError` (как в существующей
  сетке).
- Пусто/не настроено → плашка показывает соответствующее состояние, не ломает
  остальную страницу.

### MCP (`backend/src/mcp/`)

- `get_recommendations()` → массив `Recommendation` (для Hermes). Добавление Hermes
  уже умеет через существующие `add_movie`/`add_series`.

---

## Изоляция и обработка ошибок

- Обе фичи следуют существующему паттерну: источники изолированы через
  `Promise.allSettled`, падение одного источника не ломает страницу.
- Не настроено → `503 {configured:false}` на роуте, «Not configured»/пустое
  состояние на фронте.
- Постеры — только через существующий анти-SSRF постер-прокси (TMDB remoteUrl или
  Jellyfin по id), bearer-токены в браузер не утекают.

## Объём (YAGNI)

- Play To — только `PlayNow`; полноценный пульт (pause/stop/seek) не делаем.
- Подборки — read + add; без жанровых фильтров, пагинации, персональных «потому что
  вы смотрели».
- Новых env-переменных нет (TMDB-ключ не вводим — discover живёт внутри *arr).

## Что проверить при реализации

- Точные имена ручек/полей Radarr `/api/v3/importlist/movie` и Sonarr
  `/api/v3/importlist/series` (флаги `isExisting`/`isExcluded`) — свериться с
  реальным ответом инстансов на hermes.lan.
- Формат `itemIds` в `POST /Sessions/{id}/Playing` (CSV vs повтор параметра).

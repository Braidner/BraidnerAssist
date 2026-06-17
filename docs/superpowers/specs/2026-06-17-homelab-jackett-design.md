# Homelab compose в репо + индексер Jackett

**Дата:** 2026-06-17
**Контекст:** Поиск релизов через Prowlarr+RuTor упирается в особенности
русского нейминга (год озвучки вместо года шоу, альт-тайтлы слева,
кириллица), а патчить определения Cardigann бесконечно — путь в никуда.
Jackett даёт более широкий и активно поддерживаемый набор определений
(в т.ч. для нишевых трекеров). Параллельно решаем второй застарелый
вопрос: homelab-стек живёт только на сервере (`/srv/stack/`), его
конфиг не зафиксирован в git и может потеряться.

## Цели

1. **Зафиксировать инфраструктуру homelab-стека в репо** как
   infra-as-code, чтобы обновления compose шли через git pull, а не
   через ручные правки на сервере.
2. **Добавить Jackett** как дополнительный источник индексеров рядом
   с Prowlarr (не вместо). Sonarr/Radarr продолжают ходить в Prowlarr,
   Jackett подключается в Prowlarr как Torznab.

## Не-цели

- Не мигрируем существующие индексеры Prowlarr (NoNaMe Club, RuTor MC).
  Jackett — дополнение, а не замена.
- Не двигаем 1ТБ диск из `/srv/stack`.
- Не выносим в репо секреты (`.env`, `.creds`).
- Не строим в этой итерации UI release-picker — это отдельная фича,
  следующий цикл (после того как Jackett покажет, нужен ли он).

## Архитектура

### Раскладка в репо

```
homelab/
├── docker-compose.yml         # полный стек (7 сервисов с jackett)
├── .env.example               # PUID/PGID/TZ шаблон
├── setup-creds.sh.example     # шаблон без значений
└── README.md                  # deploy + symlink-инструкция
```

`/srv/stack/docker-compose.yml` на сервере → symlink на
`~/mission-control/homelab/docker-compose.yml`. Реальные `.env` и
`.creds` остаются в `/srv/stack/`, в git не попадают (`.creds` уже в
`.gitignore` по паттерну, `.env` — добавим явно).

Текущий `/srv/stack/docker-compose.yml.bak.20260616-162516` остаётся
как страховка отката на случай, если симлинк подведёт.

### Сервис Jackett

```yaml
jackett:
  image: lscr.io/linuxserver/jackett:latest
  container_name: jackett
  networks: [stack]
  environment:
    - PUID=${PUID}
    - PGID=${PGID}
    - TZ=${TZ}
    - AUTO_UPDATE=true   # сам обновляет Cardigann определения
  ports:
    - "9117:9117"
  volumes:
    - ./jackett/config:/config
    - ./media/downloads:/downloads   # blackhole для .torrent (вряд ли нужен, но безвреден)
  restart: unless-stopped
```

- Сеть `stack` — та же, где остальной *arr-стек, доступ по
  имени `jackett:9117` изнутри Docker.
- Порт 9117 публикуется на хост — UI Jackett для настройки.
- Объём `./jackett/config` создастся при первом старте под PUID/PGID.

### Интеграция с Prowlarr

Не автоматизируется в этой итерации (UI-настройка):
1. В Jackett UI добавить нужные индексеры (Rutracker, NNM-Club, Kinozal
   и т.п. — что найдётся).
2. В Prowlarr Settings → Indexers → Add → выбрать **Torznab** custom,
   URL `http://jackett:9117/api/v2.0/indexers/<id>/results/torznab/`,
   API key из Jackett. Один индексер на каждый трекер Jackett (это
   нормальная практика — позволяет per-tracker категории/настройки в
   Prowlarr).
3. Прогнать Test → если зелёный, Prowlarr автоматически синкает в
   Sonarr/Radarr.

## Безопасность

- Jackett UI **по умолчанию без аутентификации**. Это LAN-only стек на
  hermes.lan, доступ ограничен сетью. Включить admin-password в Jackett
  UI **после первого старта** (Settings → Admin password). Документирую
  как обязательный шаг в `homelab/README.md`.
- `setup-creds.sh.example` НЕ содержит реальный `TMPPW` (был жёстко
  зашит в существующем скрипте) — в шаблоне placeholder `<INITIAL_QB_TMP_PW>`.
- `.gitignore` пополнить: `homelab/.env`, `homelab/*.creds`,
  `homelab/setup-creds.sh` (без `.example`).

## Откат

- Удалить symlink, восстановить из `.bak.20260616-162516`:
  `cp /srv/stack/docker-compose.yml.bak.20260616-162516 /srv/stack/docker-compose.yml`
- `docker compose -f /srv/stack/docker-compose.yml up -d` — стек
  возвращается к до-Jackett состоянию.

## Шаги выполнения

1. Создать `homelab/docker-compose.yml` (копия текущего + Jackett-сервис).
2. Создать `homelab/.env.example`, `homelab/setup-creds.sh.example`,
   `homelab/README.md`.
3. Добавить в корневой `.gitignore` пути секретов homelab.
4. Закоммитить и запушить (CI не затрагивается — это инфра, не
   приложение).
5. На сервере: `git pull`, бэкап текущего compose уже есть, заменить
   `/srv/stack/docker-compose.yml` на симлинк, поднять Jackett:
   `docker compose up -d jackett`.
6. Проверить: `curl -s http://localhost:9117/UI/Dashboard` → 200,
   `docker ps | grep jackett` → Up.
7. Дальше — ручная настройка в Jackett/Prowlarr UI (вне этого спека).

## Тестирование

Это инфра-патч, юнит-тестов нет. Приёмочные проверки:
- Все 7 сервисов поднимаются (`docker ps` shows 7 stack containers Up).
- Существующие сервисы не пересоздаются заново (compose увидит, что
  только jackett новый — `Created`/`Started` только у него).
- Jackett UI отвечает 200 на `http://hermes.lan:9117/`.
- `ls -la /srv/stack/docker-compose.yml` показывает симлинк на
  `~braidner/mission-control/homelab/docker-compose.yml`.

## Открытые вопросы (не блокирующие)

- Стоит ли подключать к Jackett ещё и FlareSolverr для трекеров с
  Cloudflare-челленджем? Откладываю до момента, когда понадобится
  конкретный такой трекер.

# Homelab stack

Конфигурация homelab-стека на `hermes.lan` (Proxmox VM): AdGuard Home,
Jellyfin, Jackett, qBittorrent, TorrServer. Sonarr/Radarr/Prowlarr заменены
native media pipeline внутри Mission Control. Стек развёрнут в `/srv/stack/`
на 1ТБ диске.

`docker-compose.yml` здесь — каноничный источник конфигурации.
`/srv/stack/docker-compose.yml` на сервере — симлинк сюда.

## Структура

```
homelab/
├── docker-compose.yml           # этот файл — источник истины
├── .env.example                 # PUID/PGID/TZ шаблон
├── setup-creds.sh.example       # шаблон скрипта первоначальной настройки кред
└── README.md                    # этот файл
```

На сервере в `/srv/stack/`:

```
/srv/stack/
├── docker-compose.yml -> ~braidner/mission-control/homelab/docker-compose.yml   # симлинк
├── .env                         # реальные PUID/PGID/TZ (НЕ в git)
├── .creds                       # сгенерированные креды qB+Jellyfin (НЕ в git)
├── setup-creds.sh               # реальный скрипт настройки (НЕ в git)
├── adguard/, jellyfin/, jackett/, qbittorrent/, torrserver/                  # config volumes
└── media/                       # библиотека (movies, tv, downloads)
```

## Развёртывание с нуля

```bash
sudo mkdir -p /srv/stack && sudo chown braidner:braidner /srv/stack
cd /srv/stack
# Симлинк на репо (репо уже клонирован в ~/mission-control)
ln -s ~/mission-control/homelab/docker-compose.yml docker-compose.yml
# Заполнить .env и поднять
cp ~/mission-control/homelab/.env.example .env  # отредактировать под себя
docker compose up -d

# Первоначальная настройка кред (один раз)
cp ~/mission-control/homelab/setup-creds.sh.example setup-creds.sh
# Найти временный пароль qBittorrent:
docker logs qbittorrent 2>&1 | grep -i "temporary password"
# Подставить найденный пароль в INITIAL_QB_TMP_PW
nano setup-creds.sh
chmod +x setup-creds.sh && ./setup-creds.sh
```

## Обновление

```bash
cd ~/mission-control && git pull
# симлинк уже указывает на свежий compose
docker compose -f /srv/stack/docker-compose.yml pull
docker compose -f /srv/stack/docker-compose.yml up -d
```

## Безопасность (важно при первом подъёме Jackett)

**Jackett по умолчанию запускается без пароля на UI.** Сразу после
первого старта:
1. Открыть `http://hermes.lan:9117/`.
2. Settings → Admin password → задать пароль.
3. Save & reload.

Без пароля любой в LAN может править индексеры и видеть API key.

## Откат

Существующий бэкап старого compose:
`/srv/stack/docker-compose.yml.bak.20260616-162516`.

```bash
rm /srv/stack/docker-compose.yml
cp /srv/stack/docker-compose.yml.bak.20260616-162516 /srv/stack/docker-compose.yml
docker compose -f /srv/stack/docker-compose.yml up -d
```

## Порты (LAN-only через файрвол VM)

| Сервис      | Порт хоста | Назначение                               |
| ----------- | ---------- | ---------------------------------------- |
| AdGuard DNS | 53         | DNS (UDP+TCP), на LAN-IP 192.168.2.184   |
| AdGuard UI  | 8053       | веб-интерфейс/API                        |
| Jellyfin    | 8096       | медиа-сервер                             |
| Jackett     | 9117       | Torznab индексеры для Mission Control    |
| qBittorrent | 8080       | торрент-клиент UI                        |
| qBittorrent | 6881       | peer (TCP+UDP), macvlan 192.168.2.190    |

## Интеграция Jackett → Mission Control

После того как Jackett поднят и в нём добавлены нужные индексеры (UI:
Add Indexer → выбрать трекер → скопировать Torznab Feed URL):

1. В `.env` дашборда задать `JACKETT_URL=http://host.docker.internal:9117`.
2. `JACKETT_API_KEY` взять из Jackett Dashboard.
3. `JACKETT_INDEXERS=all` или список id через запятую.
4. Mission Control ищет релизы напрямую через Torznab categories 2000/5000.

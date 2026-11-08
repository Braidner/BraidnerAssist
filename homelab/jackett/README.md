# Музыкальный каталог Internet Archive для Jackett

Определение `pultra-live-flac.yml` добавляет открытые концертные записи из [Live Music Archive](https://archive.org/details/etree). В выдачу попадают записи, для которых каталог указывает оба формата — FLAC и Archive BitTorrent. Поиск по названию или исполнителю возвращает до 40 записей, начиная с недавно опубликованных в архиве. Пустой запрос открывает свежие публикации.

Одна загрузка содержит содержимое архивного торрента. Вместе с FLAC могут прийти обложки и копии для прослушивания. Размер в выдаче берётся из метаданных записи. Архив не сообщает число сидов.

## Установка на hermes.lan

Скопируйте определение из корня репозитория на сервере.

```sh
config_dir=/srv/stack/jackett/config
install -d "$config_dir/cardigann/definitions" "$config_dir/Jackett/Indexers"
install -m 0644 homelab/jackett/pultra-live-flac.yml "$config_dir/cardigann/definitions/"
```

Чтобы включить публичный индексатор при первой установке, создайте его собственный файл конфигурации. При обновлении существующий файл сохраняется.

```sh
indexer_config="$config_dir/Jackett/Indexers/pultra-live-flac.json"
if [ ! -e "$indexer_config" ]; then
  cat > "$indexer_config" <<'JSON'
[{"id":"sitelink","type":"inputstring","name":"Site Link","value":"https://archive.org/"}]
JSON
fi
docker restart jackett
```

В панели Jackett у настроенных индексаторов появится **Live Music Archive (FLAC)**. Если у Pultra задано `JACKETT_INDEXERS=all`, этот источник включится автоматически. Если перечислены отдельные идентификаторы, добавьте к ним `pultra-live-flac` через настройки интеграций.

## Проверка

1. На странице «Музыка → Discovery» откройте новые публикации. Источник подписан **Live Music Archive (FLAC)**.
2. Введите `Grateful Dead`. В результатах появятся записи группы с названием площадки и датой концерта. Релизы можно найти и при пустой музыкальной библиотеке Jellyfin.
3. Для приёма загрузок настройте каталог типа Music в Jellyfin и общую папку с qBittorrent по [инструкции homelab](../README.md). Метаданные торрента передаются на backend через Jackett, после полного скачивания Pultra запрашивает обновление библиотеки.

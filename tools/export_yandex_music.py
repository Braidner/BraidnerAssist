#!/usr/bin/env python3
"""Export owned/saved Yandex Music playlists and liked tracks as Pultra JSON (no audio).
Run locally: python3 tools/export_yandex_music.py ~/Downloads/music-playlists.json
An existing Yandex Music OAuth token is read from a hidden prompt or YANDEX_MUSIC_TOKEN.
"""
import argparse
import getpass
import json
import os
import sys
from pathlib import Path
from urllib import parse, request
from urllib.error import HTTPError, URLError

ORIGIN = "https://api.music.yandex.net"

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None  # Never forward the user's authorization header to another host.

def export(call):
    uid = str(call("/account/status")["account"]["uid"])
    def playlist_id(p):
        return (str(p["owner"]["uid"]), str(p["kind"]))
    def title_artist(t):
        artist = ", ".join(a["name"] for a in t.get("artists", []) if a.get("name"))
        return {"artist": artist, "title": t["title"]} if artist and t.get("title") else None
    def tracks(refs):
        found = {}
        for r in refs:
            t = r.get("track") or r
            song = title_artist(t)
            if song:
                found[str(t.get("id", r.get("id")))]=song
        ids = [str((r.get("track") or r)["id"]) for r in refs]
        missing = list(dict.fromkeys(x for x in ids if x not in found))
        for start in range(0, len(missing), 100):
            for t in call("/tracks", {"track-ids": ",".join(missing[start:start+100])}):
                song = title_artist(t)
                if song: found[str(t["id"])]=song
        return [found[i] for i in ids if i in found], [i for i in ids if i not in found]

    likes=call("/users/"+parse.quote(uid,safe="")+"/likes/tracks")["library"]["tracks"]
    favorites, unavailable=tracks(likes)
    result=[{"name":"Мне нравится","tracks":favorites}]
    skipped=[{"playlist":"Мне нравится","trackIds":unavailable}] if unavailable else []
    owned=call("/users/"+parse.quote(uid,safe="")+"/playlists/list")
    saved=call("/users/"+parse.quote(uid,safe="")+"/likes/playlists")
    ids=dict.fromkeys(playlist_id(p.get("playlist",p)) for p in [*owned,*saved])
    names={"Мне нравится"}
    for owner, kind in ids:
        if owner==uid and kind=="3": continue  # the liked-tracks collection above
        p=call("/users/"+parse.quote(owner,safe="")+"/playlists/"+parse.quote(kind,safe=""))
        refs=p.get("tracks")
        if refs is None or p.get("trackCount",len(refs))!=len(refs):
            raise ValueError("Яндекс вернул неполный плейлист; прежняя выгрузка не изменена.")
        name=p["title"]
        if name in names: name=f"{name} ({owner}:{kind})"
        names.add(name)
        songs,missing=tracks(refs)
        result.append({"name":name,"tracks":songs})
        if missing: skipped.append({"playlist":name,"trackIds":missing})
    return {"playlists":result,"unavailable":skipped}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("out",type=Path);args=p.parse_args()
    if args.out.exists():p.error("Выходной файл уже существует. Укажите новое имя.")
    token=os.environ.get("YANDEX_MUSIC_TOKEN") or getpass.getpass("Токен Яндекс Музыки (ввод скрыт): ").strip()
    if not token:p.error("Нужен токен Яндекс Музыки")
    client=request.build_opener(NoRedirect())
    def call(path,body=None):
        data=parse.urlencode(body).encode() if body is not None else None
        req=request.Request(ORIGIN+path,data=data,headers={"Authorization":"OAuth "+token,"Accept":"application/json"})
        with client.open(req,timeout=35) as res:return json.load(res)["result"]
    try:
        data=export(call)
        with open(args.out,"x",encoding="utf-8",opener=lambda path, flags: os.open(path,flags,0o600)) as out:
            json.dump(data,out,ensure_ascii=False)
        lost=sum(len(p["trackIds"]) for p in data["unavailable"])
        print(f"Плейлистов: {len(data['playlists'])}. Недоступных треков: {lost} (список в unavailable).")
    except HTTPError as e:sys.exit(f"Яндекс вернул HTTP {e.code}. Файл не создан.")
    except (URLError,ValueError,KeyError,TypeError) as e:sys.exit(f"Не удалось получить полный ответ от Яндекса ({type(e).__name__}). Файл не создан.")
if __name__=="__main__":main()

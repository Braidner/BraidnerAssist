#!/usr/bin/env python3
"""Create the music library for the local homelab compose stack. Safe to rerun."""
import json
import os
import sys
from http.client import HTTPConnection
from pathlib import Path, PurePosixPath
from urllib.parse import urlencode


def api_key():
    if os.environ.get("JELLYFIN_API_KEY"):
        return os.environ["JELLYFIN_API_KEY"]
    for line in Path("/srv/stack/.creds").read_text().splitlines():
        if line.startswith("JELLYFIN_API_KEY="):
            value = line.split("=", 1)[1].strip().strip("\"'")
            if value:
                return value
    raise ValueError("JELLYFIN_API_KEY is missing from /srv/stack/.creds")


def folders(key, create=None):
    conn = HTTPConnection("127.0.0.1", 8096, timeout=20)
    route = "/Library/VirtualFolders"
    try:
        headers = {"X-Emby-Token": key, "Accept": "application/json"}
        if create:
            query = urlencode({"name": "Music", "collectionType": "music", "paths": create, "refreshLibrary": "false"})
            conn.request("POST", f"{route}?{query}", body=b"{}", headers={**headers, "Content-Type": "application/json"})
        else:
            conn.request("GET", route, headers=headers)
        res = conn.getresponse()
        if not 200 <= res.status < 300:
            raise RuntimeError(f"Jellyfin {route} returned HTTP {res.status}")
        return None if create else json.load(res)
    finally:
        conn.close()


def configured(libraries, path):
    for library in libraries:
        locations = [PurePosixPath(value) for value in library.get("Locations", [])]
        if path in locations and library.get("CollectionType") == "music":
            return True
        if library.get("Name", "").casefold() == "music" or path in locations:
            raise ValueError("An existing library conflicts with Music. Check its type and paths in Jellyfin.")
    return False


def main():
    directory = os.environ.get("MEDIA_MUSIC", "music")
    if any(part in {"", ".", ".."} for part in directory.split("/")):
        raise ValueError("MEDIA_MUSIC must name a subdirectory of MEDIA_HOST_PATH")
    root = Path(os.environ.get("MEDIA_HOST_PATH", "/srv/stack/media"))
    target = root / directory
    path = PurePosixPath("/media") / directory
    if not root.is_dir() or target.resolve() != root.resolve() / directory:
        raise ValueError("Check MEDIA_HOST_PATH and the destination directory")
    key = api_key()
    exists = configured(folders(key), path)
    target.mkdir(parents=True, exist_ok=True)
    if not exists:
        folders(key, create=str(path))
        if not configured(folders(key), path):
            raise RuntimeError("New music library could not be verified")
    print(f"{'Existing' if exists else 'Created'} Jellyfin music library at {path}")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        sys.exit(str(error))

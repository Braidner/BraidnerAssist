// Детальная страница фильма (/media/movie/:id) — TMDB/Jellyfin detail: шапка с
// метаданными, встроенный плеер, поиск релизов и rail привязанных раздач.

import {useEffect, useRef, useState} from "react";
import {useParams, useNavigate, useLocation, useSearchParams} from "react-router-dom";
import {
	ReleasePicker,
	TorrentRailCard,
} from "./shared/mediaShared.tsx";
import {
	DetailHero,
	SimilarRail,
	CardRail,
	detailHeroButtonClass,
	tmdbRailCards,
	type DetailPlayer,
} from "./shared/mediaDetail.tsx";
import {MediaRail} from "./shared/mediaRails.tsx";
import {cn} from "../../lib/cn.ts";
import {media as ms} from "./shared/mediaStyles.ts";
import {
	getMoviePageDetail,
	getMovieDiscoverDetail,
	getMediaTitleDetail,
	addTitle,
	getMediaPlayUrl,
	jellyfinPosterUrl,
	posterUrl,
	getMediaLibrary,
	getDiscoverSimilar,
	getDiscoverCollection,
	getTitleTorrents,
	backdropUrl,
	type MoviePageDetail,
	type MediaData,
	type LibraryItem,
	type TmdbItem,
	type TorrentRailItem,
} from "@/lib/api.ts";
import {useToast} from "../../components/ui/Toast.tsx";

type AutoplayLocationState = {
	from?: string;
	scrollY?: number;
	mediaReturn?: boolean;
	autoplay?: boolean;
	autoplayItemId?: string;
	autoplayTitle?: string;
} | null;

export function MediaMoviePage({
	                               media,
	                               onMediaUpdate,
	                               source = "tmdb",
                               }: {
	media: MediaData;
	onMediaUpdate: () => void;
	source?: "tmdb" | "jellyfin" | "discover";
}) {
	const {id = ""} = useParams();
	const nav = useNavigate();
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const toast = useToast();
	const [d, setD] = useState<MoviePageDetail | null | "loading">("loading");
	const [library, setLibrary] = useState<LibraryItem[]>([]);
	const [player, setPlayer] = useState<DetailPlayer>(null);
	const [busy, setBusy] = useState(false);
	const [act, setAct] = useState<string | null>(null);
	const [showPicker, setShowPicker] = useState(false);
	const autoplayConsumedRef = useRef<string | null>(null);
	const locationState = location.state as AutoplayLocationState;
	const backTarget = locationState?.from ?? (source === "discover" ? "/media/discover" : "/media");
	const goBack = () => {
		if (locationState?.mediaReturn || locationState?.from) {
			nav(-1);
			return;
		}
		nav(backTarget, {replace: true});
	};

	// Основной маршрут использует TMDB id; legacy routes оставлены для старых ссылок.
	const fetchDetail = () =>
		source === "jellyfin"
			? getMoviePageDetail(id)
			: source === "discover"
				? getMovieDiscoverDetail(Number(id))
				: getMediaTitleDetail("movie", Number(id));

	useEffect(() => {
		setD("loading");
		fetchDetail().then((r) => setD(r));
		getMediaLibrary().then(setLibrary);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id, source]);

	const play = async () => {
		const playId = d && d !== "loading" ? d.jellyfinId : "";
		if (!playId) {
			toast.error("Файл ещё не появился в Jellyfin");
			return;
		}
		setBusy(true);
		const url = await getMediaPlayUrl(playId);
		setBusy(false);
		if (url && d && d !== "loading") setPlayer({url, title: d.title});
		else toast.error("Не удалось запустить воспроизведение");
	};

	// TMDB-подборки: похожее + франшиза (коллекция). Заводятся как только знаем tmdbId.
	const [tmdbSimilar, setTmdbSimilar] = useState<TmdbItem[]>([]);
	const [collection, setCollection] = useState<{ name: string; items: TmdbItem[] } | null>(null);
	const [titleTorrents, setTitleTorrents] = useState<TorrentRailItem[]>([]);
	const detTmdbId = d && d !== "loading" ? d.tmdbId : null;
	const refreshTitleTorrents = () => {
		if (detTmdbId == null) {
			setTitleTorrents([]);
			return;
		}
		getTitleTorrents("movie", detTmdbId).then(setTitleTorrents);
	};
	useEffect(() => {
		if (!media.tmdb || detTmdbId == null) {
			setTmdbSimilar([]);
			setCollection(null);
			return;
		}
		getDiscoverSimilar("movie", detTmdbId).then(setTmdbSimilar);
		getDiscoverCollection(detTmdbId).then(setCollection);
	}, [media.tmdb, detTmdbId]);

	useEffect(() => {
		refreshTitleTorrents();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [detTmdbId]);

	const openTmdb = (it: TmdbItem) => {
		nav(`/media/${it.kind === "movie" ? "movie" : "series"}/${it.tmdbId}`);
	};

	useEffect(() => {
		const state = location.state as AutoplayLocationState;
		const shouldAutoplay =
			state?.autoplay || searchParams.get("autoplay") === "1";
		if (d === "loading" || !d || !shouldAutoplay) return;
		if (!d.hasFile) return;

		const autoplayId = searchParams.get("play") ?? state?.autoplayItemId ?? id;
		const key = `${source}:${id}:${autoplayId}`;
		if (autoplayConsumedRef.current === key) return;
		autoplayConsumedRef.current = key;

		void play();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [d, id, location.state, searchParams, source]);

	if (d === "loading")
		return (
			<div className={ms.page}>
				<div className={cn(ms.empty, "mt-10")}>Загружаем…</div>
			</div>
		);
	if (!d)
		return (
			<div className={ms.page}>
				<div className={cn(ms.empty, "mt-10")}>Не удалось загрузить фильм.</div>
			</div>
		);

	const det = d;

	const addToLib = async () => {
		if (det.tmdbId == null) return;
		setAct("add");
		const ok = await addTitle("movie", det.tmdbId);
		setAct(null);
		if (ok) {
			toast.success(`«${det.title}» добавлен в библиотеку — ищем релиз`);
			setShowPicker(true);
			onMediaUpdate();
			fetchDetail().then(setD);
		} else toast.error("Не удалось добавить в библиотеку");
	};

	const posterSrc = det.posterRemote
		? posterUrl(det.posterRemote)
		: det.jellyfinId
			? jellyfinPosterUrl(det.jellyfinId)
			: undefined;
	const backdropSrc = det.backdropRemote
	&& !det.jellyfinId
		? backdropUrl(det.backdropRemote)
		: undefined;

	// Похожие — из библиотеки (фильмы)
	const similarItems = library
		.filter((x) => x.id !== id && x.type === "Movie")
		.slice(0, 8);
	const inLibrary = det.inLibrary || det.hasFile || Boolean(det.jellyfinId);

	return (
		<div>
				<div className={ms.page}>
					<DetailHero
					kindLabel="ФИЛЬМ"
					title={det.title}
					jellyfinId={det.jellyfinId}
					backdropSrc={backdropSrc}
					posterSrc={posterSrc}
					player={player}
					overview={det.overview}
					year={det.year}
					runtimeLabel={det.runtime ? `${det.runtime} мин` : null}
					rating={det.rating}
					genres={det.genres}
					actions={
						<>
							{det.hasFile && det.jellyfinId && (
								<button
									className={detailHeroButtonClass("primary")}
									disabled={busy}
									onClick={play}
								>
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="currentColor"
									>
										<polygon points="6,3 21,12 6,21"/>
									</svg>
									{busy ? "…" : "Смотреть"}
								</button>
							)}
							{!det.hasFile && inLibrary && det.tmdbId != null && (
								<button
									className={detailHeroButtonClass("primary")}
									disabled={det.tmdbId == null}
									onClick={() => setShowPicker((v) => !v)}
								>
									{showPicker ? "Скрыть релизы" : "Найти релиз"}
								</button>
							)}
							{!inLibrary && det.tmdbId != null && (
								<button
									className={detailHeroButtonClass("primary")}
									disabled={act === "add"}
									title="Зарегистрировать тайтл и выбрать релиз"
									onClick={addToLib}
								>
									{act === "add" ? "…" : "➕ В библиотеку"}
								</button>
							)}
							{inLibrary && (
								<button
									className={detailHeroButtonClass("active")}
									type="button"
									title="Тайтл уже добавлен. Позже второй клик будет удалять из библиотеки."
								>
									<span className="size-2 rounded-full bg-accent shadow-[0_0_18px_rgba(229,51,51,0.75)]" />
									В библиотеке
								</button>
							)}
							{(det.hasFile || !inLibrary) && (
								<button
									className={detailHeroButtonClass("secondary")}
									disabled={det.tmdbId == null}
									title={det.tmdbId == null ? "Нет tmdbId" : ""}
									onClick={() => setShowPicker((v) => !v)}
								>
									{showPicker ? "Скрыть поиск" : "Поиск"}
								</button>
							)}
						</>
					}
					onBack={goBack}
					onQueueClick={() => setShowPicker((v) => !v)}
					onClosePlayer={() => setPlayer(null)}
				/>
			</div>

			{showPicker && det.tmdbId != null && (
				<ReleasePicker
					params={{type: "movie", id: det.tmdbId}}
					downloads={media.downloads}
					onGrabbed={() => {
						onMediaUpdate();
						refreshTitleTorrents();
						window.setTimeout(refreshTitleTorrents, 2_000);
					}}
				/>
			)}
			{collection && collection.items.length > 1 && (
				<CardRail
					label={`КОЛЛЕКЦИЯ · ${collection.name}`}
					cards={tmdbRailCards(
						collection.items.filter((x) => x.tmdbId !== det.tmdbId),
						openTmdb,
					)}
				/>
			)}
			{tmdbSimilar.length > 0 ? (
				<CardRail label="ПОХОЖИЕ" cards={tmdbRailCards(tmdbSimilar, openTmdb)}/>
			) : (
				<SimilarRail items={similarItems}/>
			)}

			{titleTorrents.length > 0 && (
				<MediaRail title="Медиа" countLabel={String(titleTorrents.length)} className="mt-8">
					{titleTorrents.map((it) => (
						<TorrentRailCard key={it.infohash} item={it} />
					))}
				</MediaRail>
			)}
			</div>
	);
}

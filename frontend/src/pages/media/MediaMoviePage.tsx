// Детальная страница фильма (/media/movie/:id) — native media detail: шапка с
// метаданными, статус файла (качество/размер или «отсутствует»), встроенный
// плеер + игра на устройство, поиск раздач и ручной импорт застрявшей раздачи.

import {useEffect, useRef, useState} from "react";
import {useParams, useNavigate, useLocation, useSearchParams} from "react-router-dom";
import {
	ReleasePicker,
	ImportDrawer,
} from "./shared/mediaShared.tsx";
import {
	DetailBody,
	DetailHero,
	DetailStatusBadges,
	SimilarRail,
	CardRail,
	tmdbRailCards,
	StuckImportButtons,
	type DetailPlayer,
} from "./shared/mediaDetail.tsx";
import {TorrentFilePicker, ContentTorrents} from "./shared/mediaPick.tsx";
import {cn} from "../../lib/cn.ts";
import {media as ms} from "./shared/mediaStyles.ts";
import {
	getMoviePageDetail,
	getMovieDiscoverDetail,
	addTitle,
	getMediaPlayUrl,
	getMediaDevices,
	playOnDevice,
	jellyfinPosterUrl,
	posterUrl,
	seasonSearch,
	setMonitored,
	getMediaLibrary,
	getDiscoverSimilar,
	getDiscoverCollection,
	tmdbResolveTvdb,
	backdropUrl,
	type MoviePageDetail,
	type DownloadItem,
	type MediaData,
	type PlayDevice,
	type LibraryItem,
	type TmdbItem,
} from "@/lib/api.ts";
import {useToast} from "../../components/ui/Toast.tsx";

const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
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
	                               source = "library",
                               }: {
	media: MediaData;
	onMediaUpdate: () => void;
	source?: "library" | "discover";
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
	const [showPick, setShowPick] = useState(false);
	const [pickReload, setPickReload] = useState(0);
	const [importItem, setImportItem] = useState<DownloadItem | null>(null);
	const [devices, setDevices] = useState<PlayDevice[]>([]);
	const [castOpen, setCastOpen] = useState(false);
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

	// discover-карточка резолвится по tmdbId (id = tmdbId), library — по Jellyfin-id.
	const fetchDetail = () =>
		source === "discover"
			? getMovieDiscoverDetail(Number(id))
			: getMoviePageDetail(id);

	useEffect(() => {
		setD("loading");
		fetchDetail().then((r) => setD(r));
		getMediaDevices().then(setDevices);
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
	const detTmdbId = d && d !== "loading" ? d.tmdbId : null;
	useEffect(() => {
		if (!media.tmdb || detTmdbId == null) {
			setTmdbSimilar([]);
			setCollection(null);
			return;
		}
		getDiscoverSimilar("movie", detTmdbId).then(setTmdbSimilar);
		getDiscoverCollection(detTmdbId).then(setCollection);
	}, [media.tmdb, detTmdbId]);

	const openTmdb = (it: TmdbItem) => {
		if (it.kind === "movie") nav(`/media/discover/movie/${it.tmdbId}`);
		else tmdbResolveTvdb(it.tmdbId).then((tvdb) => {
			if (tvdb) nav(`/media/discover/series/${tvdb}`);
			else toast.error("Не удалось открыть сериал: TMDB не вернул tvdbId");
		});
	};

	useEffect(() => {
		const state = location.state as AutoplayLocationState;
		const shouldAutoplay =
			state?.autoplay || searchParams.get("autoplay") === "1";
		if (source !== "library" || d === "loading" || !d || !shouldAutoplay) return;
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

	const toggleMonitor = async (val: boolean) => {
		if (det.tmdbId == null) return;
		setAct("mon");
		const ok = await setMonitored("movie", det.tmdbId, val);
		setAct(null);
		if (ok) {
			setD((p) => (p && p !== "loading" ? {...p, monitored: val} : p));
			toast.success(val ? "Мониторинг включён" : "Мониторинг выключен");
		} else toast.error("Не удалось изменить мониторинг");
	};
	const findMovie = async () => {
		if (det.tmdbId == null) return;
		setAct("find");
		const ok = await seasonSearch("movie", det.tmdbId);
		setAct(null);
		if (ok) toast.success("Поиск фильма запущен");
		else toast.error("Не удалось запустить поиск");
	};
	const addToLib = async () => {
		if (det.tmdbId == null) return;
		setAct("add");
		const ok = await addTitle("movie", det.tmdbId);
		setAct(null);
		if (ok) {
			toast.success(`«${det.title}» добавлен в библиотеку — ищем релиз`);
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
	const stuck = [
		...new Map(
			media.downloads
				.filter(
					(x) =>
						x.importPending &&
						norm(x.title).includes(norm(det.title)),
				)
				.map((x) => [x.downloadId ?? x.hash, x]),
		).values(),
	];

	// Похожие — из библиотеки (фильмы)
	const similarItems = library
		.filter((x) => x.id !== id && x.type === "Movie")
		.slice(0, 8);

	return (
		<div>
			<div className={ms.page}>
				{importItem && (
					<ImportDrawer
						item={importItem}
						type="movie"
						onClose={() => setImportItem(null)}
						onDone={() => {
							setImportItem(null);
							onMediaUpdate();
							fetchDetail().then(setD);
						}}
					/>
				)}

				<DetailHero
					kindLabel="ФИЛЬМ"
					title={det.title}
					jellyfinId={det.jellyfinId}
					backdropSrc={backdropSrc}
					posterSrc={posterSrc}
					player={player}
					year={det.year}
					runtimeLabel={det.runtime ? `${det.runtime} мин` : null}
					rating={det.rating}
					genres={det.genres}
					onBack={goBack}
					onQueueClick={() => setShowPicker((v) => !v)}
					onClosePlayer={() => setPlayer(null)}
				/>

				<DetailBody className="pt-5">
					{det.overview && (
						<p className="max-w-[860px] font-ui text-lead leading-[1.75] text-white/[0.58] m-0 mb-[30px]">
							{det.overview}
						</p>
					)}

					<DetailStatusBadges
						status={det.status}
						inMonitor={det.inMonitor}
						monitorName="native monitor"
						provider={det.studio}
						file={{
							hasFile: det.hasFile,
							quality: det.quality,
							size: det.size,
						}}
					/>

					{/* Actions */}
					<div className="flex gap-3 mb-7">
						{det.hasFile && det.jellyfinId && (
							<button
								className="flex items-center gap-2 px-[30px] py-[13px] rounded-lg border-none cursor-pointer font-ui text-lead-lg font-bold tracking-2 bg-[var(--bc,var(--accent))] text-white transition-all hover:brightness-[1.18] hover:-translate-y-0.5"
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
						{det.hasFile && det.jellyfinId && devices.length > 0 && (
							<div className="relative">
								<button
									className={ms.button.iconSm}
									title="Играть на устройстве"
									onClick={() => setCastOpen((v) => !v)}
								>
									📺
								</button>
								{castOpen && (
									<div
										className="absolute top-[30px] right-0 min-w-[140px] p-1.5 rounded-xl flex flex-col gap-1 z-10 bg-surface border border-hair">
										{devices.map((dev) => (
											<button
												key={dev.id}
												className="text-left bg-none border-none text-ink font-[inherit] px-2 py-1.5 rounded-lg cursor-pointer hover:bg-accent/[0.18] disabled:opacity-50 disabled:cursor-default"
												onClick={() => {
													playOnDevice(dev.id, det.jellyfinId);
													setCastOpen(false);
												}}
											>
												{dev.deviceName}
											</button>
										))}
									</div>
								)}
							</div>
						)}
						{!det.inMonitor && !det.hasFile && det.tmdbId != null && (
							<button
								className={ms.button.accentSm}
								disabled={act === "add"}
								title="Добавить в native monitor и запустить поиск"
								onClick={addToLib}
							>
								{act === "add" ? "…" : "➕ В библиотеку"}
							</button>
						)}
						{det.inMonitor && det.tmdbId != null && (
							<>
								<button
									className={cn(
										ms.button.sm,
										det.monitored && ms.button.accentSm,
									)}
									disabled={act === "mon"}
									title={det.monitored ? "Снять с мониторинга" : "Мониторить"}
									onClick={() => toggleMonitor(!det.monitored)}
								>
									{act === "mon"
										? "…"
										: det.monitored
											? "★ Мониторится"
											: "☆ Мониторить"}
								</button>
								{!det.hasFile && (
									<button
										className={ms.button.sm}
										disabled={act === "find"}
										title="Найти фильм (force search)"
										onClick={findMovie}
									>
										{act === "find" ? "…" : "⬇ Найти"}
									</button>
								)}
							</>
						)}
						<StuckImportButtons
							items={stuck}
							label="⚠ Импорт застрявшей"
							onSelect={setImportItem}
						/>
					</div>

					{/* Раздачи */}
					<div style={{marginTop: 20}}>
						<div className="font-ui text-label font-extrabold tracking-section uppercase text-muted mb-4">РАЗДАЧИ</div>
						<button
							className={cn(ms.button.sm, "mb-2")}
							disabled={det.tmdbId == null}
							title={det.tmdbId == null ? "Нет tmdbId" : ""}
							onClick={() => setShowPicker((v) => !v)}
						>
							{showPicker ? "Скрыть" : "🔍 Найти раздачу"}
						</button>
						{showPicker && det.tmdbId != null ? (
							<ReleasePicker
								params={{type: "movie", id: det.tmdbId}}
								downloads={media.downloads}
								onGrabbed={() => {
									onMediaUpdate();
									setPickReload((n) => n + 1);
								}}
							/>
						) : (
							!showPicker && (
								<div className={ms.empty}>
									Нажми «Найти», чтобы искать раздачи с нужной озвучкой/качеством.
								</div>
							)
						)}
					</div>

					{/* Пофайловый выбор файла из торрента (Media v2) */}
					<div style={{marginTop: 16}}>
						<button
							className={cn(ms.button.sm, "mb-2")}
							onClick={() => setShowPick((v) => !v)}
						>
							{showPick ? "Скрыть торрент" : "🔍 Скачать из торрента"}
						</button>
						{showPick && (
							<TorrentFilePicker
								contentType="movie"
								tmdbId={det.tmdbId}
								title={det.title}
								onGrabbed={() => setPickReload((n) => n + 1)}
							/>
						)}
					</div>
				</DetailBody>
			</div>
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
			{/* Качается из торрента (Media v2) */}
			<ContentTorrents
				contentType="movie"
				tmdbId={det.tmdbId}
				reloadKey={pickReload}
			/>
		</div>
	);
}

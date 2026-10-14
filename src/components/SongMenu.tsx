import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { coverArtUrl, createPlaylist, updatePlaylist } from "@/api/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { refreshPlaylists, usePlaylists } from "@/lib/playlists";
import { copySongLink } from "@/lib/share";
import { closeSongMenu, showToast, useSongMenuState, type SongMenuRequest } from "@/lib/songMenu";
import { useTrackStar } from "@/lib/trackStar";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, HeartIcon, PlusIcon, QueueAddIcon, QueueIcon, ShareIcon } from "./icons";

/** The song menu and its confirmations, for the whole app (see lib/songMenu.ts). */
export function SongMenu() {
  const { menu, toast } = useSongMenuState();
  const { pathname } = useLocation();

  // Navigating (e.g. "Go to album", or the back button) closes it.
  useEffect(closeSongMenu, [pathname]);

  return (
    <>
      {menu && <MenuPopup key={`${menu.track.id}-${menu.x}-${menu.y}`} request={menu} />}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-bottom)+8.5rem)] z-[70] flex justify-center px-4 md:bottom-28"
        >
          <span className="animate-fade-in rounded-md bg-white px-4 py-2 text-sm font-semibold text-black shadow-xl">
            {toast.text}
          </span>
        </div>
      )}
    </>
  );
}

function MenuPopup({ request }: { request: SongMenuRequest }) {
  const { track } = request;
  // Touch screens get a sheet from the bottom, the rest a menu at the pointer.
  const isTouch = useMediaQuery("(hover: none)");
  const [view, setView] = useState<"main" | "playlists">("main");
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Keep the menu on screen: open it up and/or to the left near the edges.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (isTouch || !panel) return;
    const { width, height } = panel.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(request.x, window.innerWidth - width - margin));
    const top = request.y + height > window.innerHeight - margin ? Math.max(margin, request.y - height) : request.y;
    setPosition({ left, top });
  }, [isTouch, request.x, request.y, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSongMenu();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[60] ${isTouch ? "flex items-end bg-black/60" : ""}`}
      onClick={closeSongMenu}
      onContextMenu={(e) => {
        e.preventDefault();
        closeSongMenu();
      }}
    >
      <div
        ref={panelRef}
        role="menu"
        aria-label={`${track.title} options`}
        onClick={(e) => e.stopPropagation()}
        className={
          isTouch
            ? "max-h-[80%] w-full animate-slide-up overflow-y-auto rounded-t-xl bg-spotify-highlight-black px-2 pb-[calc(var(--safe-bottom)+0.75rem)] pt-2"
            : "fixed max-h-[70vh] w-64 overflow-y-auto rounded-md bg-spotify-highlight-black p-1 shadow-2xl ring-1 ring-white/10"
        }
        style={isTouch ? undefined : { left: position?.left ?? request.x, top: position?.top ?? request.y, visibility: position ? undefined : "hidden" }}
      >
        {isTouch && (
          <div className="mb-1 flex items-center gap-3 border-b border-white/10 px-3 pb-3 pt-2">
            <img src={coverArtUrl(track.coverArt, 80)} alt="" className="h-12 w-12 flex-shrink-0 rounded object-cover" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{track.title}</span>
              <span className="block truncate text-sm text-spotify-gray">{track.artist}</span>
            </span>
          </div>
        )}
        {view === "main" ? (
          <MainItems request={request} onShowPlaylists={() => setView("playlists")} large={isTouch} />
        ) : (
          <PlaylistItems request={request} onBack={() => setView("main")} large={isTouch} />
        )}
      </div>
    </div>
  );
}

function MainItems({
  request,
  onShowPlaylists,
  large,
}: {
  request: SongMenuRequest;
  onShowPlaylists: () => void;
  large: boolean;
}) {
  const { track } = request;
  const { inJam, addNext, enqueue } = usePlayer();
  const own = useTrackStar(track);
  const { username } = useAuth();
  const navigate = useNavigate();
  const starred = request.starred ?? own.isStarred;

  function run(action: () => void, toast?: string) {
    action();
    closeSongMenu();
    if (toast) showToast(toast);
  }

  return (
    <>
      {!inJam && (
        <Item large={large} icon={<QueueIcon className="h-4 w-4" />} onClick={() => run(() => addNext([track]), "Playing next")}>
          Play next
        </Item>
      )}
      <Item
        large={large}
        icon={<QueueAddIcon className="h-4 w-4" />}
        onClick={() => run(() => enqueue([track]), inJam ? "Added to the Jam" : "Added to queue")}
      >
        {inJam ? "Add to Jam queue" : "Add to queue"}
      </Item>
      <Item large={large} icon={<PlusIcon className="h-4 w-4" />} onClick={onShowPlaylists} trailing={<ChevronRightIcon className="h-4 w-4" />}>
        Add to playlist
      </Item>
      {request.onRemoveFromPlaylist && (
        <Item large={large} icon={<span className="block h-4 w-4 text-center leading-4">−</span>} onClick={() => run(request.onRemoveFromPlaylist!, "Removed from this playlist")}>
          Remove from this playlist
        </Item>
      )}
      <Item
        large={large}
        icon={<HeartIcon filled={starred} className={`h-4 w-4 ${starred ? "text-spotify-green" : ""}`} />}
        onClick={() =>
          run(
            () => (request.onToggleStar ? request.onToggleStar() : void own.toggle()),
            starred ? "Removed from Liked Songs" : "Added to Liked Songs",
          )
        }
      >
        {starred ? "Remove from Liked Songs" : "Save to Liked Songs"}
      </Item>
      <Item
        large={large}
        icon={<ShareIcon className="h-4 w-4" />}
        onClick={() => {
          closeSongMenu();
          void copySongLink(track.id, username).then((ok) =>
            showToast(ok ? "Link copied: send it to someone on this server" : "Couldn't copy the link"),
          );
        }}
      >
        Share
      </Item>
      {request.onSelect && (
        <Item large={large} icon={<CheckIcon className="h-4 w-4" />} onClick={() => run(request.onSelect!)}>
          Select
        </Item>
      )}
      {(track.albumId || track.artistId) && <hr className="my-1 border-white/10" />}
      {track.albumId && (
        <Item large={large} onClick={() => run(() => navigate(`/album/${track.albumId}`))}>
          Go to album
        </Item>
      )}
      {track.artistId && (
        <Item large={large} onClick={() => run(() => navigate(`/artist/${track.artistId}`))}>
          Go to artist
        </Item>
      )}
    </>
  );
}

function PlaylistItems({ request, onBack, large }: { request: SongMenuRequest; onBack: () => void; large: boolean }) {
  const { track } = request;
  const { username } = useAuth();
  const playlists = usePlaylists();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  // Navidrome only lets the owner add songs to a playlist.
  const own = playlists?.filter((p) => !p.owner || p.owner === username);

  async function addTo(playlistId: string, playlistName: string) {
    closeSongMenu();
    try {
      await updatePlaylist(playlistId, { songIdToAdd: [track.id] });
      refreshPlaylists();
      showToast(`Added to ${playlistName}`);
    } catch {
      showToast(`Couldn't add it to ${playlistName}`);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    closeSongMenu();
    try {
      const playlist = await createPlaylist(trimmed);
      await addTo(playlist.id, playlist.name);
    } catch {
      showToast("Couldn't create the playlist");
    }
  }

  return (
    <>
      <Item large={large} icon={<ChevronLeftIcon className="h-4 w-4" />} onClick={onBack}>
        Add to playlist
      </Item>
      <hr className="my-1 border-white/10" />
      {creating ? (
        <form onSubmit={handleCreate} className="flex gap-2 p-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name"
            className="min-w-0 flex-1 rounded-md border border-white/20 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-white"
          />
          <button type="submit" disabled={!name.trim()} className="rounded-full bg-white px-3 text-sm font-bold text-black disabled:opacity-40">
            Create
          </button>
        </form>
      ) : (
        <Item large={large} icon={<PlusIcon className="h-4 w-4" />} onClick={() => setCreating(true)}>
          New playlist
        </Item>
      )}
      {!own ? (
        <p className="px-3 py-2 text-sm text-spotify-gray">Loading...</p>
      ) : (
        own.map((p) => (
          <Item key={p.id} large={large} onClick={() => void addTo(p.id, p.name)}>
            <span className="block truncate">{p.name}</span>
          </Item>
        ))
      )}
    </>
  );
}

function Item({
  children,
  icon,
  trailing,
  onClick,
  large,
}: {
  children: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  onClick: () => void;
  large: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-sm px-3 text-left hover:bg-white/10 ${large ? "py-3 text-base" : "py-2 text-sm"}`}
    >
      {icon !== undefined && <span className="flex w-4 flex-shrink-0 justify-center text-spotify-gray">{icon}</span>}
      <span className="min-w-0 flex-1">{children}</span>
      {trailing && <span className="flex-shrink-0 text-spotify-gray">{trailing}</span>}
    </button>
  );
}

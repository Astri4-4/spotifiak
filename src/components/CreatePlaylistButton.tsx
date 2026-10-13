import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { createPlaylist } from "@/api/subsonic";
import { refreshPlaylists } from "@/lib/playlists";

interface CreatePlaylistButtonProps {
  children: ReactNode;
  onCreated?: () => void;
}

export function CreatePlaylistButton({ children, onCreated }: CreatePlaylistButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("My Playlist");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const playlist = await createPlaylist(name.trim());
      setOpen(false);
      setName("My Playlist");
      refreshPlaylists();
      onCreated?.();
      navigate(`/playlist/${playlist.id}`);
    } catch {
      // Swallow - keep the dialog open so the user can retry.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Create playlist">
        {children}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="w-full max-w-sm rounded-lg bg-spotify-highlight-black p-6 shadow-2xl"
          >
            <h2 className="mb-4 text-lg font-bold">Create playlist</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Playlist name"
              className="w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-white"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-spotify-gray hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:scale-105 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

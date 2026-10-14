import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { answerInvite, inviteText, useInvites } from "@/lib/invites";
import { formatTimeAgo } from "@/lib/format";
import type { Invite } from "@/api/invites";
import { Avatar } from "./Avatar";
import { BellIcon, JamIcon, MixIcon } from "./icons";

/** The top bar's bell: invites to a Jam or a mix waiting for you. */
export function InviteInbox() {
  const { received } = useInvites();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function accept(invite: Invite) {
    answerInvite(invite.id);
    setOpen(false);
    // The Jam's and the mix's own pages ask to confirm: joining a Jam starts its music.
    navigate(invite.kind === "jam" ? `/jam/${invite.code}` : `/mix/${invite.code}`);
  }

  const label = received.length ? `Invites (${received.length} new)` : "Invites";
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={`relative flex h-8 w-8 items-center justify-center rounded-full hover:text-white ${open ? "text-white" : "text-spotify-gray"}`}
      >
        <BellIcon className="h-5 w-5" />
        {received.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-spotify-green px-1 text-[10px] font-bold text-on-accent">
            {received.length > 9 ? "9+" : received.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg bg-spotify-highlight-black p-2 shadow-2xl">
          <h2 className="px-2 pb-1 pt-1 font-bold">Invites</h2>
          {received.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-spotify-gray">
              Nothing for now. When someone invites you to their Jam or a mix, it shows up here.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {received.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 rounded-md p-2 hover:bg-white/5">
                  <span className="relative flex-shrink-0">
                    <Avatar username={invite.from} className="h-10 w-10 text-sm" />
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-spotify-green text-on-accent">
                      {invite.kind === "jam" ? <JamIcon className="h-3 w-3" /> : <MixIcon className="h-3 w-3" />}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{inviteText(invite)}</span>
                    <span className="block text-xs text-spotify-gray">{formatTimeAgo(invite.at)}</span>
                    <span className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => accept(invite)}
                        className="rounded-full bg-white px-4 py-1 text-xs font-bold text-black hover:scale-[1.02]"
                      >
                        {invite.kind === "jam" ? "Join" : "Open"}
                      </button>
                      <button
                        type="button"
                        onClick={() => answerInvite(invite.id)}
                        className="rounded-full border border-spotify-gray-subdued px-4 py-1 text-xs font-bold hover:border-white"
                      >
                        Decline
                      </button>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

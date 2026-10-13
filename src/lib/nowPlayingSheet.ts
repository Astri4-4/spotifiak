import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Open state of the full-screen "Now Playing" view on phones. It's kept in
 * the history entry's state rather than in React state, so the back button
 * (Android's, or a browser's) closes it like any other screen.
 */
export function useNowPlayingSheet() {
  const location = useLocation();
  const navigate = useNavigate();
  const isOpen = Boolean((location.state as { nowPlaying?: boolean } | null)?.nowPlaying);

  const open = useCallback(() => {
    if (isOpen) return;
    navigate(location, { state: { ...(location.state as object | null), nowPlaying: true } });
  }, [isOpen, location, navigate]);

  const close = useCallback(() => {
    if (!isOpen) return;
    // After a reload the sheet's entry can be the first one, with nothing
    // to go back to: just clear the flag. (React Router stores `idx`.)
    if ((window.history.state as { idx?: number } | null)?.idx) {
      navigate(-1);
    } else {
      navigate(location, { replace: true, state: { ...(location.state as object), nowPlaying: false } });
    }
  }, [isOpen, location, navigate]);

  return { isOpen, open, close };
}

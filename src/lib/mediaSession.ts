import { Capacitor } from "@capacitor/core";
import {
  MediaSession as MediaSessionPlugin,
  type ActionHandler,
  type ActionHandlerOptions,
  type MetadataOptions,
  type PlaybackStateOptions,
  type PositionStateOptions,
} from "@capgo/capacitor-media-session";

// Lock screen, notification and media key controls.
//
// On iOS the audio is played by WebKit, which reports it to the system
// itself (as the page title, with no cover or buttons, unless the page uses
// the Media Session API). The plugin's native iOS code sets the system's
// "now playing" info beside WebKit's, which is ignored, and never passes the
// buttons back to the app. So on iOS we use the Media Session API directly,
// like a browser; Android keeps the plugin, whose foreground service lets
// playback carry on in the background.

const webSession =
  Capacitor.getPlatform() === "ios" ? (navigator.mediaSession ?? null) : null;

export const MediaSession = webSession
  ? {
      async setMetadata(options: MetadataOptions) {
        webSession.metadata = new MediaMetadata(options);
      },
      async setPlaybackState(options: PlaybackStateOptions) {
        webSession.playbackState = options.playbackState;
      },
      async setActionHandler(
        options: ActionHandlerOptions,
        handler: ActionHandler | null,
      ) {
        // Only the actions the plugin knows are registered, so details.action is one of them.
        webSession.setActionHandler(
          options.action,
          handler as MediaSessionActionHandler | null,
        );
      },
      async setPositionState(options: PositionStateOptions) {
        webSession.setPositionState(options);
      },
    }
  : MediaSessionPlugin;

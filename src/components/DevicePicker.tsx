import { useState } from "react";
import { useConnect, usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import type { ConnectDevice } from "@/api/connect";
import { BrowserIcon, DevicesIcon, LaptopIcon, PhoneIcon } from "./icons";

function DeviceIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === "desktop") return <LaptopIcon className={className} />;
  if (platform === "ios" || platform === "android") return <PhoneIcon className={className} />;
  return <BrowserIcon className={className} />;
}

/**
 * The speaker button and list of this account's devices: tap one to move
 * playback there. A dropdown above the button on wide screens, a bottom
 * sheet on phones.
 */
export function DevicePicker({ className = "", label = false }: { className?: string; label?: boolean }) {
  const { available, devices, thisDevice, remoteDevice, transferTo } = useConnect();
  const { current, isPlaying } = usePlayer();
  const { username } = useAuth();
  const [open, setOpen] = useState(false);

  // The device whose playback is shown: another one, or this one if it plays.
  const activeId = remoteDevice?.id ?? (current ? thisDevice.id : null);
  const others = devices.filter((d) => d.id !== thisDevice.id);
  const listed: ConnectDevice[] = [thisDevice, ...others];

  function pick(id: string) {
    setOpen(false);
    transferTo(id);
  }

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="Devices"
        title="Devices"
        className={`flex items-center gap-2 ${remoteDevice ? "text-spotify-green" : "text-spotify-gray hover:text-white"}`}
      >
        <DevicesIcon className="h-5 w-5 flex-shrink-0" />
        {label && remoteDevice && <span className="truncate text-xs font-semibold">{remoteDevice.name}</span>}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-label="Devices"
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl bg-spotify-highlight-black p-4 pb-[calc(var(--safe-bottom)+1rem)] text-white shadow-2xl md:absolute md:inset-x-auto md:bottom-full md:right-0 md:mb-3 md:w-80 md:rounded-lg md:pb-4"
          >
            <h2 className="mb-3 text-base font-bold">Devices</h2>
            {!available ? (
              <p className="text-sm text-spotify-gray">Set a Jam server in Settings to connect your devices.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {listed.map((device) => {
                  const isActive = device.id === activeId;
                  const isThis = device.id === thisDevice.id;
                  return (
                    <li key={device.id}>
                      <button
                        type="button"
                        onClick={() => pick(device.id)}
                        disabled={isActive || !activeId}
                        className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-white/10 disabled:cursor-default disabled:hover:bg-transparent ${
                          isActive ? "text-spotify-green" : ""
                        }`}
                      >
                        <DeviceIcon platform={device.platform} className="h-6 w-6 flex-shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">
                            {isThis ? `This device (${device.name})` : device.name}
                          </span>
                          {isActive && (
                            <span className="block text-xs">{isPlaying ? "Playing" : "Paused"}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {available && others.length === 0 && (
              <p className="mt-3 text-xs text-spotify-gray">
                Open Spotifiak on another device signed in as {username} to see and control it here.
              </p>
            )}
            {available && others.length > 0 && !activeId && (
              <p className="mt-3 text-xs text-spotify-gray">Nothing is playing. Start music on any device to control it from here.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

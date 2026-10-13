import type { SVGProps } from "react";

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M8 5.14v13.72c0 .94 1.04 1.51 1.83 1.01l10.78-6.86a1.2 1.2 0 0 0 0-2.02L9.83 4.13A1.2 1.2 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  );
}

export function SkipNextIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M6 5v14l10-7Zm12 0h2v14h-2Z" />
    </svg>
  );
}

export function SkipPrevIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M18 19V5L8 12ZM6 5H4v14h2Z" />
    </svg>
  );
}

export function ShuffleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 7h3.5c1.5 0 2.8.8 3.6 2M3 17h3.5c1.5 0 2.8-.8 3.6-2M14 7h3.3c1 0 1.5 0 2 .2M14 17h3.3c1 0 1.5 0 2-.2" />
      <path d="M17 4.5 20 7l-3 2.5M17 19.5 20 17l-3-2.5" />
    </svg>
  );
}

export function RepeatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 10V9a3 3 0 0 1 3-3h13M20 14v1a3 3 0 0 1-3 3H4" />
      <path d="m17 3 3 3-3 3M7 21l-3-3 3-3" />
    </svg>
  );
}

export function VolumeIcon({ level = 2, ...props }: SVGProps<SVGSVGElement> & { level?: 0 | 1 | 2 }) {
  if (level === 0) {
    return (
      <svg viewBox="0 0 24 24" {...props}>
        <path d="M3 9v6h4l5 5V4L7 9Zm13.5 3L19 9.5l-1-1L15.5 11 13 8.5l-1 1L14.5 12 12 14.5l1 1L15.5 13 18 15.5l1-1Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M3 9v6h4l5 5V4L7 9Z" />
      {level === 2 && <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z" />}
      {level === 2 && <path d="M14 3.2v2.1c3 .9 5 3.6 5 6.7s-2 5.8-5 6.7v2.1c4.1-1 7-4.6 7-8.8s-2.9-7.8-7-8.8Z" />}
      {level === 1 && <path d="M15 12a3 3 0 0 0-1-2.2v4.4A3 3 0 0 0 15 12Z" />}
    </svg>
  );
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M12.5 3.2a1 1 0 0 0-1 0L3 8.8V20a1 1 0 0 0 1 1h5.5a1 1 0 0 0 1-1v-5.5h3V20a1 1 0 0 0 1 1H20a1 1 0 0 0 1-1V8.8Z" />
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <circle cx={10.5} cy={10.5} r={6.5} />
      <path d="m20 20-4.3-4.3" />
    </svg>
  );
}

export function LibraryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M3 3h3v18H3Zm5.5 0h3v18h-3ZM15 3.3l3 .8-4.7 17.4-3-.8Z" />
    </svg>
  );
}

export function HeartIcon({ filled, ...props }: SVGProps<SVGSVGElement> & { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      {...props}
    >
      <path d="M12 20.5s-7.5-4.6-10-9.3C.5 7.8 2.3 4.5 5.7 4c2-.3 4 .6 5.3 2.3C12.3 4.6 14.3 3.7 16.3 4c3.4.5 5.2 3.8 3.7 7.2-2.5 4.7-10 9.3-10 9.3Z" />
    </svg>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx={5} cy={12} r={2} />
      <circle cx={12} cy={12} r={2} />
      <circle cx={19} cy={12} r={2} />
    </svg>
  );
}

export function LogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function JamIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx={9} cy={8} r={3.5} />
      <path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
      <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.9c1.6.8 2.7 2.6 3 5.1" />
    </svg>
  );
}

export function QueueAddIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" {...props}>
      <path d="M3 6h12M3 12h12M3 18h7M18 13v8M14 17h8" />
    </svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function DevicesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="11" height="16" rx="2" />
      <circle cx="8.5" cy="14" r="2.5" />
      <path d="M8.5 7.5h.01M18 8v8m3-6v4" />
    </svg>
  );
}

export function LaptopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </svg>
  );
}

export function PhoneIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

export function BrowserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
    </svg>
  );
}

export function FriendsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M18 6.5a5 5 0 0 1 0 7M20.5 4a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

// Minimal typings for the part of qrcode-terminal that vite.config.ts uses.
declare module "qrcode-terminal" {
  export function generate(text: string, options: { small?: boolean }, callback: (code: string) => void): void;
}

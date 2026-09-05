export function Toast({ message }: { message: string | null }) {
  return (
    <div
      id="toast"
      className={`${message ? 'show opacity-100' : 'opacity-0'} fixed bottom-[90px] left-1/2 z-[80] -translate-x-1/2 rounded-full bg-surface-2 px-4.5 py-2.5 text-[13px] text-text shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-opacity duration-200 pointer-events-none`}
    >
      {message}
    </div>
  );
}

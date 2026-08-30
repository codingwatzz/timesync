export function Toast({ message }: { message: string | null }) {
  return (
    <div id="toast" className={`toast${message ? ' show' : ''}`}>
      {message}
    </div>
  );
}

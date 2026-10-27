import { useEffect, useState } from 'react';

export const OFFLINE_MESSAGE =
  'אין חיבור לאינטרנט. הרשימה המוצגת עשויה שלא להיות עדכנית, ולא ניתן לשמור שינויים עד שהחיבור יחזור.';

/** Persistent banner while the browser is offline, so a loaded list is not mistaken for current data (ADR-10). */
export function OfflineNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <div role="status" aria-live="polite">
      {!online && <p className="offline-notice">{OFFLINE_MESSAGE}</p>}
    </div>
  );
}

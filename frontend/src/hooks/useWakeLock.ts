import { useEffect, useRef } from "react";

/**
 * AI応答待ち中にiPhoneのスリープを防止する。
 * Screen Wake Lock API (iOS Safari 16.4+, Chrome 84+) を使用。
 * 非対応ブラウザでは何もしない。
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      return;
    }

    if (!("wakeLock" in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
        console.log("[WAKE_LOCK] 取得成功");

        lock.addEventListener("release", () => {
          console.log("[WAKE_LOCK] 解放された（システムまたは手動）");
          if (lockRef.current === lock) lockRef.current = null;
        });
      } catch (err) {
        console.log("[WAKE_LOCK] 取得失敗:", err);
      }
    };

    acquire();

    // iOS Safari: ページが非表示→復帰時にWake Lockが自動解放されるため再取得
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !cancelled && !lockRef.current) {
        console.log("[WAKE_LOCK] ページ復帰 → 再取得");
        acquire();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}

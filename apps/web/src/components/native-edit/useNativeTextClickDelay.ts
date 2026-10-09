import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

// Keep single-click editing compatible without stealing a double-click's
// second pointer event with a newly mounted textarea.
export function useNativeTextClickDelay(
  setEditingText: Dispatch<SetStateAction<string | null>>,
) {
  const timer = useRef<number | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const schedule = (text: string) => {
    cancel();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEditingText(text);
    }, 550);
  };
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  return { cancel, schedule };
}

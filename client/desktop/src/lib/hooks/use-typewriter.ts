"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export function useTypewriter(
  text: string,
  opts?: { ms?: number; instant?: boolean }
) {
  const ms = opts?.ms ?? 28;
  const instant = opts?.instant ?? false;
  const source = text ?? "";
  const chars = useMemo(() => Array.from(source), [source]);
  const [n, setN] = useState(chars.length);
  const timer = useRef<number | null>(null);
  const prevText = useRef<string | null>(null);
  const nRef = useRef(n);
  nRef.current = n;

  const stop = () => {
    if (timer.current != null) {
      window.cancelAnimationFrame(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    stop();
    if (instant || chars.length === 0 || document.hidden) {
      setN(chars.length);
      prevText.current = source;
      return;
    }
    const prev = prevText.current;
    prevText.current = source;
    if (prev == null) {
      setN(chars.length);
      return;
    }
    const grew = source.startsWith(prev) && source.length > prev.length;
    if (!grew) {
      setN(chars.length);
      return;
    }
    let i = Math.min(nRef.current, chars.length);
    setN(i);
    if (i >= chars.length) return;
    let last = performance.now();
    const tick = (now: number) => {
      timer.current = null;
      if (document.hidden) {
        setN(chars.length);
        return;
      }
      if (now - last < ms) {
        timer.current = window.requestAnimationFrame(tick);
        return;
      }
      last = now;
      const behind = chars.length - i;
      i += behind > 12 ? Math.max(2, Math.ceil(behind / 4)) : 1;
      setN(Math.min(i, chars.length));
      if (i >= chars.length) return;
      timer.current = window.requestAnimationFrame(tick);
    };
    timer.current = window.requestAnimationFrame(tick);
    const onVis = () => {
      if (!document.hidden) return;
      stop();
      setN(chars.length);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [source, ms, instant, chars.length]);

  const skip = () => {
    stop();
    setN(chars.length);
  };

  return {
    shown: chars.slice(0, n).join(""),
    done: n >= chars.length,
    skip,
  };
}

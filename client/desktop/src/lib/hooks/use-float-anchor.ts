"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const PAD = 8;
const GAP = 4;

export function useFloatAnchor(
  anchorRef: RefObject<HTMLElement | null>,
  preferBelow: boolean
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    left: -9999,
    top: 0,
    zIndex: 80,
  });

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current;
      const box = boxRef.current;
      if (!anchor || !box) return;
      const r = anchor.getBoundingClientRect();
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxH = Math.max(120, vh - PAD * 2);
      const spaceBelow = vh - r.bottom - PAD;
      const spaceAbove = r.top - PAD;
      let openBelow = preferBelow;
      if (preferBelow && spaceBelow < Math.min(h, maxH) && spaceAbove > spaceBelow) {
        openBelow = false;
      }
      if (!preferBelow && spaceAbove < Math.min(h, maxH) && spaceBelow > spaceAbove) {
        openBelow = true;
      }
      const usedH = Math.min(h, maxH);
      let top = openBelow ? r.bottom + GAP : r.top - usedH - GAP;
      let left = r.left + r.width / 2 - w / 2;
      left = Math.min(Math.max(PAD, left), Math.max(PAD, vw - w - PAD));
      top = Math.min(Math.max(PAD, top), Math.max(PAD, vh - usedH - PAD));
      setStyle((prev) => {
        if (
          prev.top === top &&
          prev.left === left &&
          prev.maxHeight === maxH &&
          prev.overflowY === (h > maxH ? "auto" : undefined)
        ) {
          return prev;
        }
        return {
          position: "fixed",
          top,
          left,
          zIndex: 80,
          maxHeight: maxH,
          overflowY: h > maxH ? "auto" : undefined,
        };
      });
    };

    place();
    const box = boxRef.current;
    const ro = typeof ResizeObserver !== "undefined" && box
      ? new ResizeObserver(place)
      : null;
    if (box) ro?.observe(box);
    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, preferBelow]);

  return { boxRef, style };
}

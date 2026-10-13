import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from "react";

interface Drag {
  from: number;
  to: number;
  /** How far the pointer has moved since the drag started, in px. */
  dy: number;
  /** Height of the dragged row: how far the others step aside. */
  height: number;
}

/**
 * Drag-to-reorder for a list, with a mouse or a finger. Each row gets
 * `itemProps(position)` and its handle `handleProps(position)`; positions are
 * 0..n-1 in display order. While dragging, the row follows the pointer and
 * the others step aside; on release `onMove(from, to)` is called.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [drag, setDragState] = useState<Drag | null>(null);
  // Mirrors `drag` for the pointer handlers, which mustn't act inside a state update.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);
  const startRef = useRef<{ y: number; mids: number[] } | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const handleProps = useCallback(
    (position: number) => ({
      // Without this, a finger on the handle scrolls the page instead.
      style: { touchAction: "none", cursor: "grab" } as CSSProperties,
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        const row = e.currentTarget.closest("[data-reorder-item]");
        const rows = row?.parentElement?.querySelectorAll(":scope > [data-reorder-item]");
        if (!row || !rows) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        // Row middles as laid out now; rows stepping aside don't change where they belong.
        const mids = Array.from(rows, (r) => {
          const rect = r.getBoundingClientRect();
          return rect.top + rect.height / 2;
        });
        startRef.current = { y: e.clientY, mids };
        setDrag({ from: position, to: position, dy: 0, height: row.getBoundingClientRect().height });
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const start = startRef.current;
        const d = dragRef.current;
        if (!start || !d) return;
        const dy = e.clientY - start.y;
        const center = start.mids[d.from] + dy;
        const to = start.mids.filter((mid, i) => i !== d.from && mid < center).length;
        setDrag({ ...d, dy, to });
      },
      onPointerUp: () => {
        const d = dragRef.current;
        startRef.current = null;
        setDrag(null);
        if (d && d.to !== d.from) onMoveRef.current(d.from, d.to);
      },
      onPointerCancel: () => {
        startRef.current = null;
        setDrag(null);
      },
    }),
    [setDrag],
  );

  const itemProps = useCallback(
    (position: number) => {
      let transform: string | undefined;
      if (drag) {
        if (position === drag.from) transform = `translateY(${drag.dy}px)`;
        else if (position > drag.from && position <= drag.to) transform = `translateY(${-drag.height}px)`;
        else if (position < drag.from && position >= drag.to) transform = `translateY(${drag.height}px)`;
      }
      const dragged = drag?.from === position;
      return {
        "data-reorder-item": "",
        style: {
          transform,
          // Only while dragging: once dropped, rows are re-rendered in place.
          transition: drag && !dragged ? "transform 150ms ease" : undefined,
          position: dragged ? "relative" : undefined,
          zIndex: dragged ? 10 : undefined,
        } as CSSProperties,
        "data-dragging": dragged || undefined,
      };
    },
    [drag],
  );

  return { dragging: drag !== null, itemProps, handleProps };
}

import { useLayoutEffect, useState, type RefObject } from 'react';

export type GridLayout = { cols: number; tileW: number; tileH: number };

/**
 * Picks the column count that makes tiles as large as possible for the current
 * container size. Tiles are 16:9 on landscape screens and 3:4 on portrait phones.
 */
export function useGridLayout(ref: RefObject<HTMLElement | null>, count: number, gap = 10): GridLayout {
  const [layout, setLayout] = useState<GridLayout>({ cols: 1, tileW: 0, tileH: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H || count === 0) return;
      const aspect = W / H < 0.85 ? 3 / 4 : 16 / 9;
      let best: GridLayout = { cols: 1, tileW: 0, tileH: 0 };
      for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const maxW = (W - gap * (cols - 1)) / cols;
        const maxH = (H - gap * (rows - 1)) / rows;
        const tileW = Math.min(maxW, maxH * aspect);
        if (tileW > best.tileW) best = { cols, tileW: Math.floor(tileW), tileH: Math.floor(tileW / aspect) };
      }
      setLayout((prev) =>
        prev.cols === best.cols && prev.tileW === best.tileW && prev.tileH === best.tileH ? prev : best,
      );
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, count, gap]);

  return layout;
}

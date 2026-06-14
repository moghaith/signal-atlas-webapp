import { useEffect, useRef, useState } from "react";

/*
 This component measures its own pixel width using ResizeObserver
 and passes it as a fixed number to children using a render prop.
*/
export default function ChartWrapper({ height, children, style }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(null);

  useEffect(() => {
    if (!ref.current) return;

    // Initial measurement
    setWidth(ref.current.offsetWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(Math.floor(w));
      }
    });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        minWidth: 0,
        height: height,
        ...style,
      }}
    >
      {width != null && width > 0 ? children(width) : null}
    </div>
  );
}

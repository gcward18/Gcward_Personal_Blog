import React, { useEffect, useRef } from "react";
import mermaid from "mermaid";

// Initialize mermaid config
mermaid.initialize({
  startOnLoad: false,
  theme: "dark", // or 'default', 'forest', 'neutral'
  securityLevel: "loose",
});

export const MermaidDiagram = ({ chart }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current && chart) {
      // Unique ID for each diagram instance
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

      mermaid.render(id, chart).then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      }).catch((err) => console.error("Mermaid rendering error:", err));
    }
  }, [chart]);

  return <div className="mermaid-container" ref={containerRef} />;
};
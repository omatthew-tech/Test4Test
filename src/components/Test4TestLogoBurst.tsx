import type { CSSProperties } from "react";

const regularLogoSrc = encodeURI("/branding/Test4Test Regular Logo.png");

const burstParticles = Array.from({ length: 36 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 36;
  const orbit = 180 + (index % 4) * 58;

  return {
    id: index,
    x: Math.round(Math.cos(angle) * orbit),
    y: Math.round(Math.sin(angle) * orbit),
    delay: Number((index % 6) * 0.035).toFixed(3),
    duration: Number(0.95 + (index % 5) * 0.08).toFixed(2),
    rotate: -70 + index * 18,
    scale: Number(0.72 + (index % 4) * 0.14).toFixed(2),
  };
});

export function Test4TestLogoBurst({ className = "" }: { className?: string }) {
  const classes = ["test-success-burst", className].filter(Boolean).join(" ");

  return (
    <div className={classes} aria-hidden="true">
      <div className="test-success-burst__glow" />
      {burstParticles.map((particle) => (
        <img
          key={particle.id}
          src={regularLogoSrc}
          alt=""
          className="test-success-burst__logo"
          style={
            {
              "--burst-x": `${particle.x}px`,
              "--burst-y": `${particle.y}px`,
              "--burst-delay": `${particle.delay}s`,
              "--burst-duration": `${particle.duration}s`,
              "--burst-rotate": `${particle.rotate}deg`,
              "--burst-scale": particle.scale,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

import type { CSSProperties } from "react";
import { ArrowRight, Coins } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";

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

export function TestSuccessPage() {
  const { submissionId = "" } = useParams();
  const { state } = useAppState();
  const submission = state.submissions.find((item) => item.id === submissionId);

  return (
    <AppShell>
      <div className="test-success-shell center-surface">
        <Surface className="test-success-panel">
          <div className="test-success-burst" aria-hidden="true">
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

          <div className="test-success-panel__content">
            <div className="test-success-chip">
              <Coins size={18} />
              <span>You earned 1 credit</span>
            </div>
            <h1>Nice work.</h1>
            <p>
              Thanks for sharing feedback with <strong>{submission?.productName ?? "this app"}</strong>.
              You&apos;re helping startups and founders, just like yourself, build better apps.
            </p>
            <div className="test-success-actions">
              <Link to="/my-tests" className="button button--secondary">
                View My Tests
              </Link>
              <Link to="/earn" className="button button--primary">
                Test another app
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </Surface>
      </div>
    </AppShell>
  );
}
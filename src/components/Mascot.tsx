import { Link } from "react-router-dom";

export function MascotPair({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`mascot-pair${compact ? " mascot-pair--compact" : ""}`}>
      <svg viewBox="0 0 320 240" className="mascot-svg" aria-hidden="true">
        <g transform="translate(22 14)">
          <rect x="18" y="22" width="140" height="172" rx="54" fill="#F7A148" />
          <rect x="42" y="42" width="94" height="118" rx="34" fill="#F5B465" opacity="0.38" />
          <rect x="72" y="186" width="34" height="58" rx="16" fill="#E7BF82" />
          <rect x="76" y="194" width="26" height="46" rx="13" fill="#F2D2A2" opacity="0.55" />
          <ellipse cx="60" cy="38" rx="18" ry="24" fill="#FFF7ED" opacity="0.88" />
          <ellipse cx="50" cy="82" rx="12" ry="19" fill="#FFF7ED" opacity="0.55" />
          <ellipse cx="114" cy="100" rx="10" ry="12" fill="#5B2A1F" />
          <ellipse cx="148" cy="100" rx="10" ry="12" fill="#5B2A1F" />
          <path d="M108 130c8 8 34 8 42 0" stroke="#5B2A1F" strokeWidth="8" strokeLinecap="round" fill="none" />
        </g>
        <g transform="translate(162 56)">
          <rect x="18" y="24" width="108" height="138" rx="42" fill="#C95774" />
          <rect x="40" y="40" width="72" height="92" rx="28" fill="#E07E97" opacity="0.25" />
          <rect x="58" y="152" width="28" height="50" rx="14" fill="#E7BF82" />
          <rect x="62" y="158" width="20" height="38" rx="10" fill="#F2D2A2" opacity="0.55" />
          <ellipse cx="52" cy="40" rx="14" ry="20" fill="#FFF2F5" opacity="0.84" />
          <ellipse cx="44" cy="76" rx="10" ry="16" fill="#FFF2F5" opacity="0.48" />
          <ellipse cx="64" cy="86" rx="8" ry="10" fill="#5B2A1F" />
          <ellipse cx="96" cy="86" rx="8" ry="10" fill="#5B2A1F" />
          <path d="M60 112c7 7 28 7 35 0" stroke="#5B2A1F" strokeWidth="7" strokeLinecap="round" fill="none" />
        </g>
      </svg>
      {!compact ? (
        <div className="mascot-copy">
          <span className="eyebrow">Warm, fair, and fast</span>
          <h1>Give feedback. Earn credits. Get feedback on yours.</h1>
          <p>
            Test4Test is a usability loop for founders, designers, and product teams who
            want sharper feedback without adding drag to their day.
          </p>
          <div className="hero-actions">
            <Link to="/submit" className="button button--primary">
              Start a submission
            </Link>
            <Link to="/earn" className="button button--secondary">
              Explore available tests
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";

const groupLogoPath = "/branding/Test4Test%20Group%20Logo.png";

export function HomePage() {
  const [productName, setProductName] = useState("");
  const navigate = useNavigate();

  const startSubmission = () => {
    const query = productName.trim() ? `?productName=${encodeURIComponent(productName.trim())}` : "";
    navigate(`/submit${query}`);
  };

  return (
    <AppShell variant="marketing">
      <div className="home-page">
        <Surface className="home-stage">
          <div className="home-stage__copy">
            <h1>
              Get <span className="text-accent">FREE</span> user testing on your web or mobile app
            </h1>
          </div>

          <div className="home-stage__start">
            <div className="home-stage__start-shell" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="simple-start-card">
              <label className="simple-start-card__label" htmlFor="home-product-name">
                What&apos;s the name of your web or mobile app?
              </label>
              <div className="simple-start-card__row">
                <input
                  id="home-product-name"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  placeholder="Enter your web or mobile app name"
                  aria-label="Web or mobile app name"
                />
                <button type="button" className="button button--primary" onClick={startSubmission}>
                  Get started
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>

          <section className="home-stage__steps" aria-label="Three steps">
            <div className="home-stage__steps-intro">

              <div className="simple-section__art" aria-hidden="true">
                <img src={groupLogoPath} alt="" className="simple-section__logo" />
              </div>
            </div>

            <div className="simple-steps">
              <article className="simple-step">
                <div className="simple-step__heading">
                  <span className="simple-step__number">1</span>
                  <h3>Submit</h3>
                </div>
                <p>Add your app name, live link, and questions, or let AI generate them for you.</p>
              </article>
              <article className="simple-step">
                <div className="simple-step__heading">
                  <span className="simple-step__number">2</span>
                  <h3>Test</h3>
                </div>
                <p>Review apps from other users and earn credits for your app</p>
              </article>
              <article className="simple-step">
                <div className="simple-step__heading">
                  <span className="simple-step__number">3</span>
                  <h3>Review</h3>
                </div>
                <p>Monitor your app's feedback with detailed summaries and raw responses</p>
              </article>
            </div>
          </section>
        </Surface>
      </div>
    </AppShell>
  );
}

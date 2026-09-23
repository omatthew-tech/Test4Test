import { ArrowRight, Globe, PanelsTopLeft, Star } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TransitionEvent as ReactTransitionEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { preload } from "react-dom";
import {
  Button,
  Card,
  Cluster,
  Container,
  EarnTestCard,
  Grid,
  Link,
  Section,
  Stack,
  TextField,
  tokens,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { trackEvent } from "../lib/analytics";
import { loadHomeTrustedLogos, productInitials } from "../lib/homeTrustedLogos";
import {
  type HomeTrustedSubmission,
  loadHomeTrustedSubmissions,
  selectFixtureHomeTrustedSubmissions,
} from "../lib/homeTrustedSubmissions";
import {
  defaultImage,
  getAbsoluteUrl,
  siteTitle,
  siteUrl,
  usePageMetadata,
} from "../lib/pageMetadata";
import { clearSubmitFlowResume, getSubmitFlowResume } from "../lib/pendingSubmission";
import styles from "./HomePage.module.css";
import { useHomeSubmittedTestCount } from "./useHomeSubmittedTestCount";

const homeOrganizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteTitle,
  url: siteUrl,
  logo: {
    "@type": "ImageObject",
    url: getAbsoluteUrl(defaultImage),
  },
};

// Retained for possible future reuse. Vite removes these false branches from production builds.
const showRetiredHomeSections = false;

interface HomeProcessStepProps {
  children: ReactNode;
  illustration: string;
}

function HomeProcessStep({ children, illustration }: HomeProcessStepProps) {
  return (
    <Card as="article" className={styles.step}>
      <img
        className={styles.processIllustration}
        src={illustration}
        alt=""
        aria-hidden="true"
        decoding="async"
        width={960}
        height={540}
      />
      <div className={styles.stepCopy}>{children}</div>
    </Card>
  );
}

function HomeBenefitCard({ children }: { children: ReactNode }) {
  return (
    <Card as="article" className={styles.benefit}>
      {children}
    </Card>
  );
}

interface HomeTestableProductProps {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}

function HomeTestableProduct({ children, icon, title }: HomeTestableProductProps) {
  return (
    <Stack as="article" className={styles.testableProduct} gap="md">
      <span className={styles.testableProductMark} aria-hidden="true">
        {icon}
      </span>
      <Stack className={styles.testableProductCopy} gap="sm">
        <h3>{title}</h3>
        <p>{children}</p>
      </Stack>
    </Stack>
  );
}

function HomeMobilePlatformMarks() {
  return (
    <span className={styles.mobilePlatformMarks}>
      {/* ds-exception: home-platform-brand-marks */}
      <svg viewBox="6 2 17 23">
        <path d="M19.66 13.17c-.02-2.26 1.85-3.36 1.94-3.42-1.06-1.55-2.71-1.76-3.3-1.78-1.39-.15-2.74.83-3.45.83-.72 0-1.82-.81-2.99-.79-1.51.02-2.93.9-3.71 2.29-1.6 2.77-.41 6.84 1.13 9.08.77 1.1 1.67 2.33 2.84 2.29 1.14-.05 1.57-.73 2.96-.73 1.38 0 1.77.73 2.96.7 1.23-.02 2-1.1 2.74-2.21.89-1.27 1.25-2.53 1.27-2.59-.03-.01-2.37-.92-2.39-3.67Zm-2.26-6.67c.62-.77 1.04-1.81.93-2.87-.9.04-2.03.62-2.68 1.37-.58.66-1.09 1.74-.96 2.76 1.02.08 2.07-.52 2.71-1.26Z" />
      </svg>
      {/* ds-exception: home-platform-brand-marks */}
      <svg viewBox="0 0 28 28">
        <path d="m8.1 7.2-1.8-2.6a.8.8 0 0 1 .2-1.1.8.8 0 0 1 1.1.2l1.9 2.7A10.6 10.6 0 0 1 14 5.2c1.6 0 3.1.4 4.5 1.1l1.9-2.7a.8.8 0 0 1 1.1-.2.8.8 0 0 1 .2 1.1l-1.8 2.6A8.4 8.4 0 0 1 23 13H5a8.4 8.4 0 0 1 3.1-5.8ZM10 9.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm8 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM5 14.5h18v7.2c0 1.2-1 2.1-2.1 2.1h-1.1V27h-2.5v-3.2h-6.6V27H8.2v-3.2H7.1c-1.2 0-2.1-1-2.1-2.1v-7.2Zm-3 0h2v7.2a1 1 0 0 1-2 0v-7.2Zm22 0h2v7.2a1 1 0 0 1-2 0v-7.2Z" />
      </svg>
    </span>
  );
}

function HomeTrustedLogo({ name, url }: { name: string; url: string | null }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className={styles.trustedByLogo} aria-hidden="true" data-testid="home-trusted-logo">
      {!loaded || failed ? <span>{productInitials(name)}</span> : null}
      {url && !failed ? (
        <img
          alt=""
          className={loaded ? styles.trustedByLogoImage : styles.trustedByLogoLoading}
          decoding="async"
          src={url}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

function HomeTrustedTestCard({
  submission,
  logoUrl,
  duplicate,
}: {
  submission: HomeTrustedSubmission;
  logoUrl: string | null;
  duplicate: boolean;
}) {
  const displayName =
    submission.id === "3e7dee0a-ab78-40c9-a5aa-56b0bbafc374" ? "Pinch" : submission.productName;

  return (
    <EarnTestCard
      className={styles.trustedByCard}
      title={
        <Link
          aria-label={`Open ${displayName} test`}
          aria-description="Opens in a new tab"
          className={`${styles.trustedByCardTitle} ${styles.trustedByOpenLink}`}
          title={`Open ${displayName} test (opens in a new tab)`}
          to={`/test/${submission.id}`}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={duplicate ? -1 : undefined}
        >
          <HomeTrustedLogo key={logoUrl ?? "initials"} name={displayName} url={logoUrl} />
          <span className={styles.trustedByProductName}>{displayName}</span>
        </Link>
      }
      description={null}
      badges={[]}
    />
  );
}

function HomeTrustedBySection({
  submissions,
  submittedTestCount,
}: {
  submissions: HomeTrustedSubmission[];
  submittedTestCount: number | null;
}) {
  const shouldAnimate = submissions.length > 1;
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const primaryListRef = useRef<HTMLOListElement>(null);
  const [sequenceCopies, setSequenceCopies] = useState(2);
  const [logos, setLogos] = useState<Record<string, string | null>>({});

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const primaryList = primaryListRef.current;
    if (!shouldAnimate || !viewport || !track || !primaryList) return;

    const measure = () => {
      const gap = Number.parseFloat(window.getComputedStyle(track).columnGap);
      const sequenceWidth = primaryList.getBoundingClientRect().width + gap;
      if (!(sequenceWidth > 0) || viewport.clientWidth === 0) return;

      // ds-exception: runtime-measurements
      track.style.setProperty("--home-trusted-by-cycle-width", `${sequenceWidth}px`);
      setSequenceCopies(Math.ceil(viewport.clientWidth / sequenceWidth) + 2);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(primaryList);
    measure();
    return () => observer.disconnect();
  }, [shouldAnimate, submissions]);

  useEffect(() => {
    const controller = new AbortController();
    void loadHomeTrustedLogos(submissions, controller.signal)
      .then((nextLogos) => {
        if (!controller.signal.aborted) setLogos(nextLogos);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLogos({});
      });
    return () => controller.abort();
  }, [submissions]);

  if (submissions.length === 0) return null;

  const renderCards = (duplicate: boolean) =>
    submissions.map((submission, index) => (
      <li
        className={styles.trustedByItem}
        key={`${duplicate ? "duplicate" : "primary"}-${submission.id}`}
      >
        <HomeTrustedTestCard
          submission={submission}
          logoUrl={logos[submission.id] ?? null}
          duplicate={duplicate}
        />
        {!duplicate ? (
          <span className="ds-sr-only">
            Rank {index + 1} of {submissions.length}
          </span>
        ) : null}
      </li>
    ));

  return (
    <Section
      className={styles.trustedBy}
      aria-labelledby="home-trusted-by-title"
      data-testid="home-trusted-by-section"
    >
      <div
        className={styles.trustedByViewport}
        ref={viewportRef}
        data-contained-horizontal-overflow="true"
        data-testid="home-trusted-by-viewport"
      >
        <div
          className={`${styles.trustedByTrack}${
            shouldAnimate ? "" : ` ${styles.trustedByTrackStatic}`
          }`}
          data-testid="home-trusted-by-track"
          ref={trackRef}
        >
          {shouldAnimate ? (
            <ol
              className={`${styles.trustedByList} ${styles.trustedByDuplicate}`}
              aria-hidden="true"
            >
              {renderCards(true)}
            </ol>
          ) : null}
          <ol
            className={styles.trustedByList}
            aria-label="Top tests available on Earn"
            ref={primaryListRef}
          >
            {renderCards(false)}
          </ol>
          {shouldAnimate
            ? Array.from({ length: sequenceCopies - 2 }, (_, index) => (
                <ol
                  className={`${styles.trustedByList} ${styles.trustedByDuplicate}`}
                  aria-hidden="true"
                  key={`trailing-sequence-${index}`}
                >
                  {renderCards(true)}
                </ol>
              ))
            : null}
        </div>
      </div>
      <Container>
        <h2 className={styles.trustedByCaption} id="home-trusted-by-title">
          Trusted by{" "}
          {submittedTestCount === null ? "" : `${submittedTestCount.toLocaleString("en-US")}+ `}
          global startups {/* ds-exception: home-trust-caption-stars */}
          <span className={styles.trustedByStars} aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <Star key={index} size={16} />
            ))}
          </span>
        </h2>
      </Container>
    </Section>
  );
}

const homeHowItWorksSteps = [
  {
    title: "Create your test",
    description: "Create your first test in seconds. Answer a few questions or use AI",
    image: "/images/home-step-create-test-actual.webp",
    screenshot: { x: 68, y: 185, width: 1312, height: 845, radius: 26 },
  },
  {
    title: "Get testers",
    description:
      "Share your test to unlimited users or earn credits by testing other founder's tests",
    image: "/images/home-step-get-testers-actual.webp",
    screenshot: { x: 33, y: 184, width: 1383, height: 734, radius: 30 },
  },
  {
    title: "Gain insights",
    description:
      "Manage every insight from one dashboard. Watch your tests, clip or export it to your favorite LLM",
    image: "/images/home-step-gain-insights-actual.webp",
    screenshot: { x: 39, y: 138, width: 1370, height: 849, radius: 26 },
  },
] as const;

// ds-exception: home-how-it-works-mobile-autoplay
const homeHowItWorksHoldMs = 5000;
const homeHowItWorksFadeMs = tokens["semantic.motion.interaction.duration"].dtcgValue.value * 3;

function HomeHowItWorksSection() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const maskId = useId();
  const [activeStep, setActiveStep] = useState(0);
  const [backgroundPlaying, setBackgroundPlaying] = useState(false);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const media = Array.from(viewport.querySelectorAll<HTMLElement>("[data-how-it-works-media]"));
    const alignBackgrounds = () => {
      const bounds = viewport.getBoundingClientRect();
      for (const frame of media) {
        const frameBounds = frame.getBoundingClientRect();
        // ds-exception: runtime-measurements
        frame.style.setProperty("--home-how-flow-width", `${bounds.width}px`);
        frame.style.setProperty("--home-how-flow-left", `${bounds.left - frameBounds.left}px`);
      }
    };
    const observer = new ResizeObserver(alignBackgrounds);
    observer.observe(viewport);
    media.forEach((frame) => observer.observe(frame));
    alignBackgrounds();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const desktop = window.matchMedia(
      `(min-width: ${tokens["primitive.breakpoint.medium"].value})`,
    );
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const forcedColors = window.matchMedia("(forced-colors: active)");
    let inView = false;
    let timer: number | undefined;
    const shouldPlay = () =>
      inView && !document.hidden && !desktop.matches && !reducedMotion.matches;
    const advance = () => {
      if (!shouldPlay()) return;
      setActiveStep((current) => (current + 1) % homeHowItWorksSteps.length);
      // Each incoming card gets a full reading interval after its fade finishes.
      timer = window.setTimeout(advance, homeHowItWorksFadeMs + homeHowItWorksHoldMs);
    };
    const updatePlayback = () => {
      window.clearTimeout(timer);
      setBackgroundPlaying(
        inView && !document.hidden && !reducedMotion.matches && !forcedColors.matches,
      );
      if (shouldPlay()) timer = window.setTimeout(advance, homeHowItWorksHoldMs);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (inView === entry.isIntersecting) return;
      inView = entry.isIntersecting;
      updatePlayback();
    });

    observer.observe(viewport);
    desktop.addEventListener("change", updatePlayback);
    reducedMotion.addEventListener("change", updatePlayback);
    forcedColors.addEventListener("change", updatePlayback);
    document.addEventListener("visibilitychange", updatePlayback);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      desktop.removeEventListener("change", updatePlayback);
      reducedMotion.removeEventListener("change", updatePlayback);
      forcedColors.removeEventListener("change", updatePlayback);
      document.removeEventListener("visibilitychange", updatePlayback);
    };
  }, []);

  return (
    <Section
      aria-labelledby="home-how-it-works-title"
      data-background-playing={backgroundPlaying}
      data-testid="home-how-it-works-section"
    >
      {/* ds-exception: home-how-it-works-flow-background */}
      <svg aria-hidden="true" className={styles.howItWorksClipDefinitions} focusable="false">
        <defs>
          {homeHowItWorksSteps.map((step, index) => (
            <clipPath clipPathUnits="objectBoundingBox" id={`${maskId}-${index}`} key={step.title}>
              <rect
                x={step.screenshot.x / 1448}
                y={step.screenshot.y / 1086}
                width={step.screenshot.width / 1448}
                height={step.screenshot.height / 1086}
                rx={step.screenshot.radius / 1448}
                ry={step.screenshot.radius / 1086}
              />
              {index === 0 ? (
                <>
                  {[588, 724, 860].map((center) => (
                    <ellipse
                      key={center}
                      cx={center / 1448}
                      cy={99 / 1086}
                      rx={35 / 1448}
                      ry={35 / 1086}
                    />
                  ))}
                  <rect x={622 / 1448} y={98 / 1086} width={68 / 1448} height={2 / 1086} />
                  <rect x={758 / 1448} y={98 / 1086} width={68 / 1448} height={2 / 1086} />
                </>
              ) : null}
            </clipPath>
          ))}
        </defs>
      </svg>
      <Stack className={styles.howItWorksContent} gap="xl">
        <h2 className={styles.howItWorksHeading} id="home-how-it-works-title">
          How it works
        </h2>
        <div className={styles.howItWorksViewport} ref={viewportRef}>
          <Grid as="ol" className={styles.howItWorksSteps} gap="lg" role="list">
            {homeHowItWorksSteps.map((step, index) => (
              <Stack
                as="li"
                className={styles.howItWorksStep}
                data-active={index === activeStep}
                gap="lg"
                key={step.title}
              >
                <div
                  className={styles.howItWorksMedia}
                  data-how-it-works-media
                  data-testid="home-how-it-works-media"
                >
                  <div
                    aria-hidden="true"
                    className={styles.howItWorksFlow}
                    data-contained-horizontal-overflow="true"
                    data-testid="home-how-it-works-flow"
                  >
                    <span className={styles.howItWorksFlowCyan} />
                    <span className={styles.howItWorksFlowMint} />
                    <span className={styles.howItWorksFlowYellow} />
                    <span className={styles.howItWorksFlowBlue} />
                  </div>
                  {/* ds-exception: home-how-it-works-flow-background */}
                  <img
                    alt=""
                    className={styles.howItWorksImage}
                    style={
                      { "--home-how-image-mask": `url("#${maskId}-${index}")` } as CSSProperties
                    }
                    decoding="async"
                    height={1086}
                    loading="lazy"
                    src={step.image}
                    width={1448}
                  />
                </div>
                <Stack className={styles.howItWorksCopy} gap="sm">
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </Stack>
              </Stack>
            ))}
          </Grid>
        </div>
      </Stack>
    </Section>
  );
}

const freeFeedbackMethods = [
  {
    title: "Earn credits by testing apps",
    description: "Earn credits 1:1 (we don't take a cut)",
    id: "home-test-other-founders-title",
    poster: "/videos/home-earn-credit-poster.webp",
    staticPoster: "/videos/home-earn-credit-static.webp",
    sources: [{ src: "/videos/home-earn-credit.mp4", type: "video/mp4" }],
    width: 1620,
    height: 1080,
  },
  {
    title: "Bring your own testers",
    description: "There are no limits - bring as many as you want",
    id: "home-bring-your-own-testers-title",
    poster: "/videos/home-share-test-poster.webp",
    staticPoster: "/videos/home-share-test-poster.webp",
    sources: [
      { src: "/videos/home-share-test.av1.mp4", type: 'video/mp4; codecs="av01.0.08M.08"' },
      { src: "/videos/home-share-test.mp4", type: "video/mp4" },
    ],
    width: 1440,
    height: 960,
  },
] as const;

function HomeFeedbackPreview({ method }: { method: (typeof freeFeedbackMethods)[number] }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [allowAutoplay, setAllowAutoplay] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }
    ).connection;
    const updatePreferences = () => {
      setAllowAutoplay(!motion.matches && !connection?.saveData);
    };
    const updateVisibility = () => setPageVisible(!document.hidden);
    updatePreferences();
    updateVisibility();
    motion.addEventListener("change", updatePreferences);
    connection?.addEventListener("change", updatePreferences);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(frame);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", updatePreferences);
      connection?.removeEventListener("change", updatePreferences);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed) return;
    const shouldPlay = inView && pageVisible && allowAutoplay;
    if (!shouldPlay) {
      video.pause();
      return;
    }
    if (!loaded) {
      setLoaded(true);
      return;
    }
    // Source URLs are only attached on first playback, so preload cannot start early.
    if (!video.currentSrc) video.load();
    void video.play().catch(() => {
      // Autoplay restrictions leave a static preview in place.
    });
  }, [allowAutoplay, failed, inView, loaded, pageVisible]);

  return (
    <div className={`${styles.feedbackPreview} ${styles.feedbackVideoFrame}`} ref={frameRef}>
      {/* ds-exception: home-feedback-demo-media */}
      <img
        alt=""
        aria-hidden="true"
        className={styles.feedbackVideoPoster}
        decoding="async"
        height={method.height}
        loading="lazy"
        src={allowAutoplay && !failed ? method.poster : method.staticPoster}
        width={method.width}
      />
      {!failed ? (
        <>
          {/* ds-exception: home-feedback-demo-media */}
          <video
            aria-hidden="true"
            className={styles.feedbackVideo}
            data-ready={ready && allowAutoplay}
            height={method.height}
            loop
            muted
            playsInline
            preload="none"
            ref={videoRef}
            tabIndex={-1}
            width={method.width}
            onError={(event) => {
              // A failed source must still let the browser try the next codec.
              if (event.target === event.currentTarget) setFailed(true);
            }}
            onLoadedData={() => setReady(true)}
          >
            {loaded
              ? method.sources.map((source, index) => (
                  <source
                    key={source.src}
                    src={source.src}
                    type={source.type}
                    onError={() => {
                      if (index === method.sources.length - 1) setFailed(true);
                    }}
                  />
                ))
              : null}
          </video>
        </>
      ) : null}
    </div>
  );
}

function FreeFeedbackShowcase() {
  return (
    <Stack className={styles.freeFeedbackContent}>
      {freeFeedbackMethods.map((method) => (
        <Grid
          as="article"
          aria-labelledby={method.id}
          className={styles.feedbackMethod}
          key={method.id}
        >
          <HomeFeedbackPreview method={method} />
          <Stack className={styles.feedbackMethodCopy} gap="md">
            <h3 id={method.id}>{method.title}</h3>
            <p>{method.description}</p>
          </Stack>
        </Grid>
      ))}
    </Stack>
  );
}

const managedTestingInquiryHref = "mailto:support@test4test.io?subject=Managed%20testing%20inquiry";

function HomeManagedRecruitmentSection() {
  const openManagedTestingInquiry = () => {
    window.location.href = managedTestingInquiryHref;
  };

  return (
    <Section
      className={styles.managedRecruitment}
      aria-labelledby="home-managed-recruitment-title"
      data-testid="home-managed-recruitment-section"
    >
      <Stack className={styles.managedRecruitmentContent} gap="xl">
        <div className={styles.managedRecruitmentHeader}>
          <Stack className={styles.managedRecruitmentHeading} gap="sm">
            <h2 id="home-managed-recruitment-title">Go Wild</h2>
            <p>Start recruiting users from social media, forums and communities</p>
          </Stack>
        </div>

        <Grid className={styles.managedComparisonGrid} gap="lg">
          <Card as="article" className={styles.managedComparisonCard}>
            <picture className={styles.managedComparisonMedia}>
              <source
                media="(prefers-reduced-motion: reduce)"
                srcSet="/images/animations/monkey-typing-source.png"
              />
              <img
                alt=""
                aria-hidden="true"
                className={`${styles.managedComparisonImage} ${styles.managedComparisonImageMuted}`}
                decoding="async"
                height={561}
                loading="lazy"
                src="/images/animations/monkey-typing-loop.webp"
                width={700}
              />
            </picture>
            <Stack className={styles.managedComparisonCopy} gap="sm">
              <span className={styles.managedComparisonLabel}>Other platforms</span>
              <h3>&quot;Users&quot; come from pools</h3>
              <p>Most users are professional survey takers, trained to get past screeners</p>
            </Stack>
          </Card>

          <Card
            as="article"
            className={`${styles.managedComparisonCard} ${styles.managedPremiumCard}`}
          >
            <picture className={styles.managedComparisonMedia}>
              <source
                media="(prefers-reduced-motion: reduce)"
                srcSet="/images/animations/monkey-vine-poster.png"
              />
              <img
                alt=""
                aria-hidden="true"
                className={styles.managedComparisonImage}
                decoding="async"
                height={512}
                loading="lazy"
                src="/images/animations/monkey-vine-loop.webp"
                width={768}
              />
            </picture>
            <div className={styles.managedPremiumBody}>
              <Stack className={styles.managedComparisonCopy} gap="sm">
                <span className={`${styles.managedComparisonLabel} ${styles.managedPremiumLabel}`}>
                  Test4Test
                </span>
                <h3>Recruit REAL users</h3>
                <p>Recruit users who actually experience the problem you're trying to solve</p>
              </Stack>
              <Button
                className={styles.managedRecruitmentCta}
                onClick={openManagedTestingInquiry}
                size="large"
                type="button"
              >
                Try Test4Test Premium
                <ArrowRight aria-hidden="true" size={20} />
              </Button>
            </div>
          </Card>
        </Grid>
      </Stack>
    </Section>
  );
}

const exampleRanks = [
  { rank: 1, name: "Your app", detail: "8 credits", current: true },
  { rank: 2, name: "FlowPilot", detail: "6 credits" },
  { rank: 3, name: "NoteNest", detail: "5 credits" },
  { rank: 4, name: "QuickCart", detail: "4 credits" },
];

const homeFeedbackQuotes = [
  "“I knew exactly what to do next”",
  "“The save button was easy to miss”",
  "“The sign-up flow felt quick”",
  "“I wanted clearer pricing”",
  "“The navigation made sense”",
  "“I wasn’t sure my changes saved”",
  "“The page felt fast and focused”",
  "“I’d make the main action stand out”",
] as const;

const homeFeedbackQuoteDwellMilliseconds = 1_800;
const homeFeedbackQuotePauseMilliseconds = 1_000;
const homeFeedbackQuoteParticleIndexes = Array.from({ length: 12 }, (_, index) => index);

type HomeFeedbackQuotePhase = "positioning" | "visible" | "fading";

interface HomeFeedbackQuote {
  id: number;
  text: (typeof homeFeedbackQuotes)[number];
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
  phase: HomeFeedbackQuotePhase;
}

interface HomeFeedbackPointerPosition {
  x: number;
  y: number;
}

type HomeFeedbackQuoteStyle = CSSProperties & {
  "--home-feedback-quote-x": string;
  "--home-feedback-quote-y": string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function cssDurationToMilliseconds(value: string) {
  const duration = Number.parseFloat(value);
  if (!Number.isFinite(duration)) return 0;
  return value.trim().endsWith("ms") ? duration : duration * 1_000;
}

function chooseHomeFeedbackQuoteIndex(previousIndex: number | null) {
  const availableQuoteCount =
    previousIndex === null ? homeFeedbackQuotes.length : homeFeedbackQuotes.length - 1;
  const candidateIndex = Math.floor(Math.random() * availableQuoteCount);

  if (previousIndex !== null && candidateIndex >= previousIndex) {
    return candidateIndex + 1;
  }

  return candidateIndex;
}

export function HomePage() {
  preload("/images/home-hero-savanna.webp", { as: "image", fetchPriority: "high" });
  usePageMetadata({
    canonicalPath: "/",
    image: defaultImage,
    jsonLd: homeOrganizationJsonLd,
  });

  const [productName, setProductName] = useState("");
  const [hasResumeSubmission] = useState(() => Boolean(getSubmitFlowResume()));
  const [homeFeedbackQuote, setHomeFeedbackQuote] = useState<HomeFeedbackQuote | null>(null);
  const [trustedSubmissions, setTrustedSubmissions] = useState<HomeTrustedSubmission[]>([]);
  const { state, isConfigured } = useAppState();
  const submittedTestCount = useHomeSubmittedTestCount(
    isConfigured,
    import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1"
      ? state.submissions.filter(
          (submission) =>
            submission.status === "live" &&
            state.users.some((user) => user.id === submission.userId && user.banStatus === "clear"),
        ).length
      : undefined,
  );
  const heroPanelRef = useRef<HTMLDivElement>(null);
  const heroFeedbackExclusionRef = useRef<HTMLDivElement>(null);
  const homeFeedbackQuoteRef = useRef<HTMLSpanElement>(null);
  const activeHomeFeedbackQuoteIdRef = useRef<number | null>(null);
  const isMouseOverHeroPanelRef = useRef(false);
  const isHomeFeedbackPointerEligibleRef = useRef(false);
  const latestHomeFeedbackPointerRef = useRef<HomeFeedbackPointerPosition | null>(null);
  const lastHomeFeedbackQuoteIndexRef = useRef<number | null>(null);
  const nextHomeFeedbackQuoteIdRef = useRef(1);
  const nextHomeFeedbackQuoteTimerRef = useRef<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const designSystemFixturesEnabled =
      import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";

    if (designSystemFixturesEnabled) {
      setTrustedSubmissions(selectFixtureHomeTrustedSubmissions(state.submissions));
      return undefined;
    }

    if (!isConfigured) {
      setTrustedSubmissions([]);
      return undefined;
    }

    void loadHomeTrustedSubmissions()
      .then((submissions) => {
        if (!cancelled) setTrustedSubmissions(submissions);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Could not load homepage trusted tests.", error);
        setTrustedSubmissions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isConfigured, state.submissions]);

  const showNextHomeFeedbackQuote = useCallback(() => {
    const pointerPosition = latestHomeFeedbackPointerRef.current;
    if (
      !isMouseOverHeroPanelRef.current ||
      !isHomeFeedbackPointerEligibleRef.current ||
      !pointerPosition ||
      activeHomeFeedbackQuoteIdRef.current !== null ||
      window.scrollY > 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const quoteIndex = chooseHomeFeedbackQuoteIndex(lastHomeFeedbackQuoteIndexRef.current);
    const quoteId = nextHomeFeedbackQuoteIdRef.current;

    nextHomeFeedbackQuoteIdRef.current += 1;
    lastHomeFeedbackQuoteIndexRef.current = quoteIndex;
    activeHomeFeedbackQuoteIdRef.current = quoteId;
    setHomeFeedbackQuote({
      id: quoteId,
      text: homeFeedbackQuotes[quoteIndex],
      pointerX: pointerPosition.x,
      pointerY: pointerPosition.y,
      x: pointerPosition.x,
      y: pointerPosition.y,
      phase: "positioning",
    });
  }, []);

  const clearNextHomeFeedbackQuoteTimer = useCallback(() => {
    if (nextHomeFeedbackQuoteTimerRef.current === null) return;

    window.clearTimeout(nextHomeFeedbackQuoteTimerRef.current);
    nextHomeFeedbackQuoteTimerRef.current = null;
  }, []);

  const hideHomeFeedbackQuote = useCallback(() => {
    clearNextHomeFeedbackQuoteTimer();
    activeHomeFeedbackQuoteIdRef.current = null;
    setHomeFeedbackQuote(null);
  }, [clearNextHomeFeedbackQuoteTimer]);

  const scheduleNextHomeFeedbackQuote = useCallback(() => {
    clearNextHomeFeedbackQuoteTimer();
    if (
      !isMouseOverHeroPanelRef.current ||
      !isHomeFeedbackPointerEligibleRef.current ||
      window.scrollY > 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    nextHomeFeedbackQuoteTimerRef.current = window.setTimeout(() => {
      nextHomeFeedbackQuoteTimerRef.current = null;
      showNextHomeFeedbackQuote();
    }, homeFeedbackQuotePauseMilliseconds);
  }, [clearNextHomeFeedbackQuoteTimer, showNextHomeFeedbackQuote]);

  const finishHomeFeedbackQuote = useCallback(
    (quoteId: number) => {
      if (activeHomeFeedbackQuoteIdRef.current !== quoteId) return;

      activeHomeFeedbackQuoteIdRef.current = null;
      setHomeFeedbackQuote((currentQuote) => (currentQuote?.id === quoteId ? null : currentQuote));
      scheduleNextHomeFeedbackQuote();
    },
    [scheduleNextHomeFeedbackQuote],
  );

  useLayoutEffect(() => {
    if (homeFeedbackQuote?.phase !== "positioning") return;

    const panel = heroPanelRef.current;
    const quote = homeFeedbackQuoteRef.current;
    if (!panel || !quote) return;

    const panelStyles = window.getComputedStyle(panel);
    const edgeInset =
      Number.parseFloat(panelStyles.getPropertyValue("--ds-semantic-space-inline-sm")) || 0;
    const burstOutset =
      (Number.parseFloat(panelStyles.getPropertyValue("--ds-semantic-space-inline-2xl")) || 0) +
      (Number.parseFloat(panelStyles.getPropertyValue("--ds-semantic-space-inline-xl")) || 0);
    const visualEdgeInset = edgeInset + burstOutset;
    const quoteWidth = quote.offsetWidth;
    const quoteHeight = quote.offsetHeight;
    const panelWidth = panel.clientWidth;
    const panelHeight = panel.clientHeight;
    const minimumX = visualEdgeInset + quoteWidth / 2;
    const maximumX = panelWidth - visualEdgeInset - quoteWidth / 2;
    const maximumY = Math.max(visualEdgeInset, panelHeight - visualEdgeInset - quoteHeight);
    const abovePointerY = homeFeedbackQuote.pointerY - edgeInset - quoteHeight;
    const belowPointerY = homeFeedbackQuote.pointerY + edgeInset;
    const x =
      maximumX < minimumX ? panelWidth / 2 : clamp(homeFeedbackQuote.pointerX, minimumX, maximumX);
    const y =
      abovePointerY >= visualEdgeInset
        ? abovePointerY
        : clamp(belowPointerY, visualEdgeInset, maximumY);

    setHomeFeedbackQuote((currentQuote) =>
      currentQuote?.id === homeFeedbackQuote.id
        ? { ...currentQuote, phase: "visible", x, y }
        : currentQuote,
    );
  }, [homeFeedbackQuote]);

  useEffect(() => {
    if (homeFeedbackQuote?.phase !== "visible") return;

    const quoteId = homeFeedbackQuote.id;
    const fadeTimer = window.setTimeout(() => {
      setHomeFeedbackQuote((currentQuote) =>
        currentQuote?.id === quoteId ? { ...currentQuote, phase: "fading" } : currentQuote,
      );
    }, homeFeedbackQuoteDwellMilliseconds);

    return () => window.clearTimeout(fadeTimer);
  }, [homeFeedbackQuote]);

  useEffect(() => {
    if (homeFeedbackQuote?.phase !== "fading") return;

    const quoteId = homeFeedbackQuote.id;
    const transitionDuration = homeFeedbackQuoteRef.current
      ? window.getComputedStyle(homeFeedbackQuoteRef.current).transitionDuration.split(",")[0]
      : "0ms";
    const removalTimer = window.setTimeout(
      () => finishHomeFeedbackQuote(quoteId),
      cssDurationToMilliseconds(transitionDuration) * 2,
    );

    return () => window.clearTimeout(removalTimer);
  }, [finishHomeFeedbackQuote, homeFeedbackQuote]);

  useEffect(() => {
    const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const removeQuoteForReducedMotion = (event: MediaQueryListEvent) => {
      if (event.matches) {
        hideHomeFeedbackQuote();
        return;
      }

      showNextHomeFeedbackQuote();
    };

    reducedMotionPreference.addEventListener("change", removeQuoteForReducedMotion);
    return () => {
      reducedMotionPreference.removeEventListener("change", removeQuoteForReducedMotion);
      clearNextHomeFeedbackQuoteTimer();
    };
  }, [clearNextHomeFeedbackQuoteTimer, hideHomeFeedbackQuote, showNextHomeFeedbackQuote]);

  useEffect(() => {
    const handlePageScroll = () => {
      if (window.scrollY > 0) {
        hideHomeFeedbackQuote();
        return;
      }

      showNextHomeFeedbackQuote();
    };

    window.addEventListener("scroll", handlePageScroll, { passive: true });
    return () => window.removeEventListener("scroll", handlePageScroll);
  }, [hideHomeFeedbackQuote, showNextHomeFeedbackQuote]);

  const startSubmission = () => {
    const trimmedProductName = productName.trim();
    if (trimmedProductName) {
      trackEvent("product_name_entered", { source: "home" });
    }
    const query = trimmedProductName
      ? `?productName=${encodeURIComponent(trimmedProductName)}`
      : "";
    navigate(`/submit${query}`);
  };

  const continueSubmission = () => navigate("/submit");

  const startNewSubmission = () => {
    clearSubmitFlowResume();
    navigate("/submit");
  };

  const updateHomeFeedbackPointerPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const panelBounds = event.currentTarget.getBoundingClientRect();
    latestHomeFeedbackPointerRef.current = {
      x: clamp(
        event.clientX - panelBounds.left - event.currentTarget.clientLeft,
        0,
        event.currentTarget.clientWidth,
      ),
      y: clamp(
        event.clientY - panelBounds.top - event.currentTarget.clientTop,
        0,
        event.currentTarget.clientHeight,
      ),
    };
  };

  const isPointerInsideHomeFeedbackExclusion = (event: ReactPointerEvent<HTMLDivElement>) => {
    const exclusionBounds = heroFeedbackExclusionRef.current?.getBoundingClientRect();
    if (!exclusionBounds) return false;

    return (
      event.clientX >= exclusionBounds.left &&
      event.clientX <= exclusionBounds.right &&
      event.clientY >= exclusionBounds.top &&
      event.clientY <= exclusionBounds.bottom
    );
  };

  const handleHeroPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;

    isMouseOverHeroPanelRef.current = true;
    updateHomeFeedbackPointerPosition(event);
    isHomeFeedbackPointerEligibleRef.current = !isPointerInsideHomeFeedbackExclusion(event);
    showNextHomeFeedbackQuote();
  };

  const handleHeroPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;

    updateHomeFeedbackPointerPosition(event);
    const isEligible = !isPointerInsideHomeFeedbackExclusion(event);
    if (isEligible === isHomeFeedbackPointerEligibleRef.current) return;

    isHomeFeedbackPointerEligibleRef.current = isEligible;
    if (isEligible) {
      showNextHomeFeedbackQuote();
    } else {
      hideHomeFeedbackQuote();
    }
  };

  const handleHeroPointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      isMouseOverHeroPanelRef.current = false;
      isHomeFeedbackPointerEligibleRef.current = false;
      latestHomeFeedbackPointerRef.current = null;
      clearNextHomeFeedbackQuoteTimer();
    }
  };

  const handleHomeFeedbackQuoteTransitionEnd = (event: ReactTransitionEvent<HTMLSpanElement>) => {
    if (
      event.propertyName !== "opacity" ||
      homeFeedbackQuote?.phase !== "fading" ||
      activeHomeFeedbackQuoteIdRef.current !== homeFeedbackQuote.id
    ) {
      return;
    }

    finishHomeFeedbackQuote(homeFeedbackQuote.id);
  };

  const homeFeedbackQuoteStyle: HomeFeedbackQuoteStyle | undefined = homeFeedbackQuote
    ? {
        "--home-feedback-quote-x": `${homeFeedbackQuote.x}px`,
        "--home-feedback-quote-y": `${homeFeedbackQuote.y}px`,
      }
    : undefined;

  return (
    <AppShell variant="marketing" contentWidth="viewport">
      <div className={styles.page}>
        <Section className={styles.hero} aria-labelledby="home-hero-title">
          <div
            className={styles.heroPanel}
            data-testid="home-hero-panel"
            onPointerEnter={handleHeroPointerEnter}
            onPointerLeave={handleHeroPointerLeave}
            onPointerMove={handleHeroPointerMove}
            ref={heroPanelRef}
          >
            {homeFeedbackQuote ? (
              <>
                {/* ds-exception: runtime-measurements — pointer-relative quote placement geometry. */}
                <span
                  style={homeFeedbackQuoteStyle}
                  aria-hidden="true"
                  className={`${styles.homeFeedbackQuote}${
                    homeFeedbackQuote.phase === "positioning"
                      ? ` ${styles.homeFeedbackQuotePositioning}`
                      : ""
                  }${
                    homeFeedbackQuote.phase === "visible"
                      ? ` ${styles.homeFeedbackQuoteVisible}`
                      : ""
                  }${
                    homeFeedbackQuote.phase === "fading" ? ` ${styles.homeFeedbackQuoteFading}` : ""
                  }`}
                  data-phase={homeFeedbackQuote.phase}
                  data-positioned={homeFeedbackQuote.phase !== "positioning"}
                  data-testid="home-hover-feedback"
                  onTransitionEnd={handleHomeFeedbackQuoteTransitionEnd}
                  ref={homeFeedbackQuoteRef}
                >
                  <span className={styles.homeFeedbackQuoteBurst}>
                    {homeFeedbackQuoteParticleIndexes.map((particleIndex) => (
                      <span
                        className={styles.homeFeedbackQuoteParticle}
                        data-testid="home-hover-feedback-particle"
                        key={particleIndex}
                      />
                    ))}
                  </span>
                  <span
                    className={styles.homeFeedbackQuoteText}
                    data-testid="home-hover-feedback-text"
                  >
                    {homeFeedbackQuote.text}
                  </span>
                </span>
              </>
            ) : null}
            <div className={styles.heroContent}>
              <div
                className={styles.heroFeedbackExclusion}
                data-testid="home-hero-feedback-exclusion"
                ref={heroFeedbackExclusionRef}
              >
                <h1 className={styles.heroTitle} id="home-hero-title">
                  Get <mark className={styles.freeHighlight}>FREE</mark> user testing on your web or
                  mobile app
                </h1>
                <p className={styles.heroLead}>
                  The only 100% free user testing platform with recordings and meaningful feedback
                  guaranteed
                </p>
                <Stack
                  className={`${styles.startForm} ${hasResumeSubmission ? styles.resumeForm : ""}`}
                  gap="sm"
                >
                  {hasResumeSubmission ? (
                    <Cluster className={styles.resumeActions} gap="sm">
                      <Button onClick={continueSubmission}>
                        Continue signing up
                        <ArrowRight aria-hidden="true" size={16} />
                      </Button>
                      <Button onClick={startNewSubmission} variant="secondary">
                        Start new
                      </Button>
                    </Cluster>
                  ) : (
                    <>
                      <TextField
                        id="home-product-name"
                        label={<span className="ds-sr-only">App name</span>}
                        value={productName}
                        onChange={(event) => setProductName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") startSubmission();
                        }}
                        placeholder="Enter your app's name"
                      />
                      <Button onClick={startSubmission}>Get started</Button>
                    </>
                  )}
                </Stack>
              </div>
            </div>
          </div>
        </Section>

        <HomeTrustedBySection
          submissions={trustedSubmissions}
          submittedTestCount={submittedTestCount}
        />

        <Container>
          <div className={styles.pageSections}>
            <HomeHowItWorksSection />

            {showRetiredHomeSections ? (
              <Section className={styles.process} aria-labelledby="home-process-title">
                <Stack gap="xl">
                  <Stack className={styles.sectionHeading} gap="sm">
                    <h2 id="home-process-title">How it works</h2>
                    <p>One dashboard tracks every insight</p>
                  </Stack>
                  <Grid className={styles.processGrid}>
                    <HomeProcessStep illustration="/images/how-it-works-bring-testers.png">
                      <h3>Bring your own testers</h3>
                      <p>
                        Create a usability test in seconds. Add an app, instructions and share it.
                        It's 100% free - no credit cards required.
                      </p>
                    </HomeProcessStep>
                    <HomeProcessStep illustration="/images/how-it-works-test-credits.png">
                      <h3>Earn free test credits</h3>
                      <p>
                        Are you looking for quick user feedback? Earn credits 1:1 by testing out
                        other users apps. The more you test, the more feedback you'll receive.
                      </p>
                    </HomeProcessStep>
                    <HomeProcessStep illustration="/images/how-it-works-ai-testers.png">
                      <h3>Use AI to find testers</h3>
                      <p>
                        Use Test4Test's recruitment agents to find real users. They'll search social
                        media, forums and online communities, introducing you and your app. This is
                        perfect if you're looking for the purest form of user feedback.
                      </p>
                    </HomeProcessStep>
                  </Grid>
                </Stack>
              </Section>
            ) : null}

            <Section aria-labelledby="home-free-feedback-title" data-testid="free-feedback-section">
              <Stack className={styles.freeFeedbackSectionContent} gap="xl">
                <h2 className={styles.freeFeedbackHeading} id="home-free-feedback-title">
                  2 <s aria-hidden="true">paid</s> <span>free</span> ways to get feedback
                </h2>
                <FreeFeedbackShowcase />
              </Stack>
            </Section>

            <Section
              className={styles.testableProducts}
              aria-labelledby="home-testable-products-title"
              data-testid="home-testable-products-section"
            >
              <Stack className={styles.testableProductsContent} gap="xl">
                <Stack className={styles.testableProductsHeading} gap="sm">
                  <h2 id="home-testable-products-title">
                    <span>If you can link to it,</span> <span>you can test it</span>
                  </h2>
                  <p>
                    Founders, students, UX designers, product managers, or researchers — Test4Test
                    makes getting valuable insights free and easy
                  </p>
                </Stack>
                <Grid className={styles.testableProductsGrid} gap="xl">
                  <HomeTestableProduct
                    icon={<Globe aria-hidden="true" size={24} />}
                    title="Websites"
                  >
                    Test live websites, sites in development, password-protected pages, and even
                    competitors’ sites
                  </HomeTestableProduct>
                  <HomeTestableProduct
                    icon={<PanelsTopLeft aria-hidden="true" size={24} />}
                    title="Prototypes"
                  >
                    Test any prototype with a link — Figma, Adobe XD, Axure, Sketch, Balsamiq, and
                    others
                  </HomeTestableProduct>
                  <HomeTestableProduct icon={<HomeMobilePlatformMarks />} title="Mobile apps">
                    Test mobile apps on Android or iOS. Whether they're published or still in beta
                  </HomeTestableProduct>
                </Grid>
              </Stack>
            </Section>

            <HomeManagedRecruitmentSection />

            {showRetiredHomeSections ? (
              <>
                <Section
                  className={styles.quality}
                  tone="subtle"
                  aria-labelledby="home-quality-title"
                >
                  <div className={styles.qualityGrid}>
                    <Stack className={styles.qualityCopy} gap="md">
                      <h2 id="home-quality-title">1 Test = 1 Credit</h2>
                      <p>
                        Every time you complete a test, someone will test-back your app. The more
                        you test, the more you&apos;ll rank up and the more feedback you&apos;ll
                        receive.
                      </p>
                    </Stack>
                    <Card className={styles.rankFrame}>
                      <div className={styles.rankHeader}>
                        <strong>Earn</strong>
                        <span>Example ranking</span>
                      </div>
                      <ol className={styles.rankList}>
                        {exampleRanks.map((item) => (
                          <li
                            className={item.current ? styles.currentRank : undefined}
                            key={item.name}
                          >
                            <span className={styles.rankNumber}>#{item.rank}</span>
                            <strong>{item.name}</strong>
                            <span>{item.detail}</span>
                          </li>
                        ))}
                      </ol>
                    </Card>
                  </div>
                </Section>

                <Section aria-labelledby="home-benefits-title">
                  <Stack gap="xl">
                    <Stack className={styles.sectionHeading} gap="sm">
                      <h2 id="home-benefits-title">Why Test4Test?</h2>
                    </Stack>
                    <Grid>
                      <HomeBenefitCard>
                        <h3>More Users</h3>
                        <p>
                          Users love trying new things and sometimes, they&apos;ll stick around.
                          Your first users are your most important users.
                        </p>
                      </HomeBenefitCard>
                      <HomeBenefitCard>
                        <h3>More Feedback</h3>
                        <p>
                          Have you ever gotten stuck and you&apos;re not sure what do next? User
                          feedback helps you think of things you&apos;ve never thought of before.
                        </p>
                      </HomeBenefitCard>
                      <HomeBenefitCard>
                        <h3>More Usage</h3>
                        <p>
                          Google and other search engines love how much time users spend on your
                          app. Your engagement will soar and you&apos;ll start ranking higher.
                        </p>
                      </HomeBenefitCard>
                    </Grid>
                  </Stack>
                </Section>
              </>
            ) : null}

            <Section className={styles.finalCta} aria-labelledby="home-final-cta-title">
              <Stack className={styles.finalCtaContent} gap="lg">
                <h2 id="home-final-cta-title">Ready for feedback?</h2>
                <p>It takes minutes to submit your app. Start seeing real user feedback today!</p>
                <Cluster className={styles.finalCtaActions}>
                  <Button size="large" onClick={continueSubmission}>
                    Get started
                    <ArrowRight aria-hidden="true" size={20} />
                  </Button>
                </Cluster>
              </Stack>
            </Section>
          </div>
        </Container>
      </div>
    </AppShell>
  );
}

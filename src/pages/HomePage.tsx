import { ArrowRight, ExternalLink, Globe2, Workflow } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TransitionEvent as ReactTransitionEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
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

const homeTrustedSubmissionFallbackDescription =
  "Open the app, move through the main experience, and share thoughtful usability feedback.";

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
}: {
  submission: HomeTrustedSubmission;
  logoUrl: string | null;
}) {
  return (
    <EarnTestCard
      className={styles.trustedByCard}
      title={
        <span className={styles.trustedByCardTitle}>
          <HomeTrustedLogo
            key={logoUrl ?? "initials"}
            name={submission.productName}
            url={logoUrl}
          />
          <span className={styles.trustedByProductName}>{submission.productName}</span>
          <Link
            aria-label={`Open ${submission.productName} test`}
            className={styles.trustedByOpenLink}
            title={`Open ${submission.productName} test`}
            to={`/test/${submission.id}`}
          >
            <ExternalLink aria-hidden="true" size={16} />
          </Link>
        </span>
      }
      description={submission.description || homeTrustedSubmissionFallbackDescription}
      badges={[]}
    />
  );
}

function HomeTrustedBySection({ submissions }: { submissions: HomeTrustedSubmission[] }) {
  const shouldAnimate = submissions.length > 1;
  const [logos, setLogos] = useState<Record<string, string | null>>({});

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
        <HomeTrustedTestCard submission={submission} logoUrl={logos[submission.id] ?? null} />
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
      <Container>
        <div className={styles.trustedByHeader}>
          <h2 id="home-trusted-by-title">Trusted by</h2>
        </div>
      </Container>

      <div
        className={styles.trustedByViewport}
        data-contained-horizontal-overflow="true"
        data-testid="home-trusted-by-viewport"
      >
        <div
          className={`${styles.trustedByTrack}${
            shouldAnimate ? "" : ` ${styles.trustedByTrackStatic}`
          }`}
          data-testid="home-trusted-by-track"
        >
          {shouldAnimate ? (
            <ol
              className={`${styles.trustedByList} ${styles.trustedByDuplicate}`}
              aria-hidden="true"
              inert
            >
              {renderCards(true)}
            </ol>
          ) : null}
          <ol className={styles.trustedByList} aria-label="Top tests available on Earn">
            {renderCards(false)}
          </ol>
        </div>
      </div>
    </Section>
  );
}

const freeFeedbackMethods = [
  {
    title: "Earn 1:1 credits",
    description: "Earn credits 1:1 (we don't take a cut)",
    id: "home-test-other-founders-title",
    illustration: "/images/home-feedback-earn-credit.webp",
    width: 1419,
    height: 1109,
  },
  {
    title: "Bring your own testers",
    description: "There are no limits - bring as many as you want",
    id: "home-bring-your-own-testers-title",
    illustration: "/images/home-feedback-share-test.webp",
    width: 1420,
    height: 1108,
  },
] as const;

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
          {/* ds-exception: home-feedback-supplied-illustrations */}
          <img
            alt=""
            aria-hidden="true"
            className={styles.feedbackPreview}
            decoding="async"
            height={method.height}
            loading="lazy"
            src={method.illustration}
            width={method.width}
          />
          <Stack className={styles.feedbackMethodCopy} gap="md">
            <h2 id={method.id}>{method.title}</h2>
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
            <h2 id="home-managed-recruitment-title">
              Most platforms give you tools. We go find the people.
            </h2>
            <p>
              Use Test4Test for free, or let us recruit real, target-matched participants from
              relevant communities.
            </p>
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
              <span className={styles.managedComparisonLabel}>Typical platforms</span>
              <h3>Do the recruiting yourself</h3>
              <p>You manage outreach, screening, and follow-up.</p>
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
                  Test4Test Managed
                </span>
                <h3>Let us handle recruitment</h3>
                <p>We recruit real people who match your audience and send them to your test.</p>
              </Stack>
              <Button
                className={styles.managedRecruitmentCta}
                onClick={openManagedTestingInquiry}
                size="large"
                type="button"
              >
                Explore managed testing
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

        <HomeTrustedBySection submissions={trustedSubmissions} />

        <Container>
          <div className={styles.pageSections}>
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

            <Section
              aria-labelledby="home-test-other-founders-title home-bring-your-own-testers-title"
              data-testid="free-feedback-section"
            >
              <FreeFeedbackShowcase />
            </Section>

            <Section
              className={styles.testableProducts}
              aria-labelledby="home-testable-products-title"
              data-testid="home-testable-products-section"
            >
              <Stack className={styles.testableProductsContent} gap="xl">
                <Stack className={styles.testableProductsHeading} gap="sm">
                  <h2 id="home-testable-products-title">If you can link to it, you can test it</h2>
                  <p>
                    UX designer, product manager, researcher, founder, or agency — Userbrain lets
                    you test your products with real people.
                  </p>
                </Stack>
                <Grid className={styles.testableProductsGrid} gap="xl">
                  <HomeTestableProduct
                    icon={<Globe2 aria-hidden="true" size={24} />}
                    title="Websites"
                  >
                    Test live websites, sites in development, password-protected pages, and even
                    competitors’ sites.
                  </HomeTestableProduct>
                  <HomeTestableProduct
                    icon={<Workflow aria-hidden="true" size={24} />}
                    title="Prototypes"
                  >
                    Test any prototype with a public link — Figma, Adobe XD, Axure, Sketch,
                    Balsamiq, and many more.
                  </HomeTestableProduct>
                  <HomeTestableProduct icon={<HomeMobilePlatformMarks />} title="Mobile apps">
                    Test mobile apps on Android or iOS, and choose whether participants use phones
                    or tablets.
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
              <Stack gap="lg">
                <h2 id="home-final-cta-title">Ready for feedback?</h2>
                <p>It takes minutes to submit your app and start seeing real user feedback</p>
                <Cluster>
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

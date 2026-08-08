import { ArrowRight } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
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
  Grid,
  Section,
  Stack,
  TextField,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { trackEvent } from "../lib/analytics";
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

const processSteps = [
  {
    illustration: "/images/how-it-works-bring-testers.png",
    title: "Bring your own testers",
    body: "Create a usability test in seconds. Add your app, your instructions and share it as much as you want. It's 100% free - no credit cards required.",
  },
  {
    illustration: "/images/how-it-works-test-credits.png",
    title: "Earn free test credits",
    body: "Are you looking for quick and fast user testing? Earn credits 1:1 by testing out other users apps. The more you test and the higher feedback quality you give, the more you'll receive.",
  },
  {
    illustration: "/images/how-it-works-ai-testers.png",
    title: "Use AI to find testers",
    body: "Use Test4Test's cyborgs (half human/half AI) to find real users from social media, forums and online communities. This is perfect if you're looking for the highest quality feedback.",
  },
] as const;

const homeBenefitCards = [
  {
    title: "More Users",
    body: "Users love trying new things and sometimes, they'll stick around. Your first users are your most important users.",
  },
  {
    title: "More Feedback",
    body: "Have you ever gotten stuck and you're not sure what do next? User feedback helps you think of things you've never thought of before.",
  },
  {
    title: "More Usage",
    body: "Google and other search engines love how much time users spend on your app. Your engagement will soar and you'll start ranking higher.",
  },
];

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
  const heroPanelRef = useRef<HTMLDivElement>(null);
  const homeFeedbackQuoteRef = useRef<HTMLSpanElement>(null);
  const activeHomeFeedbackQuoteIdRef = useRef<number | null>(null);
  const isMouseOverHeroPanelRef = useRef(false);
  const latestHomeFeedbackPointerRef = useRef<HomeFeedbackPointerPosition | null>(null);
  const lastHomeFeedbackQuoteIndexRef = useRef<number | null>(null);
  const nextHomeFeedbackQuoteIdRef = useRef(1);
  const nextHomeFeedbackQuoteTimerRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const showNextHomeFeedbackQuote = useCallback(() => {
    const pointerPosition = latestHomeFeedbackPointerRef.current;
    if (
      !isMouseOverHeroPanelRef.current ||
      !pointerPosition ||
      activeHomeFeedbackQuoteIdRef.current !== null ||
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

  const scheduleNextHomeFeedbackQuote = useCallback(() => {
    clearNextHomeFeedbackQuoteTimer();
    if (
      !isMouseOverHeroPanelRef.current ||
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
        clearNextHomeFeedbackQuoteTimer();
        activeHomeFeedbackQuoteIdRef.current = null;
        setHomeFeedbackQuote(null);
        return;
      }

      showNextHomeFeedbackQuote();
    };

    reducedMotionPreference.addEventListener("change", removeQuoteForReducedMotion);
    return () => {
      reducedMotionPreference.removeEventListener("change", removeQuoteForReducedMotion);
      clearNextHomeFeedbackQuoteTimer();
    };
  }, [clearNextHomeFeedbackQuoteTimer, showNextHomeFeedbackQuote]);

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

  const handleHeroPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;

    isMouseOverHeroPanelRef.current = true;
    updateHomeFeedbackPointerPosition(event);
    showNextHomeFeedbackQuote();
  };

  const handleHeroPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      updateHomeFeedbackPointerPosition(event);
    }
  };

  const handleHeroPointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") {
      isMouseOverHeroPanelRef.current = false;
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
        </Section>

        <Container>
          <div className={styles.pageSections}>
            <Section className={styles.process} aria-labelledby="home-process-title">
              <Stack gap="xl">
                <Stack className={styles.sectionHeading} gap="sm">
                  <h2 id="home-process-title">How it works</h2>
                  <p>One shared dashboard to keep track of every insight</p>
                </Stack>
                <Grid className={styles.processGrid}>
                  {processSteps.map(({ illustration, title, body }) => (
                    <Card as="article" className={styles.step} key={title}>
                      <img
                        className={styles.processIllustration}
                        src={illustration}
                        alt=""
                        aria-hidden="true"
                        decoding="async"
                        width={960}
                        height={540}
                      />
                      <div className={styles.stepCopy}>
                        <h3>{title}</h3>
                        <p>{body}</p>
                      </div>
                    </Card>
                  ))}
                </Grid>
              </Stack>
            </Section>

            <Section className={styles.quality} tone="subtle" aria-labelledby="home-quality-title">
              <div className={styles.qualityGrid}>
                <Stack className={styles.qualityCopy} gap="md">
                  <h2 id="home-quality-title">1 Test = 1 Credit</h2>
                  <p>
                    Every time you complete a test, someone will test-back your app. The more you
                    test, the more you&apos;ll rank up and the more feedback you&apos;ll receive.
                  </p>
                </Stack>
                <Card className={styles.rankFrame}>
                  <div className={styles.rankHeader}>
                    <strong>Earn</strong>
                    <span>Example ranking</span>
                  </div>
                  <ol className={styles.rankList}>
                    {exampleRanks.map((item) => (
                      <li className={item.current ? styles.currentRank : undefined} key={item.name}>
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
                  {homeBenefitCards.map(({ title, body }) => (
                    <Card as="article" className={styles.benefit} key={title}>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </Card>
                  ))}
                </Grid>
              </Stack>
            </Section>

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

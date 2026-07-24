import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Cluster,
  Container,
  Grid,
  Section,
  Stack,
  StatusIndicator,
  TextField,
} from "@test4test/design-system";
import { AppShell, type AudienceRole } from "../components/Layout";
import { trackEvent } from "../lib/analytics";
import {
  defaultImage,
  getAbsoluteUrl,
  siteTitle,
  siteUrl,
  usePageMetadata,
} from "../lib/pageMetadata";
import { getSubmitFlowResume } from "../lib/pendingSubmission";
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
    title: "Submit",
    body: "Add your app name, live link, and questions, or let AI generate them for you.",
  },
  {
    title: "Test",
    body: "Review apps from other users and earn credits for your app.",
  },
  {
    title: "Review",
    body: "Monitor your app's feedback with detailed summaries and raw responses.",
  },
];

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

export function HomePage() {
  usePageMetadata({
    canonicalPath: "/",
    image: defaultImage,
    jsonLd: homeOrganizationJsonLd,
  });

  const [productName, setProductName] = useState("");
  const [hasResumeSubmission] = useState(() => Boolean(getSubmitFlowResume()));
  const navigate = useNavigate();

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

  const handleAudienceRoleChange = (role: AudienceRole) => {
    if (role === "Tester") navigate("/get-paid-to-test");
  };

  return (
    <AppShell
      variant="marketing"
      showAudienceToggle
      audienceRole="Founder"
      onAudienceRoleChange={handleAudienceRoleChange}
      contentWidth="viewport"
    >
      <div className={styles.page}>
        <Section className={styles.hero} aria-labelledby="home-hero-title">
          <div className={styles.heroPanel}>
            <div className={styles.heroStatus}>
              <StatusIndicator tone="info">Recording live</StatusIndicator>
            </div>
            <div className={styles.heroContent}>
              <h1 className={styles.heroTitle} id="home-hero-title">
                Get <mark className={styles.freeHighlight}>FREE</mark> user testing on your web or
                mobile app
              </h1>
              <p className={styles.heroLead}>
                The only 100% free user testing tool that offers video recordings and feedback
                guaranteed
              </p>
              <Card className={styles.startCard}>
                {hasResumeSubmission ? (
                  <Stack gap="md">
                    <p>You have a saved submission in progress.</p>
                    <Button onClick={continueSubmission}>
                      Continue submission
                      <ArrowRight aria-hidden="true" size={16} />
                    </Button>
                  </Stack>
                ) : (
                  <Stack gap="md">
                    <TextField
                      id="home-product-name"
                      label="What's the name of your app?"
                      value={productName}
                      onChange={(event) => setProductName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") startSubmission();
                      }}
                      placeholder="Enter your app's name"
                    />
                    <Button onClick={startSubmission}>
                      Get started
                      <ArrowRight aria-hidden="true" size={16} />
                    </Button>
                  </Stack>
                )}
              </Card>
            </div>
          </div>
        </Section>

        <Container>
          <div className={styles.pageSections}>
            <Section className={styles.process} aria-labelledby="home-process-title">
              <Stack gap="xl">
                <Stack className={styles.sectionHeading} gap="sm">
                  <h2 id="home-process-title">How it works</h2>
                  <p>One shared workflow turns useful testing into useful feedback.</p>
                </Stack>
                <Grid>
                  {processSteps.map(({ title, body }, index) => (
                    <article className={styles.step} key={title}>
                      <span className={styles.stepNumber} aria-hidden="true">
                        {index + 1}
                      </span>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </article>
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

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Link,
  PageHeader,
  Stack,
  Surface,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import {
  CREDIT_PACKS,
  createCreditCheckout,
  creditCheckoutEnabled,
  getCreditPurchase,
} from "../lib/creditPurchases";
import styles from "./BuyCreditsPage.module.css";

const creditPacks = CREDIT_PACKS;

export function BuyCreditsPage() {
  const [selectedPack, setSelectedPack] = useState<(typeof creditPacks)[number] | null>(null);
  const { search } = useLocation();
  const enabled = creditCheckoutEnabled();
  const [busyPack, setBusyPack] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [canRetry, setCanRetry] = useState(false);
  const requests = useRef<Record<string, string>>({});
  const purchasing = useRef(false);
  const purchaseId = new URLSearchParams(search).get("purchase");

  useEffect(() => {
    if (!enabled || !purchaseId) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setMessage("Confirming your payment. Credits will appear once payment is confirmed.");
    setFailed(false);
    setCanRetry(false);
    const check = async (attempt: number) => {
      try {
        const purchase = await getCreditPurchase(purchaseId);
        if (canceled) return;
        if (purchase.review_required)
          setMessage(
            "This purchase needs review. Contact support@test4test.io with your purchase reference.",
          );
        else if (purchase.credits_granted)
          setMessage(
            `${purchase.credits} ${purchase.credits === 1 ? "credit has" : "credits have"} been added to your account.`,
          );
        else if (purchase.status === "failed" || purchase.status === "expired") {
          setMessage("Payment wasn't completed. You can start a new checkout.");
        } else if (attempt < 14) timer = setTimeout(() => void check(attempt + 1), 2000);
        else {
          setMessage(
            "Your payment is still being confirmed. You can check again without making another purchase.",
          );
          setCanRetry(true);
        }
      } catch (error) {
        if (canceled) return;
        setMessage(error instanceof Error ? error.message : "Unable to confirm payment.");
        setFailed(true);
        setCanRetry(true);
      }
    };
    void check(0);
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [enabled, purchaseId, retry]);

  const buy = async (pack: (typeof creditPacks)[number]) => {
    if (!enabled) {
      setSelectedPack(pack);
      return;
    }
    if (purchasing.current) return;
    purchasing.current = true;
    setBusyPack(pack.id);
    setMessage("");
    setFailed(false);
    setCanRetry(false);
    try {
      // Retain the same request after timeouts so retrying reuses the Stripe session.
      requests.current[pack.id] ??= crypto.randomUUID();
      window.location.assign(await createCreditCheckout(pack.id, requests.current[pack.id]));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Checkout is unavailable. Please try again.",
      );
      setFailed(true);
    } finally {
      setBusyPack(null);
      purchasing.current = false;
    }
  };
  // Keep the local preview identity across navigation; production URLs stay unchanged.
  const earnPath =
    import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1" ? `/earn${search}` : "/earn";

  return (
    <AppShell>
      <div className={styles.page}>
        <PageHeader title="Buy credits" />
        {message && <Alert tone={failed ? "danger" : "info"}>{message}</Alert>}
        {canRetry && (
          <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
            Check payment status
          </Button>
        )}
        {enabled && new URLSearchParams(search).get("canceled") === "1" && !message && (
          <Alert>Checkout was canceled. No credits were added.</Alert>
        )}
        <div className={styles.packs}>
          {creditPacks.map((pack) => (
            <Surface
              as="section"
              key={pack.credits}
              aria-labelledby={`credit-pack-${pack.credits}`}
              padding="none"
              className={`${styles.pack} ${pack.bestValue ? styles.bestValue : ""}`.trim()}
            >
              <div className={styles.packHeading}>
                <h2 id={`credit-pack-${pack.credits}`}>
                  {pack.credits} {pack.credits === 1 ? "credit" : "credits"}
                </h2>
                {pack.bestValue && <Badge tone="info">Best value</Badge>}
              </div>
              <div className={styles.priceGroup}>
                <p className={styles.price}>{pack.price}</p>
                <p className={styles.purchaseType}>One-time purchase</p>
              </div>
              <p className={styles.benefit}>
                Unlock {pack.credits} {pack.credits === 1 ? "recording" : "recordings"}
              </p>
              <Button
                fullWidth
                size="large"
                variant={pack.bestValue ? "primary" : "secondary"}
                onClick={() => void buy(pack)}
                disabled={busyPack !== null}
                loading={busyPack === pack.id}
                loadingLabel="Opening checkout"
              >
                Buy {pack.credits} {pack.credits === 1 ? "credit" : "credits"}
                <ArrowRight aria-hidden="true" />
              </Button>
            </Surface>
          ))}
        </div>
        {enabled && <p>Prices are in USD. Applicable tax is calculated at checkout.</p>}
        <p className={styles.guarantee}>
          All credits come with a satisfaction guarantee. If you don't receive high quality
          feedback, simply rate the recording less than 5 stars and the tester will be prompted to
          submit new feedback or we'll refund your credit.
        </p>
      </div>
      <Dialog
        open={selectedPack !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPack(null);
        }}
        title="Credit purchases aren't available yet"
        footer={<Button onClick={() => setSelectedPack(null)}>Got it</Button>}
      >
        <Stack>
          <p>
            You selected {selectedPack?.credits}{" "}
            {selectedPack?.credits === 1 ? "credit" : "credits"}
            {" for "}
            {selectedPack?.price}. You haven't been charged.
          </p>
          <p>You can earn credits by testing other apps in the meantime.</p>
          <Link to={earnPath}>Earn credits</Link>
        </Stack>
      </Dialog>
    </AppShell>
  );
}

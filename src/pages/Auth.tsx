import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/accueil") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, needsOnboarding, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asParam = searchParams.get("as");
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(needsOnboarding ? `/onboarding${asParam ? `?as=${asParam}` : ""}` : redirect);
    }
  }, [authLoading, isAuthenticated, needsOnboarding, navigate, redirect, asParam]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
    } catch (err) {
      setError("Impossible d'envoyer le code. Réessaie dans quelques instants.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(needsOnboarding ? `/onboarding${asParam ? `?as=${asParam}` : ""}` : redirect);
    } catch {
      setError("Le code saisi est incorrect. Vérifie ta boîte mail et réessaie.");
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="hero-grid absolute inset-x-0 top-0 h-72" aria-hidden />
      <div className="relative flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 flex items-center justify-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">π</span>
            <span className="font-display text-xl font-extrabold tracking-tight">À LA PIÈCE</span>
          </Link>
          <Card className="card-shadow-lg border-border/60 pb-0">
            {step === "signIn" ? (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-display text-2xl">Bon retour !</CardTitle>
                  <CardDescription>
                    Entre ton email pour te connecter ou créer un compte — le code arrive dans ta boîte.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleEmailSubmit}>
                  <CardContent>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        name="email"
                        placeholder="ton.email@exemple.fr"
                        type="email"
                        className="pl-9"
                        disabled={isLoading}
                        required
                        autoComplete="email"
                      />
                    </div>
                    {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="mt-4 w-full" size="lg" disabled={isLoading}>
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>Recevoir mon code <ArrowRight className="size-4" /></>
                      )}
                    </Button>
                  </CardContent>
                </form>
              </>
            ) : (
              <>
                <CardHeader className="text-center">
                  <CardTitle className="font-display text-2xl">Ton code secret</CardTitle>
                  <CardDescription>
                    Un code à 6 chiffres a été envoyé à <strong>{step.email}</strong>
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleOtpSubmit}>
                  <CardContent className="space-y-4">
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />
                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                            (e.target as HTMLElement).closest("form")?.requestSubmit();
                          }
                        }}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {error && <p className="text-center text-sm text-destructive">{error}</p>}
                    <p className="text-center text-sm text-muted-foreground">
                      Pas reçu ?{" "}
                      <Button variant="link" className="h-auto p-0" onClick={() => setStep("signIn")}>
                        Renvoyer vers un autre email
                      </Button>
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full" size="lg" disabled={isLoading || otp.length !== 6}>
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>Vérifier et continuer <ArrowRight className="size-4" /></>
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}
            <div className="flex items-center justify-center gap-1.5 rounded-b-lg border-t bg-muted px-6 py-3 text-center text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-500" /> Connexion sécurisée par code à usage unique — sans mot de passe
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}

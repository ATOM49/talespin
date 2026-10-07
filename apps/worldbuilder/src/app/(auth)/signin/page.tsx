import { auth } from '@/auth';
import { SignInProviders } from '@/components/auth/signin-providers';
import { redirect } from 'next/navigation';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl;
  const session = await auth();

  if (session) {
    redirect(callbackUrl || '/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-background p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold text-primary">Welcome back</p>
          <h1 className="text-2xl font-bold">Sign in to Talespin</h1>
          <p className="text-sm text-muted-foreground">
            Use your Google account to continue.
          </p>
        </div>
        <SignInProviders
          callbackUrl={callbackUrl}
          e2eEnabled={
            process.env.E2E_TEST_MODE === 'true' &&
            process.env.NODE_ENV !== 'production'
          }
        />
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}

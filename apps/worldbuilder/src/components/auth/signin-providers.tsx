'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

const PROVIDERS = [{ id: 'google', label: 'Continue with Google' }];

interface SignInProvidersProps {
  callbackUrl?: string;
  e2eEnabled?: boolean;
}

export function SignInProviders({
  callbackUrl,
  e2eEnabled = false,
}: SignInProvidersProps) {
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const providers = e2eEnabled
    ? [...PROVIDERS, { id: 'e2e', label: 'Continue with E2E account' }]
    : PROVIDERS;

  const handleSignIn = async (provider: string) => {
    setPendingProvider(provider);
    try {
      await signIn(provider, {
        callbackUrl: callbackUrl || '/',
      });
    } finally {
      setPendingProvider(null);
    }
  };

  return (
    <div className="space-y-3">
      {providers.map((provider) => (
        <Button
          key={provider.id}
          className="w-full"
          variant="outline"
          disabled={Boolean(pendingProvider)}
          onClick={() => handleSignIn(provider.id)}
        >
          {pendingProvider === provider.id ? 'Redirecting…' : provider.label}
        </Button>
      ))}
    </div>
  );
}

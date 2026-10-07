import type { NextAuthConfig } from 'next-auth';
import type { AppUserRole } from '@/lib/auth/roles';

// Session settings shared by `auth.ts` and the middleware. Kept free of
// Prisma so the middleware bundle stays synchronous; `auth.ts` adds the
// adapter, providers, and the database-backed `jwt` callback.
export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },
  trustHost: true,
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.role = token.role as AppUserRole | undefined;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthConfig;

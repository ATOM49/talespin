import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Facebook from 'next-auth/providers/facebook';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import type { AppUserRole } from '@/lib/auth/roles';

const ensureEnv = (key: string) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required auth environment variable: ${key}`);
  }
  return value;
};

const e2eTestMode =
  process.env.E2E_TEST_MODE === 'true' && process.env.NODE_ENV !== 'production';

// Providers are resolved lazily so `next build` can collect page data without
// OAuth secrets; a missing secret fails the first auth request instead.
const createProviders = (): NextAuthConfig['providers'] =>
  e2eTestMode
    ? [
        Credentials({
          id: 'e2e',
          name: 'E2E account',
          credentials: {},
          async authorize() {
            const email = 'playwright@talespin.local';
            const user = await prisma.user.upsert({
              where: { email },
              update: { name: 'Playwright Builder', role: null },
              create: { email, name: 'Playwright Builder' },
            });

            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role ?? undefined,
            };
          },
        }),
      ]
    : [
        Google({
          clientId: ensureEnv('GOOGLE_CLIENT_ID'),
          clientSecret: ensureEnv('GOOGLE_CLIENT_SECRET'),
        }),
        Facebook({
          clientId: ensureEnv('FACEBOOK_CLIENT_ID'),
          clientSecret: ensureEnv('FACEBOOK_CLIENT_SECRET'),
        }),
      ];

const adapter = PrismaAdapter(prisma);

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter,
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin' },
  trustHost: true,
  providers: createProviders(),
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user.role as AppUserRole | undefined) ?? undefined;
        return token;
      }

      // Always fetch latest role on update trigger or when role is missing
      if ((trigger === 'update' || !token.role) && token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true },
        });
        token.role = (dbUser?.role as AppUserRole | undefined) ?? undefined;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.role = token.role as AppUserRole | undefined;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}));

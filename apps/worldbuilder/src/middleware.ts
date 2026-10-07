import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

// `/api/internal` routes authenticate with their own secrets (e.g. the
// Vercel Cron `CRON_SECRET`) instead of a user session.
const PUBLIC_ROUTES = [
  '/signin',
  '/api/auth',
  '/api/user/role',
  '/api/internal/',
];
const ROLE_SELECTION_ROUTE = '/choose-role';

// Read the session through the same Auth.js config the pages use. Decoding
// the cookie separately (getToken) can disagree with `auth()` about the cookie
// name or secret, and then /signin bounces signed-in users straight back here
// in an endless redirect loop.
const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const { nextUrl } = request;
  const user = request.auth?.user;
  const isPublic = PUBLIC_ROUTES.some((path) =>
    nextUrl.pathname.startsWith(path),
  );
  const isRoleSelectionRoute =
    nextUrl.pathname.startsWith(ROLE_SELECTION_ROUTE);

  if (!user && !isPublic) {
    if (nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const signInUrl = new URL('/signin', nextUrl);
    signInUrl.searchParams.set('callbackUrl', nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  if (user && !user.role && !isPublic && !isRoleSelectionRoute) {
    if (nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json(
        {
          error: 'Please select a role to continue',
          redirectTo: '/choose-role',
        },
        { status: 403 },
      );
    }

    const selectRoleUrl = new URL(ROLE_SELECTION_ROUTE, nextUrl);
    selectRoleUrl.searchParams.set('callbackUrl', nextUrl.href);
    return NextResponse.redirect(selectRoleUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Vercel Services cannot run Edge functions, so middleware uses the Node.js
  // runtime (stable since Next.js 15.5).
  runtime: 'nodejs',
  // Skip Next internals and public assets (fonts, images) so the sign-in page
  // can load them before a session exists.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|otf|woff|woff2)$).*)',
  ],
};

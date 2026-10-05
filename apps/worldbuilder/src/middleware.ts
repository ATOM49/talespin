import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// `/api/internal` routes authenticate with their own secrets (e.g. the
// Vercel Cron `CRON_SECRET`) instead of a user session.
const PUBLIC_ROUTES = [
  '/signin',
  '/api/auth',
  '/api/user/role',
  '/api/internal/',
];
const SECURE_SESSION_COOKIE = '__Secure-authjs.session-token';
const ROLE_SELECTION_ROUTE = '/choose-role';

export default async function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const isPublic = PUBLIC_ROUTES.some((path) =>
    nextUrl.pathname.startsWith(path),
  );
  const isRoleSelectionRoute =
    nextUrl.pathname.startsWith(ROLE_SELECTION_ROUTE);
  // Auth.js prefixes the session cookie with __Secure- on HTTPS (e.g. on
  // Vercel); getToken must be told, or it looks for the wrong cookie.
  const secureCookie =
    nextUrl.protocol === 'https:' ||
    request.cookies
      .getAll()
      .some((cookie) => cookie.name.startsWith(SECURE_SESSION_COOKIE));
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie,
  });

  if (!token && !isPublic) {
    if (nextUrl.pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const signInUrl = new URL('/signin', nextUrl);
    signInUrl.searchParams.set('callbackUrl', nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  if (token && !token.role && !isPublic && !isRoleSelectionRoute) {
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
}

export const config = {
  // Skip Next internals and public assets (fonts, images) so the sign-in page
  // can load them before a session exists.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|otf|woff|woff2)$).*)',
  ],
};

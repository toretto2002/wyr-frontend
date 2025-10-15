import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Guard per proteggere le rotte che richiedono autenticazione
 * - Controlla se l'utente è autenticato
 * - Reindirizza al login se non autenticato
 * - Salva l'URL di destinazione per redirect post-login
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Controlla se l'utente è autenticato
  if (authService.isAuthenticated()) {
    return true;
  }

  // Salva l'URL di destinazione per il redirect dopo il login
  const returnUrl = state.url;
  sessionStorage.setItem('returnUrl', returnUrl);

  // Reindirizza al login con parametri informativi
  router.navigate(['/login'], {
    queryParams: {
      returnUrl: returnUrl,
      reason: 'authentication_required'
    }
  });

  return false;
};

/**
 * Guard per proteggere rotte che richiedono ruoli specifici
 * Uso: canActivate: [roleGuard(['admin', 'moderator'])]
 */
export function roleGuard(allowedRoles: string[]) {
  const guard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Prima controlla se è autenticato
    if (!authService.isAuthenticated()) {
      const returnUrl = state.url;
      sessionStorage.setItem('returnUrl', returnUrl);

      router.navigate(['/login'], {
        queryParams: {
          returnUrl: returnUrl,
          reason: 'authentication_required'
        }
      });
      return false;
    }

    // Controlla i ruoli
    const user = authService.getUser();
    const userRoles = user?.roles || [];

    const hasRequiredRole = allowedRoles.some(role =>
      userRoles.includes(role)
    );

    if (!hasRequiredRole) {
      // Reindirizza a pagina di accesso negato
      router.navigate(['/access-denied'], {
        queryParams: {
          requiredRoles: allowedRoles.join(','),
          currentRoles: userRoles.join(',')
        }
      });
      return false;
    }

    return true;
  };

  return guard;
}

/**
 * Guard per evitare che utenti autenticati accedano a pagine di login/register
 * Uso tipico: pagine di login, registrazione, forgot password
 */
export const guestOnlyGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Se l'utente è già autenticato, reindirizza alla dashboard
  if (authService.isAuthenticated()) {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};

/**
 * Guard per proteggere rotte amministrative
 * Shortcut per roleGuard(['admin'])
 */
export const adminGuard: CanActivateFn = roleGuard(['admin']);

/**
 * Guard per utenti premium
 * Shortcut per roleGuard(['premium', 'admin'])
 */
export const premiumGuard: CanActivateFn = roleGuard(['premium', 'admin']);

// Export per retrocompatibilità
export const guardGuard = authGuard;

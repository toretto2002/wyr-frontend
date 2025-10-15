import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError, switchMap, Observable } from 'rxjs';
import { AuthService } from './auth.service';

// Configurazione per l'interceptor
const INTERCEPTOR_CONFIG = {
  // URL che richiedono autenticazione
  PROTECTED_URLS: [
    'http://localhost:3000/api',  // Il tuo backend
    'https://your-api-domain.com/api',  // Produzione
    '/api'  // Relative URLs
  ],

  // URL che NON devono avere il token (whitelist)
  EXCLUDED_URLS: [
    '/auth/login',
    '/auth/register',
    '/auth/reset-password',
    'https://maps.googleapis.com',
    'https://analytics.google.com',
    // Aggiungi qui altre API esterne
  ],

  // Header da aggiungere
  AUTH_HEADER_NAME: 'Authorization',
  TOKEN_PREFIX: 'Bearer '
};

/**
 * Interceptor per gestire automaticamente l'autenticazione
 * - Aggiunge il token solo alle chiamate API protette
 * - Gestisce il refresh automatico del token
 * - Fa logout automatico se il token non è più valido
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Controlla se questa richiesta ha bisogno di autenticazione
  if (!shouldAddAuthToken(req.url)) {
    return next(req);
  }

  // Ottieni il token corrente
  const token = authService.getToken();

  // Se non c'è token e la richiesta è protetta, lascia passare
  // (il server risponderà con 401 se necessario)
  let authReq = req;
  if (token) {
    authReq = addAuthorizationHeader(req, token);
  }

  // Invia la richiesta e gestisci gli errori di autenticazione
  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Gestisci errori 401 (Unauthorized)
      if (error.status === 401 && token) {
        return handleUnauthorizedError(authService, router, req, next);
      }

      // Gestisci errori 403 (Forbidden)
      if (error.status === 403) {
        console.warn('Accesso negato:', error.url);
        // Potresti voler navigare a una pagina di errore
      }

      return throwError(() => error);
    })
  );
};

/**
 * Determina se la richiesta ha bisogno del token di autenticazione
 */
function shouldAddAuthToken(url: string): boolean {
  // Controlla se l'URL è escluso
  const isExcluded = INTERCEPTOR_CONFIG.EXCLUDED_URLS.some(excludedUrl =>
    url.includes(excludedUrl)
  );

  if (isExcluded) {
    return false;
  }

  // Controlla se l'URL è protetto
  const isProtected = INTERCEPTOR_CONFIG.PROTECTED_URLS.some(protectedUrl =>
    url.startsWith(protectedUrl) || url.includes(protectedUrl)
  );

  return isProtected;
}

/**
 * Aggiunge l'header di autorizzazione alla richiesta
 */
function addAuthorizationHeader(req: HttpRequest<any>, token: string): HttpRequest<any> {
  return req.clone({
    setHeaders: {
      [INTERCEPTOR_CONFIG.AUTH_HEADER_NAME]: `${INTERCEPTOR_CONFIG.TOKEN_PREFIX}${token}`
    }
  });
}

/**
 * Gestisce errori 401 tentando il refresh del token
 */
function handleUnauthorizedError(
  authService: AuthService,
  router: Router,
  originalReq: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<any> {
  console.log('Token scaduto, tentativo di refresh...');

  // Prova a fare refresh del token
  return authService.refreshToken().pipe(
    switchMap((refreshResponse) => {
      if (refreshResponse.success && refreshResponse.data?.token) {
        console.log('Token refreshed con successo');

        // Riprova la richiesta originale con il nuovo token
        const newAuthReq = addAuthorizationHeader(originalReq, refreshResponse.data.token);
        return next(newAuthReq);
      } else {
        // Refresh fallito, fai logout
        return handleAuthFailure(authService, router);
      }
    }),
    catchError(() => {
      // Refresh fallito, fai logout
      return handleAuthFailure(authService, router);
    })
  );
}

/**
 * Gestisce il fallimento dell'autenticazione
 */
function handleAuthFailure(authService: AuthService, router: Router): Observable<never> {
  console.log('Autenticazione fallita, eseguo logout...');

  // Fai logout e reindirizza al login
  authService.logout(false); // Non navigare automaticamente
  router.navigate(['/login'], {
    queryParams: {
      returnUrl: router.url,
      reason: 'session_expired'
    }
  });

  return throwError(() => new Error('Sessione scaduta'));
}

// Export con nome diverso per retrocompatibilità
export const interceptorInterceptor = authInterceptor;

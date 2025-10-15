import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError, timer } from 'rxjs';
import { map, catchError, tap, switchMap, finalize } from 'rxjs/operators';
import {
  LoginRequest,
  LoginResponse,
  User,
  AuthState,
  AuthStatus,
  RefreshTokenRequest,
  LogoutRequest,
  PasswordResetRequest,
  PasswordResetResponse,
  ChangePasswordRequest,
  AUTH_STORAGE_KEYS,
  AUTH_CONFIG
} from './auth.models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // API URLs - usando environment variable dal .env
  private readonly API_BASE_URL = 'http://localhost:5000';
  private readonly AUTH_ENDPOINTS = {
    LOGIN: `${this.API_BASE_URL}/login`,
    LOGOUT: `${this.API_BASE_URL}/logout`,
    REFRESH: `${this.API_BASE_URL}/refresh`,
    PROFILE: `${this.API_BASE_URL}/profile`,
    RESET_PASSWORD: `${this.API_BASE_URL}/reset-password`,
    CHANGE_PASSWORD: `${this.API_BASE_URL}/change-password`,
  };

  // Stato dell'autenticazione con Angular Signals (Angular 19)
  private readonly _authState = signal<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    refreshToken: null,
    isLoading: false,
    error: null,
  });

  // Subject per backward compatibility con Observable
  private readonly authStateSubject = new BehaviorSubject<AuthState>(
    this._authState()
  );

  // Timer per auto-refresh del token
  private refreshTokenTimer?: ReturnType<typeof setTimeout>;

  // Computed signals per facilità d'uso
  public readonly isAuthenticated = computed(
    () => this._authState().isAuthenticated
  );
  public readonly currentUser = computed(() => this._authState().user);
  public readonly isLoading = computed(() => this._authState().isLoading);
  public readonly authError = computed(() => this._authState().error);

  // Observable per backward compatibility
  public readonly authState$ = this.authStateSubject.asObservable();
  public readonly isAuthenticated$ = this.authState$.pipe(
    map((state) => state.isAuthenticated)
  );
  public readonly currentUser$ = this.authState$.pipe(
    map((state) => state.user)
  );

  constructor() {
    this.initializeAuthState();
  }

  /**
   * Inizializza lo stato di autenticazione dal localStorage
   */
  private initializeAuthState(): void {
    try {
      const token = this.getStoredToken();
      const refreshToken = this.getStoredRefreshToken();
      const userData = this.getStoredUser();

      if (token && userData) {
        if (this.isTokenValid(token)) {
          this.updateAuthState({
            isAuthenticated: true,
            user: userData,
            token,
            refreshToken,
            isLoading: false,
            error: null,
          });
          this.startTokenRefreshTimer();
        } else {
          // Token scaduto, prova il refresh se disponibile
          if (refreshToken) {
            this.refreshToken().subscribe();
          } else {
            this.clearAuthData();
          }
        }
      }
    } catch (error) {
      console.error("Errore durante l'inizializzazione dell'auth:", error);
      this.clearAuthData();
    }
  }

  /**
   * Effettua il login dell'utente
   */
  login(
    credentials: LoginRequest,
    rememberMe: boolean = false
  ): Observable<LoginResponse> {
    this.updateAuthState({
      ...this._authState(),
      isLoading: true,
      error: null,
    });

    return this.http
      .post<LoginResponse>(this.AUTH_ENDPOINTS.LOGIN, credentials)
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.handleLoginSuccess(response.data, rememberMe);
          }
        }),
        catchError((error) => this.handleAuthError(error)),
        finalize(() => {
          this.updateAuthState({ ...this._authState(), isLoading: false });
        })
      );
  }

  /**
   * Effettua il logout dell'utente
   */
  logout(navigateToLogin: boolean = true): Observable<any> {
    const token = this._authState().token;
    const refreshToken = this._authState().refreshToken;

    // Logout locale immediato
    this.clearAuthData();

    // Notifica il server (optional, continua anche se fallisce)
    if (token) {
      const logoutRequest: LogoutRequest = {
        token,
        refreshToken: refreshToken || undefined,
      };

      return this.http.post(this.AUTH_ENDPOINTS.LOGOUT, logoutRequest).pipe(
        catchError(() => of(null)), // Ignora errori del server
        finalize(() => {
          if (navigateToLogin) {
            this.router.navigate(['/login']);
          }
        })
      );
    }

    if (navigateToLogin) {
      this.router.navigate(['/login']);
    }

    return of(null);
  }

  /**
   * Refresh del token di autenticazione
   */
  refreshToken(): Observable<LoginResponse> {
    const refreshToken = this._authState().refreshToken;

    if (!refreshToken) {
      return throwError(() => new Error('Refresh token non disponibile'));
    }

    const refreshRequest: RefreshTokenRequest = { refreshToken };

    return this.http
      .post<LoginResponse>(this.AUTH_ENDPOINTS.REFRESH, refreshRequest)
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.handleLoginSuccess(response.data);
          }
        }),
        catchError((error) => {
          this.clearAuthData();
          return throwError(() => error);
        })
      );
  }

  /**
   * Ottiene il profilo utente aggiornato
   */
  getUserProfile(): Observable<User> {
    return this.http.get<{ user: User }>(this.AUTH_ENDPOINTS.PROFILE).pipe(
      map((response) => response.user),
      tap((user) => {
        this.updateAuthState({
          ...this._authState(),
          user,
        });
      })
    );
  }

  /**
   * Reset password
   */
  resetPassword(email: string): Observable<PasswordResetResponse> {
    const request: PasswordResetRequest = { email };
    return this.http.post<PasswordResetResponse>(
      this.AUTH_ENDPOINTS.RESET_PASSWORD,
      request
    );
  }

  /**
   * Cambio password
   */
  changePassword(passwordData: ChangePasswordRequest): Observable<any> {
    return this.http.post(this.AUTH_ENDPOINTS.CHANGE_PASSWORD, passwordData);
  }

  /**
   * Verifica se l'utente è autenticato
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

  /**
   * Ottiene il token corrente
   */
  getToken(): string | null {
    return this._authState().token;
  }

  /**
   * Ottiene l'utente corrente
   */
  getUser(): User | null {
    return this._authState().user;
  }

  // Metodi privati

  private handleLoginSuccess(
    data: LoginResponse['data'],
    rememberMe?: boolean
  ): void {
    if (!data) return;

    const { user, token, refreshToken, expiresIn } = data;

    // Salva i dati
    this.storeAuthData(token, refreshToken || null, user, rememberMe);

    // Aggiorna lo stato
    this.updateAuthState({
      isAuthenticated: true,
      user,
      token,
      refreshToken: refreshToken || null,
      isLoading: false,
      error: null,
    });

    // Avvia il timer per il refresh automatico
    this.startTokenRefreshTimer(expiresIn);
  }

  private handleAuthError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = "Errore durante l'autenticazione";

    if (error.status === 401) {
      errorMessage = 'Credenziali non valide';
    } else if (error.status === 403) {
      errorMessage = 'Accesso negato';
    } else if (error.status === 0) {
      errorMessage = 'Errore di connessione al server';
    } else if (error.error?.message) {
      errorMessage = error.error.message;
    }

    this.updateAuthState({
      ...this._authState(),
      error: errorMessage,
      isLoading: false,
    });

    return throwError(() => new Error(errorMessage));
  }

  private updateAuthState(newState: AuthState): void {
    this._authState.set(newState);
    this.authStateSubject.next(newState);
  }

  private storeAuthData(
    token: string,
    refreshToken: string | null,
    user: User,
    rememberMe?: boolean
  ): void {
    const storage = rememberMe ? localStorage : sessionStorage;

    storage.setItem(AUTH_STORAGE_KEYS.TOKEN, token);
    storage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(user));

    if (refreshToken) {
      storage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    }

    if (rememberMe) {
      localStorage.setItem(AUTH_STORAGE_KEYS.REMEMBER_ME, 'true');
    }
  }

  private clearAuthData(): void {
    // Cancella da entrambi i storage
    [localStorage, sessionStorage].forEach((storage) => {
      Object.values(AUTH_STORAGE_KEYS).forEach((key) => {
        storage.removeItem(key);
      });
    });

    // Ferma il timer di refresh
    if (this.refreshTokenTimer) {
      clearTimeout(this.refreshTokenTimer);
      this.refreshTokenTimer = undefined;
    }

    // Reset dello stato
    this.updateAuthState({
      isAuthenticated: false,
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,
      error: null,
    });
  }

  private getStoredToken(): string | null {
    return (
      localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN) ||
      sessionStorage.getItem(AUTH_STORAGE_KEYS.TOKEN)
    );
  }

  private getStoredRefreshToken(): string | null {
    return (
      localStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN) ||
      sessionStorage.getItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN)
    );
  }

  private getStoredUser(): User | null {
    const userData =
      localStorage.getItem(AUTH_STORAGE_KEYS.USER) ||
      sessionStorage.getItem(AUTH_STORAGE_KEYS.USER);

    return userData ? JSON.parse(userData) : null;
  }

  private isTokenValid(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp * 1000; // Converti in millisecondi
      return Date.now() < exp;
    } catch {
      return false;
    }
  }

  private startTokenRefreshTimer(expiresIn?: number): void {
    if (!AUTH_CONFIG.AUTO_REFRESH_ENABLED) return;

    // Cancella timer esistente
    if (this.refreshTokenTimer) {
      clearTimeout(this.refreshTokenTimer);
    }

    // Calcola quando fare il refresh (5 minuti prima della scadenza)
    const refreshTime = expiresIn
      ? (expiresIn - AUTH_CONFIG.TOKEN_EXPIRE_BUFFER) * 1000
      : 25 * 60 * 1000; // Default 25 minuti

    this.refreshTokenTimer = setTimeout(() => {
      if (this.isAuthenticated() && this._authState().refreshToken) {
        this.refreshToken().subscribe({
          error: () => this.logout(),
        });
      }
    }, refreshTime);
  }
}

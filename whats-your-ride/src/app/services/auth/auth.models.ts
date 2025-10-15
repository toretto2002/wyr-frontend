// Interfacce e modelli per l'autenticazione

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  data?: {
    user: User;
    token: string;
    refreshToken?: string;
    expiresIn: number; // in secondi
  };
  error?: string;
}

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatar?: string;
  roles?: string[];
  preferences?: UserPreferences;
  createdAt?: Date;
  lastLoginAt?: Date;
}

export interface UserPreferences {
  theme?: 'light' | 'dark';
  language?: string;
  notifications?: boolean;
  bikePreferences?: BikePreferences;
}

export interface BikePreferences {
  favoriteModels?: string[];
  preferredBrands?: string[];
  ridingStyle?: 'sport' | 'touring' | 'commuting' | 'racing';
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  token?: string;
  refreshToken?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetResponse {
  success: boolean;
  message: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// Enum per i ruoli utente
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  PREMIUM = 'premium'
}

// Enum per gli stati di autenticazione
export enum AuthStatus {
  UNKNOWN = 'unknown',
  AUTHENTICATED = 'authenticated',
  UNAUTHENTICATED = 'unauthenticated',
  LOADING = 'loading',
  ERROR = 'error'
}

// Costanti per il localStorage
export const AUTH_STORAGE_KEYS = {
  TOKEN: 'wyr_auth_token',
  REFRESH_TOKEN: 'wyr_refresh_token',
  USER: 'wyr_user_data',
  REMEMBER_ME: 'wyr_remember_me'
} as const;

// Configurazione di default per l'autenticazione
export const AUTH_CONFIG = {
  TOKEN_EXPIRE_BUFFER: 5 * 60, // 5 minuti prima della scadenza
  AUTO_REFRESH_ENABLED: true,
  SESSION_TIMEOUT: 30 * 60, // 30 minuti di inattività
  REMEMBER_ME_DURATION: 30 * 24 * 60 * 60 // 30 giorni
} as const;

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { LoginRequest, LoginResponse, User, AUTH_STORAGE_KEYS } from './auth.models';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockUser: User = {
    id: '1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    displayName: 'Test User'
  };

  const mockLoginResponse: LoginResponse = {
    success: true,
    data: {
      user: mockUser,
      token: 'mock-jwt-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600
    }
  };

  beforeEach(() => {
    const spy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: Router, useValue: spy }
      ]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    // Pulisci localStorage prima di ogni test
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with unauthenticated state', () => {
      expect(service.isAuthenticated()).toBeFalsy();
      expect(service.currentUser()).toBeNull();
      expect(service.getToken()).toBeNull();
    });
  });

  describe('Login', () => {
    it('should login successfully', () => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(credentials).subscribe(response => {
        expect(response).toEqual(mockLoginResponse);
        expect(service.isAuthenticated()).toBeTruthy();
        expect(service.currentUser()).toEqual(mockUser);
        expect(service.getToken()).toBe('mock-jwt-token');
      });

      const req = httpMock.expectOne('http://localhost:3000/api/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(credentials);
      req.flush(mockLoginResponse);
    });

    it('should handle login error', () => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      service.login(credentials).subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.message).toContain('Credenziali non valide');
          expect(service.isAuthenticated()).toBeFalsy();
        }
      });

      const req = httpMock.expectOne('http://localhost:3000/api/auth/login');
      req.flush({ message: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });
    });

    it('should store auth data with remember me', () => {
      const credentials: LoginRequest = {
        email: 'test@example.com',
        password: 'password123'
      };

      service.login(credentials, true).subscribe();

      const req = httpMock.expectOne('http://localhost:3000/api/auth/login');
      req.flush(mockLoginResponse);

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN)).toBe('mock-jwt-token');
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.REMEMBER_ME)).toBe('true');
    });
  });

  describe('Logout', () => {
    beforeEach(() => {
      // Setup authenticated state
      localStorage.setItem(AUTH_STORAGE_KEYS.TOKEN, 'mock-token');
      localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(mockUser));
    });

    it('should logout successfully', () => {
      service.logout().subscribe();

      const req = httpMock.expectOne('http://localhost:3000/api/auth/logout');
      expect(req.request.method).toBe('POST');
      req.flush({});

      expect(service.isAuthenticated()).toBeFalsy();
      expect(service.currentUser()).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN)).toBeNull();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should clear auth data even if server request fails', () => {
      service.logout().subscribe();

      const req = httpMock.expectOne('http://localhost:3000/api/auth/logout');
      req.error(new ErrorEvent('Network error'));

      expect(service.isAuthenticated()).toBeFalsy();
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.TOKEN)).toBeNull();
    });
  });

  describe('Token Management', () => {
    it('should refresh token successfully', () => {
      // Setup with refresh token
      const refreshResponse: LoginResponse = {
        success: true,
        data: {
          user: mockUser,
          token: 'new-jwt-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600
        }
      };

      // Simula stato autenticato con refresh token
      service['updateAuthState']({
        isAuthenticated: true,
        user: mockUser,
        token: 'old-token',
        refreshToken: 'old-refresh-token',
        isLoading: false,
        error: null
      });

      service.refreshToken().subscribe(response => {
        expect(response).toEqual(refreshResponse);
        expect(service.getToken()).toBe('new-jwt-token');
      });

      const req = httpMock.expectOne('http://localhost:3000/api/auth/refresh');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ refreshToken: 'old-refresh-token' });
      req.flush(refreshResponse);
    });

    it('should handle refresh token error', () => {
      service['updateAuthState']({
        isAuthenticated: true,
        user: mockUser,
        token: 'old-token',
        refreshToken: 'invalid-refresh-token',
        isLoading: false,
        error: null
      });

      service.refreshToken().subscribe({
        next: () => fail('should have failed'),
        error: () => {
          expect(service.isAuthenticated()).toBeFalsy();
        }
      });

      const req = httpMock.expectOne('http://localhost:3000/api/auth/refresh');
      req.flush({ message: 'Invalid refresh token' }, { status: 401, statusText: 'Unauthorized' });
    });
  });

  describe('User Profile', () => {
    it('should get user profile', () => {
      const updatedUser = { ...mockUser, firstName: 'Updated' };

      service.getUserProfile().subscribe(user => {
        expect(user).toEqual(updatedUser);
        expect(service.currentUser()).toEqual(updatedUser);
      });

      const req = httpMock.expectOne('http://localhost:3000/api/auth/profile');
      expect(req.request.method).toBe('GET');
      req.flush({ user: updatedUser });
    });
  });

  describe('Password Management', () => {
    it('should reset password', () => {
      const email = 'test@example.com';
      const response = { success: true, message: 'Reset email sent' };

      service.resetPassword(email).subscribe(result => {
        expect(result).toEqual(response);
      });

      const req = httpMock.expectOne('http://localhost:3000/api/auth/reset-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email });
      req.flush(response);
    });

    it('should change password', () => {
      const passwordData = {
        currentPassword: 'oldpass',
        newPassword: 'newpass',
        confirmPassword: 'newpass'
      };

      service.changePassword(passwordData).subscribe();

      const req = httpMock.expectOne('http://localhost:3000/api/auth/change-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(passwordData);
      req.flush({});
    });
  });

  describe('Utility Methods', () => {
    it('should check if user is logged in', () => {
      expect(service.isLoggedIn()).toBeFalsy();

      service['updateAuthState']({
        isAuthenticated: true,
        user: mockUser,
        token: 'token',
        refreshToken: null,
        isLoading: false,
        error: null
      });

      expect(service.isLoggedIn()).toBeTruthy();
    });

    it('should return current token', () => {
      expect(service.getToken()).toBeNull();

      service['updateAuthState']({
        isAuthenticated: true,
        user: mockUser,
        token: 'test-token',
        refreshToken: null,
        isLoading: false,
        error: null
      });

      expect(service.getToken()).toBe('test-token');
    });

    it('should return current user', () => {
      expect(service.getUser()).toBeNull();

      service['updateAuthState']({
        isAuthenticated: true,
        user: mockUser,
        token: 'token',
        refreshToken: null,
        isLoading: false,
        error: null
      });

      expect(service.getUser()).toEqual(mockUser);
    });
  });
});
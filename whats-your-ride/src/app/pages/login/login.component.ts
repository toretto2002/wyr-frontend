import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';
import { LoginRequest } from '../../services/auth/auth.models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  // Espongo AuthService come pubblico per il template
  readonly authService = inject(AuthService);

  loginForm!: FormGroup;

  // Signals per gestire lo stato del componente
  isSubmitting = signal(false);
  rememberMe = signal(false);
  loginError = signal<string | null>(null);
  showPassword = signal(false);

  // Computed per facilitare l'accesso nel template
  get isLoading() { return this.isSubmitting() || this.authService.isLoading(); }
  get authError() { return this.authService.authError(); }

  ngOnInit(): void {
    this.initializeForm();
    this.checkIfAlreadyAuthenticated();
  }

  private initializeForm(): void {
    this.loginForm = this.formBuilder.group({
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.minLength(5)
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(6),
        Validators.maxLength(50)
      ]]
    });
  }

  private checkIfAlreadyAuthenticated(): void {
    if (this.authService.isAuthenticated()) {
      this.redirectAfterLogin();
    }
  }

  // Getter per accedere facilmente ai form controls nel template
  get email() { return this.loginForm.get('email'); }
  get password() { return this.loginForm.get('password'); }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.performLogin();
    } else {
      this.markAllFieldsAsTouched();
    }
  }

  private performLogin(): void {
    this.isSubmitting.set(true);
    this.loginError.set(null);

    const credentials: LoginRequest = {
      username: this.loginForm.value.email.trim(),
      password: this.loginForm.value.password
    };

    this.authService.login(credentials, this.rememberMe()).subscribe({
      next: (response) => {
        if (response.success) {
          console.log('Login effettuato con successo:', response.data?.user);
          this.redirectAfterLogin();
        } else {
          this.handleLoginError(response.error || 'Errore durante il login');
        }
      },
      error: (error) => {
        console.error('Errore di login:', error);
        this.handleLoginError(error.message || 'Errore durante il login');
      },
      complete: () => {
        this.isSubmitting.set(false);
      }
    });
  }

  private handleLoginError(errorMessage: string): void {
    this.loginError.set(errorMessage);
    this.isSubmitting.set(false);

    // Rimuovi l'errore dopo 5 secondi
    setTimeout(() => {
      this.loginError.set(null);
    }, 5000);
  }

  private redirectAfterLogin(): void {
    // Reindirizza alla dashboard o alla pagina precedente
    const returnUrl = sessionStorage.getItem('returnUrl') || '/dashboard';
    sessionStorage.removeItem('returnUrl');
    this.router.navigate([returnUrl]);
  }

  private markAllFieldsAsTouched(): void {
    Object.keys(this.loginForm.controls).forEach(key => {
      this.loginForm.get(key)?.markAsTouched();
    });
  }

  // Metodi per il template

  toggleRememberMe(): void {
    this.rememberMe.set(!this.rememberMe());
  }

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  // Metodo per ottenere messaggi di errore specifici
  getErrorMessage(fieldName: string): string {
    const control = this.loginForm.get(fieldName);

    if (control?.errors && control.touched) {
      if (control.errors['required']) {
        return `${fieldName === 'email' ? 'Email' : 'Password'} è obbligatorio`;
      }
      if (control.errors['email']) {
        return 'Inserisci un indirizzo email valido';
      }
      if (control.errors['minlength']) {
        const minLength = control.errors['minlength'].requiredLength;
        return `${fieldName === 'email' ? 'Email' : 'Password'} deve contenere almeno ${minLength} caratteri`;
      }
      if (control.errors['maxlength']) {
        const maxLength = control.errors['maxlength'].requiredLength;
        return `Password non può superare ${maxLength} caratteri`;
      }
    }
    return '';
  }

  // Metodo per verificare se un campo ha errori
  hasError(fieldName: string): boolean {
    const control = this.loginForm.get(fieldName);
    return !!(control?.errors && control.touched);
  }

  // Metodi per azioni secondarie

  onForgotPassword(): void {
    // Naviga alla pagina di reset password
    this.router.navigate(['/auth/forgot-password']);
  }

  onSignUp(): void {
    // Naviga alla pagina di registrazione
    this.router.navigate(['/auth/register']);
  }

  // Metodo per login demo/guest
  onGuestLogin(): void {
    const guestCredentials: LoginRequest = {
      username: 'guest@whatyourride.com',
      password: 'guest123'
    };

    this.authService.login(guestCredentials, false).subscribe({
      next: () => this.redirectAfterLogin(),
      error: (error) => console.error('Errore login guest:', error)
    });
  }
}

import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { authGuard, guestOnlyGuard } from './services/auth/guard.guard';
import { ChatComponent } from './pages/chat/chat.component';

export const routes: Routes = [
  // Rotta di default
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'chat'
  },
  // Rotte per utenti NON autenticati
  {
    path: 'login',
    component: LoginComponent,
    // canActivate: [guestOnlyGuard] // Evita che utenti già loggati accedano al login
  },

  // Rotte protette
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard] // Solo utenti autenticati
  },
  {
    path: 'chat',
    component: ChatComponent,
    canActivate: [authGuard] // Solo utenti autenticati
  },

  // Fallback per rotte non trovate
  {
    path: '**',
    redirectTo: '/chat'
  }
];

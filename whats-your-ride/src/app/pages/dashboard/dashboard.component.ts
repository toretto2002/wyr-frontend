import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Espone il servizio per il template
  readonly auth = this.authService;

  ngOnInit(): void {
    console.log('Dashboard caricata per utente:', this.authService.currentUser());
  }

  onLogout(): void {
    this.authService.logout().subscribe({
      next: () => {
        console.log('Logout completato');
        // Il servizio reindirizza automaticamente al login
      },
      error: (error) => {
        console.error('Errore durante logout:', error);
        // Fallback: reindirizza comunque al login
        this.router.navigate(['/login']);
      }
    });
  }

  navigateToProfile(): void {
    this.router.navigate(['/profile']);
  }

  navigateToGarage(): void {
    this.router.navigate(['/garage']);
  }
}
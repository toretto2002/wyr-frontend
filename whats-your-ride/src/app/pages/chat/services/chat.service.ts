import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { ResponseData } from '../models/chat';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly API_BASE_URL = 'http://localhost:5000';

  constructor() { }

  sendMessage(message: string): Observable<ResponseData> {
    return this.http.post<ResponseData>(
      `${this.API_BASE_URL}/moto-it-bot`,
      { message }
    ).pipe(
      catchError(error => {
        console.error('Error occurred while sending message:', error);
        return throwError(() => error);
      })
    );
  }
}

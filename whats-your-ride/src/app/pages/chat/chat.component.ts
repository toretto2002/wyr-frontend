import {
  Component,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth/auth.service';
import { ChatService } from './services/chat.service';
import { ResponseData, FormattedResponse } from './models/chat';

export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isTyping?: boolean;
  sqlQuery?: string;
  sqlResults?: string[];
  formattedResponse?: FormattedResponse;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  private readonly authService = inject(AuthService);
  private readonly chatService = inject(ChatService);

  // Segnali per la gestione dello stato
  public readonly messages = signal<ChatMessage[]>([
    {
      id: '1',
      content:
        '🏁 Benvenuto nel Racing Chat! Sono il tuo assistente virtuale per tutto ciò che riguarda il mondo delle due ruote. Come posso aiutarti oggi?',
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);

  public readonly currentMessage = signal<string>('');
  public readonly isLoading = signal<boolean>(false);
  public readonly isTyping = signal<boolean>(false);

  // Computed per user info
  public readonly currentUser = computed(() => this.authService.currentUser());
  public readonly userDisplayName = computed(
    () =>
      this.currentUser()?.displayName ||
      this.currentUser()?.firstName ||
      this.currentUser()?.email?.split('@')[0] ||
      'Pilota'
  );

  private shouldScrollToBottom = true;

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
    }
  }

  onSendMessage(): void {
    const message = this.currentMessage().trim();
    if (!message || this.isLoading()) return;

    // Aggiungi messaggio dell'utente
    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      content: message,
      sender: 'user',
      timestamp: new Date(),
    };

    this.messages.update((messages) => [...messages, userMessage]);
    this.currentMessage.set('');
    this.isLoading.set(true);

    // Simula typing del bot
    this.simulateBotTyping();

    // Chiamata al backend reale
    this.chatService.sendMessage(message).subscribe({
      next: (response) => {
        this.sendBotResponse(response);
      },
      error: (error) => {
        console.error('Chat error:', error);
        this.sendErrorResponse();
      }
    });
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSendMessage();
    }
  }

  onMessageInputChange(value: string): void {
    this.currentMessage.set(value);
  }

  private generateMessageId(): string {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  }

  private simulateBotTyping(): void {
    this.isTyping.set(true);

    const typingMessage: ChatMessage = {
      id: 'typing',
      content: '',
      sender: 'bot',
      timestamp: new Date(),
      isTyping: true,
    };

    this.messages.update((messages) => [...messages, typingMessage]);
    this.shouldScrollToBottom = true;
  }

  private sendBotResponse(response: ResponseData): void {
    // Rimuovi il messaggio di typing
    this.messages.update((messages) =>
      messages.filter((m) => m.id !== 'typing')
    );

    const formattedResponse = this.parseStructuredResponse(response.answer);

    const botMessage: ChatMessage = {
      id: this.generateMessageId(),
      content: response.answer,
      sender: 'bot',
      timestamp: new Date(),
      sqlQuery: response.sql_query,
      sqlResults: response.rows,
      formattedResponse: formattedResponse
    };

    this.messages.update((messages) => [...messages, botMessage]);
    this.isLoading.set(false);
    this.isTyping.set(false);
    this.shouldScrollToBottom = true;
  }

  private parseStructuredResponse(content: string): FormattedResponse {
    const result: FormattedResponse = {};

    // Estrai risposta breve (sezione 1)
    const shortAnswerMatch = content.match(/1\)\s*Risposta breve:\s*(.*?)(?=\n\n|\n2\)|$)/s);
    if (shortAnswerMatch) {
      result.shortAnswer = shortAnswerMatch[1].trim();
    }

    // Estrai tabella dai dettagli (sezione 2)
    const tableMatch = content.match(/\|.*\|[\s\S]*?\|.*\|/g);
    if (tableMatch && tableMatch.length > 0) {
      result.details = this.parseMotorcycleTable(tableMatch[0]);
    }

    // Estrai suggerimenti (sezione 3)
    const suggestionsMatch = content.match(/3\)\s*Suggerimenti[^:]*:\s*([\s\S]*?)(?=$)/);
    if (suggestionsMatch) {
      const suggestions = suggestionsMatch[1]
        .split(/[-•]\s*/)
        .filter(s => s.trim())
        .map(s => s.trim());
      result.suggestions = suggestions;
    }

    // Mantieni il contenuto originale come fallback
    result.rawContent = content;

    return result;
  }

  private parseMotorcycleTable(tableString: string): any {
    const lines = tableString.trim().split('\n');
    if (lines.length < 3) return null;

    // Parse header
    const headerLine = lines[0];
    const columns = headerLine.split('|')
      .map(col => col.trim())
      .filter(col => col !== '');

    // Skip separator line (lines[1])

    // Parse data rows
    const rows = lines.slice(2).map(line => {
      const cells = line.split('|')
        .map(cell => cell.trim())
        .filter(cell => cell !== '');

      if (cells.length === columns.length) {
        // Clean numeric values
        const powerValue = cells[3] ? parseFloat(cells[3].replace(/[^\d.]/g, '')) : 0;
        const weightValue = cells[4] && cells[4] !== '-' ? parseFloat(cells[4].replace(/[^\d.]/g, '')) : undefined;
        const priceValue = cells[5] ? parseFloat(cells[5].replace(/[^\d.]/g, '')) : 0;

        return {
          brand: cells[0] || '',
          model: cells[1] || '',
          version: cells[2] || '',
          power: powerValue,
          weight: weightValue,
          price: priceValue,
          notes: cells[6] || ''
        };
      }
      return null;
    }).filter(row => row !== null);

    return {
      title: "Moto consigliate per principianti",
      columns,
      rows
    };
  }

  private sendErrorResponse(): void {
    // Rimuovi il messaggio di typing
    this.messages.update((messages) =>
      messages.filter((m) => m.id !== 'typing')
    );

    const errorMessage: ChatMessage = {
      id: this.generateMessageId(),
      content: '🚫 Ops! Sembra che ci sia un problema con la connessione al database. Riprova tra un momento.',
      sender: 'bot',
      timestamp: new Date(),
    };

    this.messages.update((messages) => [...messages, errorMessage]);
    this.isLoading.set(false);
    this.isTyping.set(false);
    this.shouldScrollToBottom = true;
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        const element = this.messagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  public clearChat(): void {
    this.messages.set([
      {
        id: '1',
        content: '🏁 Chat pulita! Come posso aiutarti ora?',
        sender: 'bot',
        timestamp: new Date(),
      },
    ]);
  }

  public retryLastMessage(): void {
    const lastUserMessage = this.messages()
      .filter((m) => m.sender === 'user')
      .pop();

    if (lastUserMessage) {
      this.currentMessage.set(lastUserMessage.content);
      this.messageInput.nativeElement.focus();
    }
  }

  public testFormattedResponse(): void {
    const testResponse = `1) Risposta breve:
Per un principiante, le moto con potenza fino a 50 hp sono una scelta ideale, poiché offrono un buon equilibrio tra facilità di guida e prestazioni. Tra le opzioni disponibili, potresti considerare modelli come la Kawasaki W 800, la Royal Enfield Interceptor 650 e la Honda CMX 500 Rebel.

2) Dettagli:
Ecco una selezione di moto adatte ai principianti, ordinate per potenza e altre caratteristiche rilevanti:

| Marca           | Modello            | Versione                              | Potenza (hp) | Peso a secco (kg) | Prezzo (€) | Note sul perché è inclusa |
|-----------------|--------------------|---------------------------------------|--------------|-------------------|------------|---------------------------|
| Kawasaki        | W 800              | W 800 (2021 - 25)                     | 48.0         | -                 | 10690      | Potenza moderata e stile classico, ideale per principianti. |
| Royal Enfield   | Interceptor 650    | Interceptor 650 (2021 - 25)           | 47.0         | 202.0             | 6700       | Popolare per la sua maneggevolezza e prezzo accessibile. |
| Honda           | CMX 500            | CMX 500 Rebel + Special Edition (2025)| 46.0         | -                 | 6840       | Cruiser facile da guidare, adatta a chi cerca comfort e stile. |

3) Suggerimenti per affinare la ricerca:
Se desideri ulteriori opzioni o specifiche categorie, potresti considerare di:
- Filtrare per categorie specifiche come "Naked" o "Adventure" per trovare moto che si adattano meglio al tuo stile di guida.
- Considerare il peso della moto se la manovrabilità è una priorità.
- Valutare l'inclusione di moto elettriche se sei interessato a tecnologie più moderne e sostenibili.`;

    const formattedResponse = this.parseStructuredResponse(testResponse);

    const testMessage: ChatMessage = {
      id: this.generateMessageId(),
      content: testResponse,
      sender: 'bot',
      timestamp: new Date(),
      formattedResponse: formattedResponse
    };

    this.messages.update((messages) => [...messages, testMessage]);
    this.shouldScrollToBottom = true;
  }
}

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
import { ResponseData, FormattedResponse, MotorcycleTableData, MotorcycleRow } from './models/chat';

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
    console.log('🔍 === PARSING STRUCTURED RESPONSE START ===');
    console.log('📝 Content length:', content.length);
    console.log('📝 Content preview:', content.substring(0, 200) + '...');

    const result: FormattedResponse = {};

    // 1️⃣ PARSING RISPOSTA BREVE
    console.log('🔎 Searching for short answer...');
    const shortAnswerPattern = /1\)\s*\*\*Risposta\s+breve\*\*\s*(.*?)(?=\s*2\)|$)/s;
    const shortAnswerMatch = content.match(shortAnswerPattern);

    if (shortAnswerMatch) {
      result.shortAnswer = shortAnswerMatch[1].trim();
      console.log('✅ Short answer found:', result.shortAnswer.substring(0, 100) + '...');
    } else {
      console.log('❌ Short answer NOT found');
      console.log('🔍 Testing alternative patterns...');

      // Pattern alternativi
      const altPatterns = [
        /1\)\s*\*\*Risposta breve\*\*\s*(.*?)(?=\s*2\)|$)/s,
        /\*\*Risposta\s+breve\*\*\s*(.*?)(?=\s*\*\*|$)/s,
        /1\)\s*(.*?)(?=\s*2\)|$)/s
      ];

      for (let i = 0; i < altPatterns.length; i++) {
        const altMatch = content.match(altPatterns[i]);
        if (altMatch) {
          result.shortAnswer = altMatch[1].trim();
          console.log(`✅ Short answer found with pattern ${i + 1}:`, result.shortAnswer.substring(0, 50) + '...');
          break;
        }
      }
    }

    // 2️⃣ PARSING TABELLA
    console.log('🔎 Searching for table...');

    // Pattern più robusto per trovare tabelle
    const tablePatterns = [
      // Pattern principale: cerca da | fino alla fine della tabella
      /\|\s*Marca\s*\|.*?\|\s*[^|]+\s*\|/gs,
      // Pattern alternativo: qualsiasi tabella con pipe
      /\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|/g,
      // Pattern semplice
      /\|.*\|[\s\S]*?\|.*\|/
    ];

    let tableFound = false;
    for (let i = 0; i < tablePatterns.length; i++) {
      console.log(`🔍 Testing table pattern ${i + 1}...`);
      const tableMatch = content.match(tablePatterns[i]);

      if (tableMatch && tableMatch.length > 0) {
        console.log(`✅ Table found with pattern ${i + 1}:`, tableMatch.length, 'matches');
        console.log('📊 First table match preview:', tableMatch[0].substring(0, 200) + '...');

        // Usa tutti i match per costruire la tabella completa
        const fullTable = tableMatch.join('\n');
        const tableResult = this.parseMotorcycleTable(fullTable);
        if (tableResult) {
          result.details = tableResult;
        }

        if (result.details && result.details.rows && result.details.rows.length > 0) {
          console.log('✅ Table successfully parsed with', result.details.rows.length, 'rows');
          tableFound = true;
          break;
        } else {
          console.log('❌ Table parsing failed for pattern', i + 1);
        }
      }
    }

    if (!tableFound) {
      console.log('❌ No valid table found with any pattern');
    }

    // 3️⃣ PARSING SUGGERIMENTI
    console.log('🔎 Searching for suggestions...');
    const suggestionsPatterns = [
      /3\)\s*\*\*Suggerimenti\s+per\s+affinare\s+la\s+ricerca\*\*\s*(.*?)(?=$)/s,
      /\*\*Suggerimenti[^*]*\*\*\s*(.*?)(?=$)/s,
      /3\)\s*(.*?)(?=$)/s
    ];

    for (let i = 0; i < suggestionsPatterns.length; i++) {
      const suggestionsMatch = content.match(suggestionsPatterns[i]);
      if (suggestionsMatch) {
        const rawSuggestions = suggestionsMatch[1];
        console.log('✅ Raw suggestions found:', rawSuggestions.substring(0, 100) + '...');

        const suggestions = rawSuggestions
          .split(/\s*-\s*/)
          .filter(s => s.trim() && s.length > 10) // Filtra suggerimenti troppo corti
          .map(s => s.trim().replace(/\.$/, '')); // Rimuovi punto finale

        if (suggestions.length > 0) {
          result.suggestions = suggestions;
          console.log('✅ Suggestions parsed:', suggestions.length, 'items');
          suggestions.forEach((sugg, idx) => console.log(`   ${idx + 1}. ${sugg.substring(0, 50)}...`));
          break;
        }
      }
    }

    if (!result.suggestions) {
      console.log('❌ Suggestions NOT found');
    }

    // Mantieni il contenuto originale come fallback
    result.rawContent = content;

    console.log('📊 === PARSING SUMMARY ===');
    console.log('✅ Short answer:', !!result.shortAnswer);
    console.log('✅ Details table:', !!result.details && result.details.rows && result.details.rows.length > 0 ? `${result.details.rows.length} motorcycles` : 'none');
    console.log('✅ Suggestions:', result.suggestions ? `${result.suggestions.length} items` : 'none');
    console.log('🔍 === PARSING STRUCTURED RESPONSE END ===');

    return result;
  }

  private parseMotorcycleTable(tableString: string): MotorcycleTableData | null {
    console.log('🏍️ === MOTORCYCLE TABLE PARSING START ===');
    console.log('📊 Table string length:', tableString.length);
    console.log('📊 Table preview:', tableString.substring(0, 300) + '...');

    // Verifica se la stringa contiene effettivamente una tabella
    if (!tableString.includes('|') || !tableString.includes('Marca')) {
      console.log('❌ Invalid table format - missing pipes or "Marca" column');
      return null;
    }

    let lines: string[];
    let parsingMethod = '';

    // Determina il metodo di parsing basato sul formato
    if (tableString.includes('\n')) {
      // Formato normale con newlines
      lines = tableString.trim().split('\n').filter(line => line.trim());
      parsingMethod = 'newline-separated';
      console.log('📝 Using newline-separated parsing');
    } else {
      // Formato compatto su una riga - dividiamo usando pattern delle righe
      console.log('📝 Attempting single-line parsing...');

      // Primo tentativo: split su pattern di inizio riga
      const rowPattern = /(?=\|\s*[A-Za-z][^|]*\s*\|)/;
      const potentialLines = tableString.split(rowPattern);

      lines = potentialLines
        .filter(line => line.trim().length > 0 && line.includes('|'))
        .map(line => line.trim());

      parsingMethod = 'single-line-split';
      console.log('📝 Single-line split result:', lines.length, 'lines');
    }

    console.log('📊 Found', lines.length, 'lines using', parsingMethod);
    lines.forEach((line, idx) => {
      console.log(`   Line ${idx}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
    });

    if (lines.length < 2) {
      console.log('❌ Not enough lines, trying advanced single-line parsing...');
      return this.parseAdvancedSingleLine(tableString);
    }

    // Identifica la riga di header
    let headerLineIndex = -1;
    let separatorLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.toLowerCase().includes('marca') && line.includes('|')) {
        headerLineIndex = i;
        console.log('✅ Header found at line', i);
        break;
      }
    }

    if (headerLineIndex === -1) {
      console.log('❌ Header line not found');
      return null;
    }

    // Cerca separatore dopo l'header
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      if (lines[i].includes('---') || lines[i].includes('====')) {
        separatorLineIndex = i;
        console.log('✅ Separator found at line', i);
        break;
      }
    }

    // Parse header
    const headerLine = lines[headerLineIndex];
    const columns = headerLine.split('|')
      .map(col => col.trim())
      .filter(col => col !== '');

    console.log('📋 Columns found:', columns.length);
    columns.forEach((col, idx) => console.log(`   ${idx + 1}. "${col}"`));

    // Determina l'indice di inizio dei dati
    const dataStartIndex = separatorLineIndex !== -1 ? separatorLineIndex + 1 : headerLineIndex + 1;
    console.log('📊 Data starts at line', dataStartIndex);

    // Parse data rows
    const dataLines = lines.slice(dataStartIndex);
    console.log('📊 Processing', dataLines.length, 'data lines');

    const rows: MotorcycleRow[] = [];
    let validRowCount = 0;
    let skippedRowCount = 0;

    dataLines.forEach((line, lineIndex) => {
      const actualLineNumber = dataStartIndex + lineIndex;
      console.log(`🔍 Processing line ${actualLineNumber}: ${line.substring(0, 150)}...`);

      if (!line.includes('|')) {
        console.log(`   ⚠️ Skipping line ${actualLineNumber}: no pipes`);
        skippedRowCount++;
        return;
      }

      const cells = line.split('|')
        .map(cell => cell.trim())
        .filter(cell => cell !== '');

      console.log(`   📋 Cells found: ${cells.length}`);
      cells.forEach((cell, cellIdx) => console.log(`      ${cellIdx}: "${cell}"`));

      if (cells.length >= 8) { // Almeno 8 colonne per essere valida
        const motorcycleRow = {
          brand: cells[0] || '',
          model: cells[1] || '',
          version: cells[2] || '',
          displacement: cells[3] || '',
          power: cells[4] || '',
          dryWeight: cells[5] && cells[5] !== '-' ? cells[5] : '',
          fullWeight: cells[6] && cells[6] !== '-' ? cells[6] : '',
          price: cells[7] || '',
          notes: cells[8] || ''
        };

        // Verifica che non sia una riga vuota o di separatore
        if (motorcycleRow.brand &&
            !motorcycleRow.brand.toLowerCase().includes('marca') &&
            !motorcycleRow.brand.includes('-')) {

          rows.push(motorcycleRow);
          validRowCount++;
          console.log(`   ✅ Valid motorcycle row ${validRowCount}: ${motorcycleRow.brand} ${motorcycleRow.model}`);
        } else {
          console.log(`   ⚠️ Skipping header/separator row: ${motorcycleRow.brand}`);
          skippedRowCount++;
        }
      } else {
        console.log(`   ❌ Invalid row: only ${cells.length} cells (need ≥8)`);
        skippedRowCount++;
      }
    });

    console.log('📊 === PARSING RESULTS ===');
    console.log('✅ Valid motorcycles:', validRowCount);
    console.log('⚠️ Skipped rows:', skippedRowCount);
    console.log('📋 Columns:', columns.length);

    if (validRowCount === 0) {
      console.log('❌ No valid motorcycles found, trying fallback parsing...');
      return this.parseAdvancedSingleLine(tableString);
    }

    const result = {
      title: "Moto consigliate per principianti",
      columns,
      rows
    };

    console.log('🏍️ === MOTORCYCLE TABLE PARSING END ===');
    return result;
  }

  private parseAdvancedSingleLine(tableString: string): MotorcycleTableData | null {
    console.log('🔧 === ADVANCED SINGLE-LINE PARSING START ===');

    // Pattern per catturare righe di dati della tabella
    // Cerca pattern che corrispondono a: | dato | dato | dato | ... |
    const motorcyclePattern = /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g;

    const matches = Array.from(tableString.matchAll(motorcyclePattern));
    console.log('🔍 Pattern matches found:', matches.length);

    if (matches.length === 0) {
      console.log('❌ No matches found with advanced pattern');
      return null;
    }

    const rows: MotorcycleRow[] = [];
    let headerFound = false;
    let columns: string[] = [];

    matches.forEach((match, index) => {
      const cells = match.slice(1).map(cell => cell.trim());
      console.log(`🔍 Match ${index + 1}:`, cells);

      // Identifica se è l'header
      if (!headerFound && cells[0] && cells[0].toLowerCase().includes('marca')) {
        columns = cells;
        headerFound = true;
        console.log('✅ Header identified:', columns);
        return;
      }

      // Salta separatori
      if (cells[0] && (cells[0].includes('-') || cells[0].includes('='))) {
        console.log('⚠️ Skipping separator row');
        return;
      }

      // Se abbiamo celle valide, crea una riga moto
      if (cells.length >= 8 && cells[0] && cells[1]) {
        const motorcycleRow = {
          brand: cells[0] || '',
          model: cells[1] || '',
          version: cells[2] || '',
          displacement: cells[3] || '',
          power: cells[4] || '',
          dryWeight: cells[5] && cells[5] !== '-' ? cells[5] : '',
          fullWeight: cells[6] && cells[6] !== '-' ? cells[6] : '',
          price: cells[7] || '',
          notes: cells[8] || ''
        };

        rows.push(motorcycleRow);
        console.log(`✅ Added motorcycle: ${motorcycleRow.brand} ${motorcycleRow.model}`);
      }
    });

    if (rows.length === 0) {
      console.log('❌ No valid motorcycle rows found');
      return null;
    }

    console.log('📊 Advanced parsing results:', rows.length, 'motorcycles');
    console.log('🔧 === ADVANCED SINGLE-LINE PARSING END ===');

    return {
      title: "Moto consigliate per principianti",
      columns: columns.length > 0 ? columns : ['Marca', 'Modello', 'Versione', 'Cilindrata (cc)', 'Potenza (hp)', 'Peso a secco (kg)', 'Peso a pieno carico (kg)', 'Prezzo (€)', 'Motivazione'],
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
    // Il messaggio reale che arriva dal backend
    const testResponse = `1) **Risposta breve** Per un principiante, le moto con una potenza fino a 50 hp e cilindrata fino a 500 cc sono ideali. Queste moto sono generalmente più facili da gestire e meno intimidatorie per chi è alle prime armi. Tra le opzioni disponibili, ci sono diversi modelli che potrebbero fare al caso tuo. 2) **Dettagli** | Marca | Modello | Versione | Cilindrata (cc) | Potenza (hp) | Peso a secco (kg) | Peso a pieno carico (kg) | Prezzo (€) | Motivazione per l'inclusione | |----------------|------------------------|--------------------------------------------|-----------------|--------------|-------------------|--------------------------|------------|----------------------------------------------------| | Benelli | TRK 502 | TRK 502X (2021 - 25) | 500.0 | 47.6 | - | 235.0 | 5.99 | Cilindrata e potenza adatte ai principianti | | Honda | CMX 500 | CMX 500 Rebel + Special Edition (2025) | 471.0 | 46.0 | - | 192.0 | 6.84 | Modello popolare per principianti | | Kawasaki | Eliminator 500 | Eliminator 500 (2024 - 25) | 451.0 | 45.4 | - | 176.0 | 6.49 | Peso e potenza gestibili per un neofita | | Royal Enfield | Himalayan 450 | Himalayan 450 (2024 - 25) | 451.65 | 40.0 | 181.0 | 196.0 | 5.9 | Ideale per chi cerca una moto versatile | | Yamaha | MT-03 | MT-03 (2022 - 25) | 321.0 | 42.0 | 160.0 | 168.0 | 6.499 | Leggera e facile da manovrare | | KTM | 390 Adventure | 390 Adventure (2022 - 24) | 373.2 | 43.5 | 158.0 | - | 7.69 | Buona per avventure e uso quotidiano | | Suzuki | GSX-S125 | GSX-S125 (2025) | 124.4 | 15.0 | - | 134.0 | 4.57 | Ottima per chi inizia con una cilindrata ridotta | | Honda | CB 125 R | CB 125 R (2024 - 25) | 124.9 | 15.0 | - | 130.0 | 5.09 | Perfetta per città e brevi spostamenti | | Fantic Motor | Caballero 125 | Caballero 125 Scrambler (2025) | 124.66 | 15.0 | 130.0 | - | 5.49 | Stile classico e facile da guidare | | Keeway Motor | RKS 125 | RKS 125 (2025) | 124.9 | 11.4 | 133.0 | - | 1.99 | Economica e ideale per chi inizia | 3) **Suggerimenti per affinare la ricerca** - Considera di aggiungere un filtro per il peso a pieno carico, cercando moto sotto i 200 kg per una maggiore facilità di manovra. - Se hai una preferenza per un tipo specifico di moto (ad esempio, scooter, naked, o adventure), specifica la categoria per ottenere risultati più mirati. - Valuta anche il budget disponibile, filtrando per un range di prezzo che ti è comodo, per esempio tra 3.000 € e 6.000 €.`;

    console.log('🧪 Testing real backend message parsing...');
    const formattedResponse = this.parseStructuredResponse(testResponse);
    console.log('📊 Parsed result:', formattedResponse);

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

  // Debug method - solo per testing della logica di parsing
  public debugParsing(): void {
    const testText = `1) **Risposta breve** Test. 2) **Dettagli** | Marca | Modello | Versione | Cilindrata (cc) | Potenza (hp) | Peso a secco (kg) | Peso a pieno carico (kg) | Prezzo (€) | Motivazione | | Benelli | TRK 502 | TRK 502X | 500.0 | 47.6 | - | 235.0 | 5.99 | Test |`;

    console.log('🔍 Debug parsing test...');
    const result = this.parseStructuredResponse(testText);
    console.log('Debug result:', result);
  }

  // Nuovo metodo per diagnostica completa
  public fullDiagnostics(): void {
    console.log('🩺 === FULL DIAGNOSTICS START ===');

    const realMessage = `1) **Risposta breve** Per un principiante, le moto con una potenza fino a 50 hp e cilindrata fino a 500 cc sono ideali. 2) **Dettagli** | Marca | Modello | Versione | Cilindrata (cc) | Potenza (hp) | Peso a secco (kg) | Peso a pieno carico (kg) | Prezzo (€) | Motivazione per l'inclusione | |----------------|------------------------|--------------------------------------------|-----------------|--------------|-------------------|--------------------------|------------|----------------------------------------------------| | Benelli | TRK 502 | TRK 502X (2021 - 25) | 500.0 | 47.6 | - | 235.0 | 5.99 | Cilindrata e potenza adatte ai principianti | | Honda | CMX 500 | CMX 500 Rebel + Special Edition (2025) | 471.0 | 46.0 | - | 192.0 | 6.84 | Modello popolare per principianti | 3) **Suggerimenti per affinare la ricerca** - Considera di aggiungere un filtro per il peso a pieno carico.`;

    // Test 1: Verifica pattern risposta breve
    console.log('\n🧪 TEST 1: Short Answer Pattern');
    const shortPattern = /1\)\s*\*\*Risposta\s+breve\*\*\s*(.*?)(?=\s*2\)|$)/s;
    const shortMatch = realMessage.match(shortPattern);
    console.log('Short answer match:', !!shortMatch);
    if (shortMatch) {
      console.log('Short answer content:', shortMatch[1].substring(0, 100) + '...');
    }

    // Test 2: Verifica pattern tabella
    console.log('\n🧪 TEST 2: Table Pattern');
    const tablePatterns = [
      /\|\s*Marca\s*\|.*?\|\s*[^|]+\s*\|/gs,
      /\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|/g,
      /\|.*\|[\s\S]*?\|.*\|/
    ];

    tablePatterns.forEach((pattern, index) => {
      const match = realMessage.match(pattern);
      console.log(`Table pattern ${index + 1}:`, !!match, match ? `(${match.length} matches)` : '');
      if (match && match[0]) {
        console.log(`First match preview:`, match[0].substring(0, 150) + '...');
      }
    });

    // Test 3: Verifica pattern suggerimenti
    console.log('\n🧪 TEST 3: Suggestions Pattern');
    const suggPattern = /3\)\s*\*\*Suggerimenti\s+per\s+affinare\s+la\s+ricerca\*\*\s*(.*?)(?=$)/s;
    const suggMatch = realMessage.match(suggPattern);
    console.log('Suggestions match:', !!suggMatch);
    if (suggMatch) {
      console.log('Suggestions content:', suggMatch[1].substring(0, 100) + '...');
    }

    // Test 4: Full parsing
    console.log('\n🧪 TEST 4: Full Parsing');
    const fullResult = this.parseStructuredResponse(realMessage);
    console.log('Full parsing result summary:');
    console.log('- Short answer:', !!fullResult.shortAnswer);
    console.log('- Table details:', !!fullResult.details);
    console.log('- Motorcycle count:', fullResult.details?.rows?.length || 0);
    console.log('- Suggestions:', fullResult.suggestions?.length || 0);

    console.log('🩺 === FULL DIAGNOSTICS END ===');
  }
}

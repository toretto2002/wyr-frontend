export interface ResponseData {
  answer: string;
  rows: string[];
  session_id: string;
  sql_query: string;
}

// Modelli per la formattazione strutturata delle risposte
export interface FormattedResponse {
  shortAnswer?: string;
  details?: MotorcycleTableData;
  suggestions?: string[];
  rawContent?: string;
}

export interface MotorcycleTableData {
  title?: string;
  columns: string[];
  rows: MotorcycleRow[];
}

export interface MotorcycleRow {
  brand: string;
  model: string;
  version: string;
  power: number;
  weight?: number;
  price: number;
  notes: string;
  [key: string]: any; // Per eventuali colonne aggiuntive
}

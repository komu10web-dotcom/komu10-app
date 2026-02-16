export interface Database {
  public: {
    Tables: {
      transactions: {
        Row: {
          id: string;
          date: string;
          description: string;
          amount: number;
          account: string;
          counterpart: string | null;
          category: string | null;
          memo: string | null;
          receipt_url: string | null;
          allocations: AllocationData[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transactions']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>;
      };
      receipts: {
        Row: {
          id: string;
          transaction_id: string | null;
          file_url: string;
          file_name: string;
          ocr_text: string | null;
          ai_extracted: AIExtractedData | null;
          confidence_score: number | null;
          status: 'pending' | 'processed' | 'needs_review' | 'matched';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['receipts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['receipts']['Insert']>;
      };
      divisions: {
        Row: {
          id: string;
          code: string;
          name: string;
          color: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['divisions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['divisions']['Insert']>;
      };
      transaction_allocations: {
        Row: {
          id: string;
          transaction_id: string;
          division_id: string;
          project_id: string | null;
          ratio: number;
          amount: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transaction_allocations']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['transaction_allocations']['Insert']>;
      };
    };
  };
}

export interface AIExtractedData {
  vendor?: string;
  date?: string;
  amount?: number;
  items?: Array<{
    name: string;
    quantity?: number;
    price?: number;
  }>;
  tax?: number;
  payment_method?: string;
}

export interface AllocationData {
  division_id: string;
  project_id?: string;
  ratio: number;
}

export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type Receipt = Database['public']['Tables']['receipts']['Row'];
export type Division = Database['public']['Tables']['divisions']['Row'];
export type TransactionAllocation = Database['public']['Tables']['transaction_allocations']['Row'];

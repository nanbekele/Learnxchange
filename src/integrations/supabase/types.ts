export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      commissions: {
        Row: {
          amount: number
          created_at: string
          id: string
          rate: number
          transaction_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          rate?: number
          transaction_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          rate?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          admin_reply: string | null
          created_at: string
          email: string
          id: string
          message: string
          name: string
          replied_at: string | null
          replied_by: string | null
          status: string
          subject: string | null
          user_id: string | null
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          subject?: string | null
          user_id?: string | null
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          subject?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_replied_by_fkey"
            columns: ["replied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      course_materials: {
        Row: {
          course_id: string
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          file_name: string
          file_size?: number
          file_type?: string
          file_url: string
          id?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_materials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_ratings: {
        Row: {
          comment: string | null
          course_id: string
          created_at: string
          id: string
          rater_id: string
          score: number
          updated_at: string
        }
        Insert: {
          comment?: string | null
          course_id: string
          created_at?: string
          id?: string
          rater_id: string
          score: number
          updated_at?: string
        }
        Update: {
          comment?: string | null
          course_id?: string
          created_at?: string
          id?: string
          rater_id?: string
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_ratings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          availability: string
          category: string
          created_at: string
          description: string
          id: string
          outline: string
          price: number
          status: string
          toc_url: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          availability?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          outline?: string
          price?: number
          status?: string
          toc_url?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          availability?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          outline?: string
          price?: number
          status?: string
          toc_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exchanges: {
        Row: {
          created_at: string
          id: string
          offered_course_id: string
          owner_id: string
          rejection_reason: string | null
          requested_course_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          offered_course_id: string
          owner_id: string
          rejection_reason?: string | null
          requested_course_id: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          offered_course_id?: string
          owner_id?: string
          rejection_reason?: string | null
          requested_course_id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchanges_offered_course_id_fkey"
            columns: ["offered_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchanges_requested_course_id_fkey"
            columns: ["requested_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          last_login: string | null
          reputation_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_login?: string | null
          reputation_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_login?: string | null
          reputation_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          exchange_id: string | null
          id: string
          rated_id: string
          rater_id: string
          score: number
          transaction_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          exchange_id?: string | null
          id?: string
          rated_id: string
          rater_id: string
          score: number
          transaction_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          exchange_id?: string | null
          id?: string
          rated_id?: string
          rater_id?: string
          score?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_exchange_id_fkey"
            columns: ["exchange_id"]
            isOneToOne: false
            referencedRelation: "exchanges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          body: string | null
          type: string
          link: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          body?: string | null
          type?: string
          link?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          body?: string | null
          type?: string
          link?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      platform_balance: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          last_updated: string
          notes: string | null
          updated_by: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          last_updated?: string
          notes?: string | null
          updated_by?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          last_updated?: string
          notes?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_balance_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          account_name: string
          account_number: string
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          method: string
          paid_at: string | null
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          method?: string
          paid_at?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          method?: string
          paid_at?: string | null
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      seller_earnings: {
        Row: {
          amount: number
          available_at: string
          created_at: string
          id: string
          payout_request_id: string | null
          seller_id: string
          status: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          available_at: string
          created_at?: string
          id?: string
          payout_request_id?: string | null
          seller_id: string
          status?: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          available_at?: string
          created_at?: string
          id?: string
          payout_request_id?: string | null
          seller_id?: string
          status?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_earnings_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_earnings_payout_request_id_fkey"
            columns: ["payout_request_id"]
            isOneToOne: false
            referencedRelation: "payout_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          buyer_commission_amount: number | null
          buyer_id: string
          commission_amount: number
          course_id: string
          created_at: string
          id: string
          seller_amount: number
          seller_id: string
          status: string
          tx_ref: string | null
        }
        Insert: {
          amount?: number
          buyer_commission_amount?: number | null
          buyer_id: string
          commission_amount?: number
          course_id: string
          created_at?: string
          id?: string
          seller_amount?: number
          seller_id: string
          status?: string
          tx_ref?: string | null
        }
        Update: {
          amount?: number
          buyer_commission_amount?: number | null
          buyer_id?: string
          commission_amount?: number
          course_id?: string
          created_at?: string
          id?: string
          seller_amount?: number
          seller_id?: string
          status?: string
          tx_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_payment_methods: {
        Row: {
          account_name: string
          account_number: string
          created_at: string
          id: string
          is_default: boolean
          method: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          created_at?: string
          id?: string
          is_default?: boolean
          method?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          created_at?: string
          id?: string
          is_default?: boolean
          method?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          id: string
          user_id: string
          ip_address: string | null
          user_agent: string | null
          logged_in_at: string
          logged_out_at: string | null
          is_active: boolean
        }
        Insert: {
          id?: string
          user_id: string
          ip_address?: string | null
          user_agent?: string | null
          logged_in_at?: string
          logged_out_at?: string | null
          is_active?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          ip_address?: string | null
          user_agent?: string | null
          logged_in_at?: string
          logged_out_at?: string | null
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      create_payout_request: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      daily_actions: {
        Row: {
          action_type: string
          completed_at: string | null
          created_at: string
          daily_plan_id: string
          definition_of_done: string
          estimated_minutes: number
          id: string
          rescheduled_for: string | null
          resolution_note: string | null
          scheduled_time: string | null
          sort_order: number
          status: Database["public"]["Enums"]["daily_action_status"]
          suggested_method: string
          title: string
          updated_at: string
          user_id: string
          why_it_exists: string
        }
        Insert: {
          action_type: string
          completed_at?: string | null
          created_at?: string
          daily_plan_id: string
          definition_of_done: string
          estimated_minutes: number
          id: string
          rescheduled_for?: string | null
          resolution_note?: string | null
          scheduled_time?: string | null
          sort_order: number
          status: Database["public"]["Enums"]["daily_action_status"]
          suggested_method: string
          title: string
          updated_at?: string
          user_id: string
          why_it_exists: string
        }
        Update: {
          action_type?: string
          completed_at?: string | null
          created_at?: string
          daily_plan_id?: string
          definition_of_done?: string
          estimated_minutes?: number
          id?: string
          rescheduled_for?: string | null
          resolution_note?: string | null
          scheduled_time?: string | null
          sort_order?: number
          status?: Database["public"]["Enums"]["daily_action_status"]
          suggested_method?: string
          title?: string
          updated_at?: string
          user_id?: string
          why_it_exists?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_actions_plan_owner_fkey"
            columns: ["daily_plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      daily_plans: {
        Row: {
          aiming_to_sleep_at: string | null
          approved_at: string | null
          closed_at: string | null
          context_for_today: string | null
          created_at: string
          focus: string | null
          id: string
          local_date: string
          proposed_at: string | null
          status: Database["public"]["Enums"]["daily_plan_status"]
          updated_at: string
          user_id: string
          woke_at: string | null
        }
        Insert: {
          aiming_to_sleep_at?: string | null
          approved_at?: string | null
          closed_at?: string | null
          context_for_today?: string | null
          created_at?: string
          focus?: string | null
          id?: string
          local_date: string
          proposed_at?: string | null
          status?: Database["public"]["Enums"]["daily_plan_status"]
          updated_at?: string
          user_id: string
          woke_at?: string | null
        }
        Update: {
          aiming_to_sleep_at?: string | null
          approved_at?: string | null
          closed_at?: string | null
          context_for_today?: string | null
          created_at?: string
          focus?: string | null
          id?: string
          local_date?: string
          proposed_at?: string | null
          status?: Database["public"]["Enums"]["daily_plan_status"]
          updated_at?: string
          user_id?: string
          woke_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      day_records: {
        Row: {
          created_at: string
          daily_plan_id: string
          id: string
          notes: string | null
          progress_recorded: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_plan_id: string
          id?: string
          notes?: string | null
          progress_recorded: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_plan_id?: string
          id?: string
          notes?: string | null
          progress_recorded?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_records_plan_owner_fkey"
            columns: ["daily_plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      product_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          properties: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          properties?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          last_active_at: string | null
          name: string | null
          onboarding_completed: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          last_active_at?: string | null
          name?: string | null
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_active_at?: string | null
          name?: string | null
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_daily_plan: {
        Args: { p_daily_plan_id: string }
        Returns: undefined
      }
      begin_day_closing: {
        Args: { p_daily_plan_id: string }
        Returns: undefined
      }
      begin_day_shaping: { Args: { p_local_date: string }; Returns: string }
      finish_day: {
        Args: { p_daily_plan_id: string; p_notes?: string }
        Returns: string
      }
      is_valid_timezone: { Args: { p_timezone: string }; Returns: boolean }
      record_app_opened: { Args: { p_timezone: string }; Returns: undefined }
      remove_proposed_action: {
        Args: { p_daily_action_id: string }
        Returns: undefined
      }
      resolve_daily_action: {
        Args: {
          p_daily_action_id: string
          p_outcome: string
          p_resolution_note?: string
          p_selected_date?: string
        }
        Returns: undefined
      }
      save_proposed_plan: {
        Args: {
          p_actions: Json
          p_aiming_to_sleep_at: string
          p_context_for_today: string
          p_focus: string
          p_local_date: string
          p_woke_at: string
        }
        Returns: string
      }
      set_action_completion: {
        Args: { p_completed: boolean; p_daily_action_id: string }
        Returns: undefined
      }
      undo_day_close: { Args: { p_daily_plan_id: string }; Returns: undefined }
    }
    Enums: {
      daily_action_status:
        | "proposed"
        | "active"
        | "completed"
        | "rescheduled"
        | "removed"
        | "dropped"
      daily_plan_status:
        | "unshaped"
        | "proposed"
        | "active"
        | "closing"
        | "closed"
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
      daily_action_status: [
        "proposed",
        "active",
        "completed",
        "rescheduled",
        "removed",
        "dropped",
      ],
      daily_plan_status: [
        "unshaped",
        "proposed",
        "active",
        "closing",
        "closed",
      ],
    },
  },
} as const

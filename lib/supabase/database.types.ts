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
      action_assistant_messages: {
        Row: {
          content: string
          created_at: string
          daily_action_id: string
          id: string
          role: Database["public"]["Enums"]["action_assistant_role"]
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          daily_action_id: string
          id?: string
          role: Database["public"]["Enums"]["action_assistant_role"]
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          daily_action_id?: string
          id?: string
          role?: Database["public"]["Enums"]["action_assistant_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_assistant_messages_action_owner_fkey"
            columns: ["daily_action_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_actions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      action_notes: {
        Row: {
          created_at: string
          daily_action_id: string
          id: string
          note: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_action_id: string
          id?: string
          note: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_action_id?: string
          id?: string
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_notes_action_owner_fkey"
            columns: ["daily_action_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_actions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      daily_actions: {
        Row: {
          action_type: string
          approved_at: string | null
          clarification_answer: string | null
          clarification_question: string | null
          completed_at: string | null
          completion_recorded_at: string | null
          completion_time_unknown: boolean
          created_at: string
          daily_plan_id: string
          definition_of_done: string
          estimated_minutes: number
          id: string
          linked_context_kind: string | null
          linked_context_label: string | null
          ongoing_context_decision: string | null
          ongoing_context_suggestion: string | null
          original_input: string | null
          recurrence_days: number[]
          recurrence_pattern: string
          reschedule_count: number
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
          approved_at?: string | null
          clarification_answer?: string | null
          clarification_question?: string | null
          completed_at?: string | null
          completion_recorded_at?: string | null
          completion_time_unknown?: boolean
          created_at?: string
          daily_plan_id: string
          definition_of_done: string
          estimated_minutes: number
          id: string
          linked_context_kind?: string | null
          linked_context_label?: string | null
          ongoing_context_decision?: string | null
          ongoing_context_suggestion?: string | null
          original_input?: string | null
          recurrence_days?: number[]
          recurrence_pattern?: string
          reschedule_count?: number
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
          approved_at?: string | null
          clarification_answer?: string | null
          clarification_question?: string | null
          completed_at?: string | null
          completion_recorded_at?: string | null
          completion_time_unknown?: boolean
          created_at?: string
          daily_plan_id?: string
          definition_of_done?: string
          estimated_minutes?: number
          id?: string
          linked_context_kind?: string | null
          linked_context_label?: string | null
          ongoing_context_decision?: string | null
          ongoing_context_suggestion?: string | null
          original_input?: string | null
          recurrence_days?: number[]
          recurrence_pattern?: string
          reschedule_count?: number
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
          record_kind: string
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
          record_kind?: string
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
          record_kind?: string
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
      return_gap_records: {
        Row: {
          context_summary: string | null
          gap_end_date: string
          gap_start_date: string
          id: string
          nothing_important: boolean
          recorded_at: string
          user_id: string
        }
        Insert: {
          context_summary?: string | null
          gap_end_date: string
          gap_start_date: string
          id?: string
          nothing_important?: boolean
          recorded_at?: string
          user_id: string
        }
        Update: {
          context_summary?: string | null
          gap_end_date?: string
          gap_start_date?: string
          id?: string
          nothing_important?: boolean
          recorded_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adapt_daily_action: {
        Args: {
          p_action_type: string
          p_daily_action_id: string
          p_definition_of_done: string
          p_estimated_minutes: number
          p_outcome?: string
          p_scheduled_time: string
          p_suggested_method: string
          p_target_date?: string
          p_title: string
          p_why_it_exists: string
        }
        Returns: undefined
      }
      add_daily_action: {
        Args: {
          p_action_type: string
          p_clarification_answer?: string
          p_clarification_question?: string
          p_daily_plan_id: string
          p_definition_of_done?: string
          p_estimated_minutes: number
          p_linked_context_kind?: string
          p_linked_context_label?: string
          p_ongoing_context_suggestion?: string
          p_original_input?: string
          p_recurrence_days?: number[]
          p_recurrence_pattern?: string
          p_scheduled_time?: string
          p_suggested_method?: string
          p_title: string
          p_why_it_exists?: string
        }
        Returns: string
      }
      approve_daily_plan: {
        Args: { p_daily_plan_id: string }
        Returns: undefined
      }
      begin_day_closing: {
        Args: { p_daily_plan_id: string }
        Returns: undefined
      }
      begin_day_shaping: { Args: { p_local_date: string }; Returns: string }
      correct_action_completion_time: {
        Args: {
          p_completed_at?: string
          p_daily_action_id: string
          p_time_unknown?: boolean
        }
        Returns: undefined
      }
      delete_action_note: {
        Args: { p_action_note_id: string }
        Returns: string
      }
      finish_day: {
        Args: { p_daily_plan_id: string; p_notes?: string }
        Returns: string
      }
      get_latest_return_gap_record: { Args: never; Returns: Json }
      is_valid_timezone: { Args: { p_timezone: string }; Returns: boolean }
      log_action_note: {
        Args: { p_daily_action_id: string; p_note: string }
        Returns: string
      }
      reconcile_previous_day: {
        Args: {
          p_context_summary?: string
          p_daily_plan_id: string
          p_explanation: string
          p_ongoing_context_candidate?: Json
          p_resolutions: Json
          p_unplanned_progress?: Json
        }
        Returns: string
      }
      reconcile_previous_day_direct: {
        Args: {
          p_context_summary?: string
          p_daily_plan_id: string
          p_extra_context?: string
          p_ongoing_context_candidate?: Json
          p_resolutions: Json
          p_unplanned_progress?: Json
        }
        Returns: string
      }
      reconcile_previous_day_direct_v2: {
        Args: {
          p_context_summary?: string
          p_daily_plan_id: string
          p_extra_context?: string
          p_ongoing_context_candidate?: Json
          p_resolutions: Json
          p_unplanned_progress?: Json
        }
        Returns: string
      }
      reconcile_previous_day_direct_v3: {
        Args: {
          p_context_summary?: string
          p_daily_plan_id: string
          p_extra_context?: string
          p_ongoing_context_candidate?: Json
          p_resolutions: Json
          p_unplanned_progress?: Json
        }
        Returns: string
      }
      record_app_opened: { Args: { p_timezone: string }; Returns: undefined }
      record_historical_day: {
        Args: {
          p_explanation?: string
          p_local_date: string
          p_skipped?: boolean
        }
        Returns: string
      }
      record_return_gap: {
        Args: {
          p_context_summary?: string
          p_gap_end_date: string
          p_gap_start_date: string
          p_nothing_important?: boolean
        }
        Returns: string
      }
      record_return_gap_v2: {
        Args: {
          p_context_summary?: string
          p_gap_end_date: string
          p_gap_start_date: string
          p_nothing_important?: boolean
        }
        Returns: string
      }
      remove_action_from_today: {
        Args: { p_daily_action_id: string }
        Returns: undefined
      }
      remove_proposed_action: {
        Args: { p_daily_action_id: string }
        Returns: undefined
      }
      replace_active_action: {
        Args: {
          p_action_type: string
          p_daily_action_id: string
          p_definition_of_done: string
          p_estimated_minutes: number
          p_scheduled_time: string
          p_suggested_method: string
          p_title: string
          p_why_it_exists: string
        }
        Returns: string
      }
      reschedule_proposed_action: {
        Args: { p_daily_action_id: string; p_target_date: string }
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
      save_action_assistant_exchange: {
        Args: {
          p_daily_action_id: string
          p_question: string
          p_response: string
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
      set_action_context_decision: {
        Args: { p_daily_action_id: string; p_decision: string }
        Returns: undefined
      }
      undo_day_close: { Args: { p_daily_plan_id: string }; Returns: undefined }
      update_daily_action: {
        Args: {
          p_action_type: string
          p_daily_action_id: string
          p_definition_of_done: string
          p_estimated_minutes: number
          p_scheduled_time: string
          p_suggested_method: string
          p_title: string
          p_why_it_exists: string
        }
        Returns: undefined
      }
    }
    Enums: {
      action_assistant_role: "user" | "assistant"
      daily_action_status:
        | "proposed"
        | "active"
        | "completed"
        | "rescheduled"
        | "removed"
        | "dropped"
        | "missed"
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
      action_assistant_role: ["user", "assistant"],
      daily_action_status: [
        "proposed",
        "active",
        "completed",
        "rescheduled",
        "removed",
        "dropped",
        "missed",
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

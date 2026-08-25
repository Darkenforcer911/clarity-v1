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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
      calendar_commitment_occurrence_revisions: {
        Row: {
          calendar_commitment_occurrence_id: string
          corrected_at: string
          correction_type: string
          id: string
          new_completed_at: string | null
          new_outcome:
            | Database["public"]["Enums"]["calendar_event_outcome"]
            | null
          new_outcome_note: string | null
          new_recorded_at: string | null
          previous_completed_at: string | null
          previous_outcome:
            | Database["public"]["Enums"]["calendar_event_outcome"]
            | null
          previous_outcome_note: string | null
          previous_recorded_at: string | null
          reason: string
          user_id: string
        }
        Insert: {
          calendar_commitment_occurrence_id: string
          corrected_at?: string
          correction_type: string
          id?: string
          new_completed_at?: string | null
          new_outcome?:
            | Database["public"]["Enums"]["calendar_event_outcome"]
            | null
          new_outcome_note?: string | null
          new_recorded_at?: string | null
          previous_completed_at?: string | null
          previous_outcome?:
            | Database["public"]["Enums"]["calendar_event_outcome"]
            | null
          previous_outcome_note?: string | null
          previous_recorded_at?: string | null
          reason: string
          user_id: string
        }
        Update: {
          calendar_commitment_occurrence_id?: string
          corrected_at?: string
          correction_type?: string
          id?: string
          new_completed_at?: string | null
          new_outcome?:
            | Database["public"]["Enums"]["calendar_event_outcome"]
            | null
          new_outcome_note?: string | null
          new_recorded_at?: string | null
          previous_completed_at?: string | null
          previous_outcome?:
            | Database["public"]["Enums"]["calendar_event_outcome"]
            | null
          previous_outcome_note?: string | null
          previous_recorded_at?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_commitment_occurrence_revisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_occurrence_revisions_occurrence_owner_fkey"
            columns: ["calendar_commitment_occurrence_id", "user_id"]
            isOneToOne: false
            referencedRelation: "calendar_commitment_occurrences"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      calendar_commitment_occurrences: {
        Row: {
          calendar_commitment_id: string
          completed_at: string | null
          created_at: string
          id: string
          occurrence_date: string
          outcome: Database["public"]["Enums"]["calendar_event_outcome"] | null
          outcome_note: string | null
          recorded_at: string
          replacement_commitment_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_commitment_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          occurrence_date: string
          outcome?: Database["public"]["Enums"]["calendar_event_outcome"] | null
          outcome_note?: string | null
          recorded_at?: string
          replacement_commitment_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_commitment_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          occurrence_date?: string
          outcome?: Database["public"]["Enums"]["calendar_event_outcome"] | null
          outcome_note?: string | null
          recorded_at?: string
          replacement_commitment_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_commitment_occurrences_calendar_commitment_id_fkey"
            columns: ["calendar_commitment_id"]
            isOneToOne: false
            referencedRelation: "calendar_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_commitment_occurrences_replacement_commitment_id_fkey"
            columns: ["replacement_commitment_id"]
            isOneToOne: false
            referencedRelation: "calendar_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_commitment_occurrences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_commitments: {
        Row: {
          commitment_type: Database["public"]["Enums"]["calendar_commitment_type"]
          created_at: string
          current_context_id: string | null
          deadline_due_time: string | null
          details: string | null
          duration_minutes: number | null
          event_start_time: string | null
          goal_id: string | null
          id: string
          life_area_id: string | null
          local_date: string
          project_id: string | null
          recurrence: Database["public"]["Enums"]["calendar_recurrence_preset"]
          recurrence_interval: number
          recurrence_unit:
            | Database["public"]["Enums"]["calendar_recurrence_unit"]
            | null
          recurrence_weekdays: number[]
          relationship_source:
            | Database["public"]["Enums"]["life_model_provenance"]
            | null
          reminder_offsets_minutes: number[]
          rescheduled_from_id: string | null
          status: Database["public"]["Enums"]["calendar_commitment_status"]
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commitment_type: Database["public"]["Enums"]["calendar_commitment_type"]
          created_at?: string
          current_context_id?: string | null
          deadline_due_time?: string | null
          details?: string | null
          duration_minutes?: number | null
          event_start_time?: string | null
          goal_id?: string | null
          id?: string
          life_area_id?: string | null
          local_date: string
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["calendar_recurrence_preset"]
          recurrence_interval?: number
          recurrence_unit?:
            | Database["public"]["Enums"]["calendar_recurrence_unit"]
            | null
          recurrence_weekdays?: number[]
          relationship_source?:
            | Database["public"]["Enums"]["life_model_provenance"]
            | null
          reminder_offsets_minutes?: number[]
          rescheduled_from_id?: string | null
          status?: Database["public"]["Enums"]["calendar_commitment_status"]
          timezone: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commitment_type?: Database["public"]["Enums"]["calendar_commitment_type"]
          created_at?: string
          current_context_id?: string | null
          deadline_due_time?: string | null
          details?: string | null
          duration_minutes?: number | null
          event_start_time?: string | null
          goal_id?: string | null
          id?: string
          life_area_id?: string | null
          local_date?: string
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["calendar_recurrence_preset"]
          recurrence_interval?: number
          recurrence_unit?:
            | Database["public"]["Enums"]["calendar_recurrence_unit"]
            | null
          recurrence_weekdays?: number[]
          relationship_source?:
            | Database["public"]["Enums"]["life_model_provenance"]
            | null
          reminder_offsets_minutes?: number[]
          rescheduled_from_id?: string | null
          status?: Database["public"]["Enums"]["calendar_commitment_status"]
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_commitments_context_owner_fkey"
            columns: ["current_context_id", "user_id"]
            isOneToOne: false
            referencedRelation: "current_contexts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "calendar_commitments_goal_owner_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "calendar_commitments_life_area_owner_fkey"
            columns: ["life_area_id", "user_id"]
            isOneToOne: false
            referencedRelation: "life_areas"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "calendar_commitments_project_owner_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "calendar_commitments_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "calendar_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_commitments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      current_contexts: {
        Row: {
          created_at: string
          created_via: Database["public"]["Enums"]["life_model_provenance"]
          ended_on: string | null
          expected_end_end: string | null
          expected_end_start: string | null
          id: string
          life_area_id: string
          planning_impact: string
          source_proposal_id: string | null
          started_on: string
          status: Database["public"]["Enums"]["current_context_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          ended_on?: string | null
          expected_end_end?: string | null
          expected_end_start?: string | null
          id?: string
          life_area_id: string
          planning_impact: string
          source_proposal_id?: string | null
          started_on: string
          status?: Database["public"]["Enums"]["current_context_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          ended_on?: string | null
          expected_end_end?: string | null
          expected_end_start?: string | null
          id?: string
          life_area_id?: string
          planning_impact?: string
          source_proposal_id?: string | null
          started_on?: string
          status?: Database["public"]["Enums"]["current_context_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "current_contexts_area_owner_fkey"
            columns: ["life_area_id", "user_id"]
            isOneToOne: false
            referencedRelation: "life_areas"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "current_contexts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_action_current_contexts: {
        Row: {
          created_at: string
          current_context_id: string
          daily_action_id: string
          relationship_source: Database["public"]["Enums"]["life_model_provenance"]
          user_id: string
        }
        Insert: {
          created_at?: string
          current_context_id: string
          daily_action_id: string
          relationship_source: Database["public"]["Enums"]["life_model_provenance"]
          user_id: string
        }
        Update: {
          created_at?: string
          current_context_id?: string
          daily_action_id?: string
          relationship_source?: Database["public"]["Enums"]["life_model_provenance"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_action_contexts_action_owner_fkey"
            columns: ["daily_action_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_actions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_action_contexts_context_owner_fkey"
            columns: ["current_context_id", "user_id"]
            isOneToOne: false
            referencedRelation: "current_contexts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      daily_action_outcome_revisions: {
        Row: {
          correction_note: string | null
          daily_action_id: string
          id: string
          new_completed_at: string | null
          new_completion_time_unknown: boolean
          new_rescheduled_for: string | null
          new_status: Database["public"]["Enums"]["daily_action_status"] | null
          previous_completed_at: string | null
          previous_completion_time_unknown: boolean
          previous_rescheduled_for: string | null
          previous_status: Database["public"]["Enums"]["daily_action_status"]
          recorded_at: string
          user_id: string
        }
        Insert: {
          correction_note?: string | null
          daily_action_id: string
          id?: string
          new_completed_at?: string | null
          new_completion_time_unknown?: boolean
          new_rescheduled_for?: string | null
          new_status?: Database["public"]["Enums"]["daily_action_status"] | null
          previous_completed_at?: string | null
          previous_completion_time_unknown?: boolean
          previous_rescheduled_for?: string | null
          previous_status: Database["public"]["Enums"]["daily_action_status"]
          recorded_at?: string
          user_id: string
        }
        Update: {
          correction_note?: string | null
          daily_action_id?: string
          id?: string
          new_completed_at?: string | null
          new_completion_time_unknown?: boolean
          new_rescheduled_for?: string | null
          new_status?: Database["public"]["Enums"]["daily_action_status"] | null
          previous_completed_at?: string | null
          previous_completion_time_unknown?: boolean
          previous_rescheduled_for?: string | null
          previous_status?: Database["public"]["Enums"]["daily_action_status"]
          recorded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_action_outcome_revisions_action_owner_fkey"
            columns: ["daily_action_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_actions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_action_outcome_revisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
          completion_evidence_only: boolean
          completion_recorded_at: string | null
          completion_time_unknown: boolean
          created_at: string
          daily_plan_id: string
          definition_of_done: string
          estimated_minutes: number
          goal_id: string | null
          id: string
          life_area_id: string | null
          linked_context_kind: string | null
          linked_context_label: string | null
          ongoing_context_decision: string | null
          ongoing_context_suggestion: string | null
          original_input: string | null
          project_id: string | null
          recurrence_days: number[]
          recurrence_pattern: string
          relationship_source:
            | Database["public"]["Enums"]["life_model_provenance"]
            | null
          reschedule_count: number
          rescheduled_for: string | null
          resolution_note: string | null
          scheduled_time: string | null
          sort_order: number
          source_calendar_commitment_id: string | null
          source_routine_id: string | null
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
          completion_evidence_only?: boolean
          completion_recorded_at?: string | null
          completion_time_unknown?: boolean
          created_at?: string
          daily_plan_id: string
          definition_of_done: string
          estimated_minutes: number
          goal_id?: string | null
          id: string
          life_area_id?: string | null
          linked_context_kind?: string | null
          linked_context_label?: string | null
          ongoing_context_decision?: string | null
          ongoing_context_suggestion?: string | null
          original_input?: string | null
          project_id?: string | null
          recurrence_days?: number[]
          recurrence_pattern?: string
          relationship_source?:
            | Database["public"]["Enums"]["life_model_provenance"]
            | null
          reschedule_count?: number
          rescheduled_for?: string | null
          resolution_note?: string | null
          scheduled_time?: string | null
          sort_order: number
          source_calendar_commitment_id?: string | null
          source_routine_id?: string | null
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
          completion_evidence_only?: boolean
          completion_recorded_at?: string | null
          completion_time_unknown?: boolean
          created_at?: string
          daily_plan_id?: string
          definition_of_done?: string
          estimated_minutes?: number
          goal_id?: string | null
          id?: string
          life_area_id?: string | null
          linked_context_kind?: string | null
          linked_context_label?: string | null
          ongoing_context_decision?: string | null
          ongoing_context_suggestion?: string | null
          original_input?: string | null
          project_id?: string | null
          recurrence_days?: number[]
          recurrence_pattern?: string
          relationship_source?:
            | Database["public"]["Enums"]["life_model_provenance"]
            | null
          reschedule_count?: number
          rescheduled_for?: string | null
          resolution_note?: string | null
          scheduled_time?: string | null
          sort_order?: number
          source_calendar_commitment_id?: string | null
          source_routine_id?: string | null
          status?: Database["public"]["Enums"]["daily_action_status"]
          suggested_method?: string
          title?: string
          updated_at?: string
          user_id?: string
          why_it_exists?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_actions_calendar_owner_fkey"
            columns: ["source_calendar_commitment_id", "user_id"]
            isOneToOne: false
            referencedRelation: "calendar_commitments"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_actions_goal_owner_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_actions_life_area_owner_fkey"
            columns: ["life_area_id", "user_id"]
            isOneToOne: false
            referencedRelation: "life_areas"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_actions_plan_owner_fkey"
            columns: ["daily_plan_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_plans"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_actions_project_owner_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "daily_actions_routine_owner_fkey"
            columns: ["source_routine_id", "user_id"]
            isOneToOne: false
            referencedRelation: "routines"
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
      day_corrections: {
        Row: {
          correction_type: Database["public"]["Enums"]["day_correction_type"]
          created_at: string
          details: string | null
          duration_minutes: number | null
          id: string
          local_date: string
          occurred_time: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          correction_type: Database["public"]["Enums"]["day_correction_type"]
          created_at?: string
          details?: string | null
          duration_minutes?: number | null
          id?: string
          local_date: string
          occurred_time?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          correction_type?: Database["public"]["Enums"]["day_correction_type"]
          created_at?: string
          details?: string | null
          duration_minutes?: number | null
          id?: string
          local_date?: string
          occurred_time?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_corrections_user_id_fkey"
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
      goal_decisions: {
        Row: {
          consequence_summary: string | null
          created_at: string
          created_via: Database["public"]["Enums"]["life_model_provenance"]
          decided_at: string
          decision_type: Database["public"]["Enums"]["goal_decision_type"]
          evidence_summary: string | null
          goal_id: string
          id: string
          rationale: string
          replacement_goal_id: string | null
          source_proposal_id: string | null
          user_id: string
        }
        Insert: {
          consequence_summary?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          decided_at?: string
          decision_type: Database["public"]["Enums"]["goal_decision_type"]
          evidence_summary?: string | null
          goal_id: string
          id?: string
          rationale: string
          replacement_goal_id?: string | null
          source_proposal_id?: string | null
          user_id: string
        }
        Update: {
          consequence_summary?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          decided_at?: string
          decision_type?: Database["public"]["Enums"]["goal_decision_type"]
          evidence_summary?: string | null
          goal_id?: string
          id?: string
          rationale?: string
          replacement_goal_id?: string | null
          source_proposal_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_decisions_goal_owner_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goal_decisions_replacement_owner_fkey"
            columns: ["replacement_goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goal_decisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          archived_at: string | null
          created_at: string
          created_via: Database["public"]["Enums"]["life_model_provenance"]
          desired_outcome: string
          id: string
          life_area_id: string
          replaced_by_goal_id: string | null
          source_proposal_id: string | null
          status: Database["public"]["Enums"]["goal_status"]
          target_confidence:
            | Database["public"]["Enums"]["life_target_confidence"]
            | null
          target_end_date: string | null
          target_start_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          desired_outcome: string
          id?: string
          life_area_id: string
          replaced_by_goal_id?: string | null
          source_proposal_id?: string | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_confidence?:
            | Database["public"]["Enums"]["life_target_confidence"]
            | null
          target_end_date?: string | null
          target_start_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          desired_outcome?: string
          id?: string
          life_area_id?: string
          replaced_by_goal_id?: string | null
          source_proposal_id?: string | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_confidence?:
            | Database["public"]["Enums"]["life_target_confidence"]
            | null
          target_end_date?: string | null
          target_start_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_area_owner_fkey"
            columns: ["life_area_id", "user_id"]
            isOneToOne: false
            referencedRelation: "life_areas"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goals_replacement_owner_fkey"
            columns: ["replaced_by_goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      life_area_current_states: {
        Row: {
          as_of_date: string
          confirmed_at: string
          created_at: string
          created_via: Database["public"]["Enums"]["life_model_provenance"]
          life_area_id: string
          source_proposal_id: string | null
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          as_of_date: string
          confirmed_at?: string
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          life_area_id: string
          source_proposal_id?: string | null
          summary: string
          updated_at?: string
          user_id: string
        }
        Update: {
          as_of_date?: string
          confirmed_at?: string
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          life_area_id?: string
          source_proposal_id?: string | null
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "life_area_current_states_owner_fkey"
            columns: ["life_area_id", "user_id"]
            isOneToOne: false
            referencedRelation: "life_areas"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      life_areas: {
        Row: {
          archived_at: string | null
          created_at: string
          created_via: Database["public"]["Enums"]["life_model_provenance"]
          id: string
          name: string
          sort_order: number
          status: Database["public"]["Enums"]["life_area_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          id?: string
          name: string
          sort_order?: number
          status?: Database["public"]["Enums"]["life_area_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          id?: string
          name?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["life_area_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "life_areas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      life_evidence: {
        Row: {
          archived_at: string | null
          created_at: string
          created_via: Database["public"]["Enums"]["life_model_provenance"]
          goal_id: string | null
          id: string
          life_area_id: string
          occurred_on: string
          project_id: string | null
          signal: Database["public"]["Enums"]["life_evidence_signal"]
          source_calendar_occurrence_id: string | null
          source_daily_action_id: string | null
          source_day_correction_id: string | null
          source_proposal_id: string | null
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          goal_id?: string | null
          id?: string
          life_area_id: string
          occurred_on: string
          project_id?: string | null
          signal?: Database["public"]["Enums"]["life_evidence_signal"]
          source_calendar_occurrence_id?: string | null
          source_daily_action_id?: string | null
          source_day_correction_id?: string | null
          source_proposal_id?: string | null
          summary: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          goal_id?: string | null
          id?: string
          life_area_id?: string
          occurred_on?: string
          project_id?: string | null
          signal?: Database["public"]["Enums"]["life_evidence_signal"]
          source_calendar_occurrence_id?: string | null
          source_daily_action_id?: string | null
          source_day_correction_id?: string | null
          source_proposal_id?: string | null
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "life_evidence_action_source_owner_fkey"
            columns: ["source_daily_action_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_actions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "life_evidence_area_owner_fkey"
            columns: ["life_area_id", "user_id"]
            isOneToOne: false
            referencedRelation: "life_areas"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "life_evidence_calendar_source_owner_fkey"
            columns: ["source_calendar_occurrence_id", "user_id"]
            isOneToOne: false
            referencedRelation: "calendar_commitment_occurrences"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "life_evidence_correction_source_owner_fkey"
            columns: ["source_day_correction_id", "user_id"]
            isOneToOne: false
            referencedRelation: "day_corrections"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "life_evidence_goal_owner_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "life_evidence_project_owner_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "life_evidence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt_count: number
          calendar_commitment_id: string
          created_at: string
          id: string
          last_error_code: string | null
          lease_expires_at: string | null
          next_attempt_at: string | null
          occurrence_date: string
          push_subscription_id: string
          reminder_offset_minutes: number
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          calendar_commitment_id: string
          created_at?: string
          id?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          next_attempt_at?: string | null
          occurrence_date: string
          push_subscription_id: string
          reminder_offset_minutes: number
          scheduled_for: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          calendar_commitment_id?: string
          created_at?: string
          id?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          next_attempt_at?: string | null
          occurrence_date?: string
          push_subscription_id?: string
          reminder_offset_minutes?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_commitment_owner_fk"
            columns: ["calendar_commitment_id", "user_id"]
            isOneToOne: false
            referencedRelation: "calendar_commitments"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "notification_deliveries_subscription_owner_fk"
            columns: ["push_subscription_id", "user_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "notification_deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      overnight_day_states: {
        Row: {
          attempt_count: number
          created_at: string
          day_started_at: string | null
          id: string
          interrupted_sleep_reported_at: string | null
          local_date: string
          outcome_reported_at: string | null
          reported_wake_at: string | null
          sleep_attempted_at: string | null
          sleep_outcome: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          day_started_at?: string | null
          id?: string
          interrupted_sleep_reported_at?: string | null
          local_date: string
          outcome_reported_at?: string | null
          reported_wake_at?: string | null
          sleep_attempted_at?: string | null
          sleep_outcome?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          day_started_at?: string | null
          id?: string
          interrupted_sleep_reported_at?: string | null
          local_date?: string
          outcome_reported_at?: string | null
          reported_wake_at?: string | null
          sleep_attempted_at?: string | null
          sleep_outcome?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overnight_day_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      projects: {
        Row: {
          archived_at: string | null
          created_at: string
          created_via: Database["public"]["Enums"]["life_model_provenance"]
          desired_outcome: string
          goal_id: string | null
          id: string
          life_area_id: string
          parent_project_id: string | null
          replaced_by_project_id: string | null
          source_proposal_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          target_confidence:
            | Database["public"]["Enums"]["life_target_confidence"]
            | null
          target_end_date: string | null
          target_start_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          desired_outcome: string
          goal_id?: string | null
          id?: string
          life_area_id: string
          parent_project_id?: string | null
          replaced_by_project_id?: string | null
          source_proposal_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_confidence?:
            | Database["public"]["Enums"]["life_target_confidence"]
            | null
          target_end_date?: string | null
          target_start_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          desired_outcome?: string
          goal_id?: string | null
          id?: string
          life_area_id?: string
          parent_project_id?: string | null
          replaced_by_project_id?: string | null
          source_proposal_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          target_confidence?:
            | Database["public"]["Enums"]["life_target_confidence"]
            | null
          target_end_date?: string | null
          target_start_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_area_owner_fkey"
            columns: ["life_area_id", "user_id"]
            isOneToOne: false
            referencedRelation: "life_areas"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "projects_goal_owner_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "projects_parent_owner_fkey"
            columns: ["parent_project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "projects_replacement_owner_fkey"
            columns: ["replaced_by_project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          enabled: boolean
          endpoint: string
          expiration_time: string | null
          failure_count: number
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          p256dh_key: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          expiration_time?: string | null
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh_key: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          expiration_time?: string | null
          failure_count?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          p256dh_key?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      return_gap_records: {
        Row: {
          boundary_kind: string
          context_summary: string | null
          gap_end_date: string
          gap_start_date: string
          id: string
          nothing_important: boolean
          recorded_at: string
          user_id: string
        }
        Insert: {
          boundary_kind?: string
          context_summary?: string | null
          gap_end_date: string
          gap_start_date: string
          id?: string
          nothing_important?: boolean
          recorded_at?: string
          user_id: string
        }
        Update: {
          boundary_kind?: string
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
      routines: {
        Row: {
          cadence: Database["public"]["Enums"]["routine_cadence"]
          cadence_count: number | null
          created_at: string
          created_via: Database["public"]["Enums"]["life_model_provenance"]
          ended_at: string | null
          estimated_minutes: number
          goal_id: string | null
          id: string
          life_area_id: string
          preferred_time: string | null
          project_id: string | null
          skip_policy: Database["public"]["Enums"]["routine_skip_policy"]
          source_proposal_id: string | null
          status: Database["public"]["Enums"]["routine_status"]
          title: string
          updated_at: string
          user_id: string
          weekdays: number[]
        }
        Insert: {
          cadence: Database["public"]["Enums"]["routine_cadence"]
          cadence_count?: number | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          ended_at?: string | null
          estimated_minutes: number
          goal_id?: string | null
          id?: string
          life_area_id: string
          preferred_time?: string | null
          project_id?: string | null
          skip_policy?: Database["public"]["Enums"]["routine_skip_policy"]
          source_proposal_id?: string | null
          status?: Database["public"]["Enums"]["routine_status"]
          title: string
          updated_at?: string
          user_id: string
          weekdays?: number[]
        }
        Update: {
          cadence?: Database["public"]["Enums"]["routine_cadence"]
          cadence_count?: number | null
          created_at?: string
          created_via?: Database["public"]["Enums"]["life_model_provenance"]
          ended_at?: string | null
          estimated_minutes?: number
          goal_id?: string | null
          id?: string
          life_area_id?: string
          preferred_time?: string | null
          project_id?: string | null
          skip_policy?: Database["public"]["Enums"]["routine_skip_policy"]
          source_proposal_id?: string | null
          status?: Database["public"]["Enums"]["routine_status"]
          title?: string
          updated_at?: string
          user_id?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "routines_area_owner_fkey"
            columns: ["life_area_id", "user_id"]
            isOneToOne: false
            referencedRelation: "life_areas"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "routines_goal_owner_fkey"
            columns: ["goal_id", "user_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "routines_project_owner_fkey"
            columns: ["project_id", "user_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "routines_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      approve_daily_plan_v2: {
        Args: { p_allow_empty?: boolean; p_daily_plan_id: string }
        Returns: undefined
      }
      archive_life_area: {
        Args: { p_life_area_id: string }
        Returns: undefined
      }
      archive_life_evidence: {
        Args: { p_life_evidence_id: string }
        Returns: undefined
      }
      begin_day_closing: {
        Args: { p_daily_plan_id: string }
        Returns: undefined
      }
      begin_day_shaping: { Args: { p_local_date: string }; Returns: string }
      cancel_calendar_commitment: {
        Args: { p_calendar_commitment_id: string }
        Returns: undefined
      }
      cancel_day_closing: {
        Args: { p_daily_plan_id: string }
        Returns: undefined
      }
      claim_notification_deliveries: {
        Args: {
          p_batch_size?: number
          p_lease_seconds?: number
          p_now?: string
        }
        Returns: {
          delivery_id: string
        }[]
      }
      complete_proposed_action: {
        Args: { p_daily_action_id: string }
        Returns: undefined
      }
      complete_proposed_action_v2: {
        Args: { p_completed_time?: string; p_daily_action_id: string }
        Returns: undefined
      }
      correct_action_completion_time: {
        Args: {
          p_completed_at?: string
          p_daily_action_id: string
          p_time_unknown?: boolean
        }
        Returns: undefined
      }
      correct_calendar_event_occurrence_outcome: {
        Args: {
          p_calendar_commitment_id: string
          p_completed_time?: string
          p_new_outcome?: Database["public"]["Enums"]["calendar_event_outcome"]
          p_occurrence_date: string
          p_outcome_note?: string
        }
        Returns: string
      }
      correct_historical_daily_action_outcome: {
        Args: {
          p_completed_time?: string
          p_correction_note?: string
          p_daily_action_id: string
          p_new_status?: Database["public"]["Enums"]["daily_action_status"]
        }
        Returns: string
      }
      correct_life_evidence: {
        Args: {
          p_life_evidence_id: string
          p_occurred_on: string
          p_signal: Database["public"]["Enums"]["life_evidence_signal"]
          p_summary: string
        }
        Returns: undefined
      }
      create_calendar_commitment: {
        Args: {
          p_commitment_type: Database["public"]["Enums"]["calendar_commitment_type"]
          p_deadline_due_time?: string
          p_details?: string
          p_duration_minutes?: number
          p_event_start_time?: string
          p_local_date: string
          p_recurrence?: Database["public"]["Enums"]["calendar_recurrence_preset"]
          p_recurrence_interval?: number
          p_recurrence_unit?: Database["public"]["Enums"]["calendar_recurrence_unit"]
          p_recurrence_weekdays?: number[]
          p_reminder_offsets_minutes?: number[]
          p_title: string
        }
        Returns: string
      }
      create_completed_plan_evidence: {
        Args: {
          p_completed_time?: string
          p_daily_plan_id: string
          p_title: string
        }
        Returns: string
      }
      create_current_context: {
        Args: {
          p_created_via?: Database["public"]["Enums"]["life_model_provenance"]
          p_expected_end_end?: string
          p_expected_end_start?: string
          p_life_area_id: string
          p_planning_impact: string
          p_source_proposal_id?: string
          p_started_on: string
          p_title: string
        }
        Returns: string
      }
      create_day_correction: {
        Args: {
          p_correction_type: Database["public"]["Enums"]["day_correction_type"]
          p_details?: string
          p_duration_minutes?: number
          p_local_date: string
          p_occurred_time?: string
          p_title?: string
        }
        Returns: string
      }
      create_goal: {
        Args: {
          p_created_via?: Database["public"]["Enums"]["life_model_provenance"]
          p_desired_outcome: string
          p_life_area_id: string
          p_source_proposal_id?: string
          p_status?: Database["public"]["Enums"]["goal_status"]
          p_target_confidence?: Database["public"]["Enums"]["life_target_confidence"]
          p_target_end_date?: string
          p_target_start_date?: string
          p_title: string
        }
        Returns: string
      }
      create_life_area: {
        Args: {
          p_created_via?: Database["public"]["Enums"]["life_model_provenance"]
          p_name: string
          p_sort_order?: number
        }
        Returns: string
      }
      create_life_evidence: {
        Args: {
          p_created_via?: Database["public"]["Enums"]["life_model_provenance"]
          p_goal_id?: string
          p_life_area_id: string
          p_occurred_on: string
          p_project_id?: string
          p_signal?: Database["public"]["Enums"]["life_evidence_signal"]
          p_source_calendar_occurrence_id?: string
          p_source_daily_action_id?: string
          p_source_day_correction_id?: string
          p_source_proposal_id?: string
          p_summary: string
        }
        Returns: string
      }
      create_project: {
        Args: {
          p_created_via?: Database["public"]["Enums"]["life_model_provenance"]
          p_desired_outcome: string
          p_goal_id?: string
          p_life_area_id: string
          p_parent_project_id?: string
          p_source_proposal_id?: string
          p_status?: Database["public"]["Enums"]["project_status"]
          p_target_confidence?: Database["public"]["Enums"]["life_target_confidence"]
          p_target_end_date?: string
          p_target_start_date?: string
          p_title: string
        }
        Returns: string
      }
      create_routine: {
        Args: {
          p_cadence: Database["public"]["Enums"]["routine_cadence"]
          p_cadence_count?: number
          p_created_via?: Database["public"]["Enums"]["life_model_provenance"]
          p_estimated_minutes: number
          p_goal_id?: string
          p_life_area_id: string
          p_preferred_time?: string
          p_project_id?: string
          p_skip_policy?: Database["public"]["Enums"]["routine_skip_policy"]
          p_source_proposal_id?: string
          p_status?: Database["public"]["Enums"]["routine_status"]
          p_title: string
          p_weekdays?: number[]
        }
        Returns: string
      }
      delete_action_note: {
        Args: { p_action_note_id: string }
        Returns: string
      }
      delete_calendar_commitment: {
        Args: { p_calendar_commitment_id: string }
        Returns: undefined
      }
      delete_completed_plan_evidence: {
        Args: { p_daily_action_id: string }
        Returns: undefined
      }
      delete_day_correction: {
        Args: { p_day_correction_id: string }
        Returns: undefined
      }
      disable_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      end_current_context: {
        Args: { p_current_context_id: string; p_ended_on?: string }
        Returns: undefined
      }
      finish_day: {
        Args: { p_daily_plan_id: string; p_notes?: string }
        Returns: string
      }
      get_calendar_commitments_for_date: {
        Args: { p_local_date: string }
        Returns: Json
      }
      get_current_overnight_state: { Args: never; Returns: Json }
      get_day_corrections_for_date: {
        Args: { p_local_date: string }
        Returns: Json
      }
      get_historical_daily_action_outcomes_for_date: {
        Args: { p_local_date: string }
        Returns: Json
      }
      get_latest_return_gap_record: { Args: never; Returns: Json }
      get_life_model: { Args: never; Returns: Json }
      get_return_backlog_state: { Args: never; Returns: Json }
      is_push_subscription_enabled: {
        Args: { p_endpoint: string }
        Returns: boolean
      }
      is_valid_timezone: { Args: { p_timezone: string }; Returns: boolean }
      log_action_note: {
        Args: { p_daily_action_id: string; p_note: string }
        Returns: string
      }
      materialize_notification_deliveries: {
        Args: { p_now?: string }
        Returns: number
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
      record_calendar_event_outcome: {
        Args: {
          p_calendar_commitment_id: string
          p_new_date?: string
          p_new_time?: string
          p_occurrence_date: string
          p_outcome: Database["public"]["Enums"]["calendar_event_outcome"]
          p_outcome_note?: string
        }
        Returns: string
      }
      record_goal_decision: {
        Args: {
          p_consequence_summary?: string
          p_created_via?: Database["public"]["Enums"]["life_model_provenance"]
          p_decided_at?: string
          p_decision_type: Database["public"]["Enums"]["goal_decision_type"]
          p_evidence_summary?: string
          p_goal_id: string
          p_rationale: string
          p_replacement_goal_id?: string
          p_source_proposal_id?: string
        }
        Returns: string
      }
      record_historical_day: {
        Args: {
          p_explanation?: string
          p_local_date: string
          p_skipped?: boolean
        }
        Returns: string
      }
      record_notification_delivery_failure: {
        Args: {
          p_delivery_id: string
          p_disable_subscription?: boolean
          p_error_code: string
          p_now?: string
          p_retry_at?: string
        }
        Returns: Database["public"]["Enums"]["notification_delivery_status"]
      }
      record_notification_delivery_success: {
        Args: { p_delivery_id: string; p_now?: string }
        Returns: boolean
      }
      record_return_boundary_v1: {
        Args: {
          p_boundary_kind: string
          p_range_end_date: string
          p_range_start_date: string
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
      record_return_gap_v3: {
        Args: {
          p_context_summary?: string
          p_gap_end_date: string
          p_gap_start_date: string
          p_nothing_important?: boolean
        }
        Returns: string
      }
      record_sleep_attempt: { Args: never; Returns: string }
      register_push_subscription: {
        Args: {
          p_auth_key: string
          p_endpoint: string
          p_expiration_time?: string
          p_p256dh_key: string
          p_user_agent?: string
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
      rename_life_area: {
        Args: { p_life_area_id: string; p_name: string }
        Returns: undefined
      }
      reorder_life_areas: {
        Args: { p_ordered_life_area_ids: string[] }
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
      report_overnight_outcome: {
        Args: { p_outcome: string }
        Returns: undefined
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
      restore_action_to_today: {
        Args: { p_daily_action_id: string }
        Returns: undefined
      }
      restore_removed_proposed_actions: {
        Args: { p_daily_plan_id: string }
        Returns: number
      }
      revalidate_notification_delivery: {
        Args: { p_delivery_id: string; p_now?: string }
        Returns: Json
      }
      save_action_assistant_exchange: {
        Args: {
          p_daily_action_id: string
          p_question: string
          p_response: string
        }
        Returns: undefined
      }
      save_context_only_proposed_plan: {
        Args: {
          p_actions: Json
          p_context_for_today: string
          p_focus: string
          p_local_date: string
        }
        Returns: string
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
      save_proposed_plan_with_optional_wake: {
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
      set_calendar_commitment_life_relationships: {
        Args: {
          p_calendar_commitment_id: string
          p_current_context_id?: string
          p_goal_id?: string
          p_life_area_id?: string
          p_project_id?: string
          p_relationship_source?: Database["public"]["Enums"]["life_model_provenance"]
        }
        Returns: undefined
      }
      set_daily_action_life_relationships: {
        Args: {
          p_current_context_ids?: string[]
          p_daily_action_id: string
          p_goal_id?: string
          p_life_area_id?: string
          p_project_id?: string
          p_relationship_source?: Database["public"]["Enums"]["life_model_provenance"]
          p_source_calendar_commitment_id?: string
          p_source_routine_id?: string
        }
        Returns: undefined
      }
      set_life_area_current_state: {
        Args: {
          p_as_of_date: string
          p_created_via?: Database["public"]["Enums"]["life_model_provenance"]
          p_life_area_id: string
          p_source_proposal_id?: string
          p_summary: string
        }
        Returns: undefined
      }
      start_current_day: { Args: never; Returns: string }
      start_current_day_v2: { Args: never; Returns: Json }
      transition_goal_status: {
        Args: {
          p_consequence_summary?: string
          p_created_via?: Database["public"]["Enums"]["life_model_provenance"]
          p_decided_at?: string
          p_evidence_summary?: string
          p_goal_id: string
          p_new_status: Database["public"]["Enums"]["goal_status"]
          p_rationale?: string
          p_replacement_goal_id?: string
          p_source_proposal_id?: string
        }
        Returns: string
      }
      transition_project_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["project_status"]
          p_project_id: string
        }
        Returns: undefined
      }
      transition_routine_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["routine_status"]
          p_routine_id: string
        }
        Returns: undefined
      }
      undo_calendar_event_completion: {
        Args: { p_calendar_commitment_id: string; p_occurrence_date: string }
        Returns: string
      }
      undo_day_close: { Args: { p_daily_plan_id: string }; Returns: undefined }
      update_calendar_commitment: {
        Args: {
          p_calendar_commitment_id: string
          p_commitment_type: Database["public"]["Enums"]["calendar_commitment_type"]
          p_deadline_due_time?: string
          p_details?: string
          p_duration_minutes?: number
          p_event_start_time?: string
          p_local_date: string
          p_recurrence?: Database["public"]["Enums"]["calendar_recurrence_preset"]
          p_recurrence_interval?: number
          p_recurrence_unit?: Database["public"]["Enums"]["calendar_recurrence_unit"]
          p_recurrence_weekdays?: number[]
          p_reminder_offsets_minutes?: number[]
          p_title: string
        }
        Returns: string
      }
      update_completed_plan_evidence: {
        Args: {
          p_completed_time?: string
          p_daily_action_id: string
          p_title: string
        }
        Returns: undefined
      }
      update_current_context: {
        Args: {
          p_current_context_id: string
          p_expected_end_end?: string
          p_expected_end_start?: string
          p_planning_impact: string
          p_started_on: string
          p_title: string
        }
        Returns: undefined
      }
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
      update_day_correction: {
        Args: {
          p_correction_type: Database["public"]["Enums"]["day_correction_type"]
          p_day_correction_id: string
          p_details?: string
          p_duration_minutes?: number
          p_occurred_time?: string
          p_title?: string
        }
        Returns: undefined
      }
      update_goal: {
        Args: {
          p_desired_outcome: string
          p_goal_id: string
          p_target_confidence?: Database["public"]["Enums"]["life_target_confidence"]
          p_target_end_date?: string
          p_target_start_date?: string
          p_title: string
        }
        Returns: undefined
      }
      update_project: {
        Args: {
          p_desired_outcome: string
          p_goal_id?: string
          p_parent_project_id?: string
          p_project_id: string
          p_target_confidence?: Database["public"]["Enums"]["life_target_confidence"]
          p_target_end_date?: string
          p_target_start_date?: string
          p_title: string
        }
        Returns: undefined
      }
      update_routine: {
        Args: {
          p_cadence: Database["public"]["Enums"]["routine_cadence"]
          p_cadence_count?: number
          p_estimated_minutes: number
          p_goal_id?: string
          p_preferred_time?: string
          p_project_id?: string
          p_routine_id: string
          p_skip_policy?: Database["public"]["Enums"]["routine_skip_policy"]
          p_title: string
          p_weekdays?: number[]
        }
        Returns: undefined
      }
    }
    Enums: {
      action_assistant_role: "user" | "assistant"
      calendar_commitment_status:
        | "scheduled"
        | "completed"
        | "missed"
        | "cancelled"
      calendar_commitment_type: "event" | "deadline"
      calendar_event_outcome:
        | "attended"
        | "missed"
        | "cancelled"
        | "rescheduled"
      calendar_recurrence_preset:
        | "none"
        | "daily"
        | "weekly"
        | "fortnightly"
        | "monthly"
        | "yearly"
      calendar_recurrence_unit: "day" | "week" | "month" | "year"
      current_context_status: "active" | "ended"
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
      day_correction_type: "completed_item" | "historical_event" | "day_note"
      goal_decision_type:
        | "explored"
        | "committed"
        | "changed"
        | "achieved"
        | "abandoned"
        | "replaced"
      goal_status: "exploring" | "active" | "achieved" | "abandoned"
      life_area_status: "active" | "archived"
      life_evidence_signal: "supports" | "challenges" | "neutral"
      life_model_provenance: "user_stated" | "ai_confirmed" | "system_derived"
      life_target_confidence: "estimated" | "aspirational"
      notification_delivery_status:
        | "pending"
        | "processing"
        | "retry"
        | "sent"
        | "failed"
        | "cancelled"
      project_status:
        | "planned"
        | "active"
        | "paused"
        | "completed"
        | "cancelled"
      routine_cadence: "daily" | "weekly" | "times_per_week" | "certain_days"
      routine_skip_policy: "skip" | "offer_makeup"
      routine_status: "active" | "paused" | "ended"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      action_assistant_role: ["user", "assistant"],
      calendar_commitment_status: [
        "scheduled",
        "completed",
        "missed",
        "cancelled",
      ],
      calendar_commitment_type: ["event", "deadline"],
      calendar_event_outcome: [
        "attended",
        "missed",
        "cancelled",
        "rescheduled",
      ],
      calendar_recurrence_preset: [
        "none",
        "daily",
        "weekly",
        "fortnightly",
        "monthly",
        "yearly",
      ],
      calendar_recurrence_unit: ["day", "week", "month", "year"],
      current_context_status: ["active", "ended"],
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
      day_correction_type: ["completed_item", "historical_event", "day_note"],
      goal_decision_type: [
        "explored",
        "committed",
        "changed",
        "achieved",
        "abandoned",
        "replaced",
      ],
      goal_status: ["exploring", "active", "achieved", "abandoned"],
      life_area_status: ["active", "archived"],
      life_evidence_signal: ["supports", "challenges", "neutral"],
      life_model_provenance: ["user_stated", "ai_confirmed", "system_derived"],
      life_target_confidence: ["estimated", "aspirational"],
      notification_delivery_status: [
        "pending",
        "processing",
        "retry",
        "sent",
        "failed",
        "cancelled",
      ],
      project_status: ["planned", "active", "paused", "completed", "cancelled"],
      routine_cadence: ["daily", "weekly", "times_per_week", "certain_days"],
      routine_skip_policy: ["skip", "offer_makeup"],
      routine_status: ["active", "paused", "ended"],
    },
  },
} as const

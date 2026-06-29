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
      analysis_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          input: Json
          result: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          input: Json
          result?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json
          result?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plot_units_cache: {
        Row: {
          building_count: number | null
          built_area: number | null
          built_area_confidence: string | null
          built_area_source: string | null
          confidence: string | null
          created_at: string
          existing_floors: number | null
          existing_units: number
          gush: number
          helka: number
          id: string
          last_refreshed_at: string
          notes: string | null
          source: string
          sources_json: Json | null
          total_floor_area: number | null
          updated_at: string
        }
        Insert: {
          building_count?: number | null
          built_area?: number | null
          built_area_confidence?: string | null
          built_area_source?: string | null
          confidence?: string | null
          created_at?: string
          existing_floors?: number | null
          existing_units: number
          gush: number
          helka: number
          id?: string
          last_refreshed_at?: string
          notes?: string | null
          source?: string
          sources_json?: Json | null
          total_floor_area?: number | null
          updated_at?: string
        }
        Update: {
          building_count?: number | null
          built_area?: number | null
          built_area_confidence?: string | null
          built_area_source?: string | null
          confidence?: string | null
          created_at?: string
          existing_floors?: number | null
          existing_units?: number
          gush?: number
          helka?: number
          id?: string
          last_refreshed_at?: string
          notes?: string | null
          source?: string
          sources_json?: Json | null
          total_floor_area?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      zoning_rights: {
        Row: {
          classification_note: string | null
          coverage_pct: number | null
          created_at: string
          density_coefficient_sqm_per_unit: number | null
          id: string
          location_filter: Json
          max_coverage_pct: number | null
          max_far: number | null
          max_floors_above: number | null
          max_floors_roof: number | null
          min_unit_size_sqm: number | null
          notes: string | null
          pinui_far_bonus: number | null
          pinui_units_bonus_pct: number | null
          plan_code: string
          quarter: number
          requires_manual_classification: boolean
          rights_basis: string | null
          rova_plan_far_bonus: number | null
          service_area_ratio_pct: number | null
          setback_front_m: number | null
          setback_rear_m: number | null
          setback_side_m: number | null
          source_citation: string | null
          tama38_far_bonus: number | null
          tama38_units_bonus_pct: number | null
          updated_at: string
          zone_label: string
        }
        Insert: {
          classification_note?: string | null
          coverage_pct?: number | null
          created_at?: string
          density_coefficient_sqm_per_unit?: number | null
          id?: string
          location_filter?: Json
          max_coverage_pct?: number | null
          max_far?: number | null
          max_floors_above?: number | null
          max_floors_roof?: number | null
          min_unit_size_sqm?: number | null
          notes?: string | null
          pinui_far_bonus?: number | null
          pinui_units_bonus_pct?: number | null
          plan_code: string
          quarter: number
          requires_manual_classification?: boolean
          rights_basis?: string | null
          rova_plan_far_bonus?: number | null
          service_area_ratio_pct?: number | null
          setback_front_m?: number | null
          setback_rear_m?: number | null
          setback_side_m?: number | null
          source_citation?: string | null
          tama38_far_bonus?: number | null
          tama38_units_bonus_pct?: number | null
          updated_at?: string
          zone_label: string
        }
        Update: {
          classification_note?: string | null
          coverage_pct?: number | null
          created_at?: string
          density_coefficient_sqm_per_unit?: number | null
          id?: string
          location_filter?: Json
          max_coverage_pct?: number | null
          max_far?: number | null
          max_floors_above?: number | null
          max_floors_roof?: number | null
          min_unit_size_sqm?: number | null
          notes?: string | null
          pinui_far_bonus?: number | null
          pinui_units_bonus_pct?: number | null
          plan_code?: string
          quarter?: number
          requires_manual_classification?: boolean
          rights_basis?: string | null
          rova_plan_far_bonus?: number | null
          service_area_ratio_pct?: number | null
          setback_front_m?: number | null
          setback_rear_m?: number | null
          setback_side_m?: number | null
          source_citation?: string | null
          tama38_far_bonus?: number | null
          tama38_units_bonus_pct?: number | null
          updated_at?: string
          zone_label?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

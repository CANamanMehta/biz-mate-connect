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
      activity_log: {
        Row: {
          action: string
          actor_partner_id: string | null
          created_at: string
          detail: string | null
          id: string
          opportunity_id: string | null
          organisation_id: string | null
          updated_at: string
        }
        Insert: {
          action: string
          actor_partner_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          opportunity_id?: string | null
          organisation_id?: string | null
          updated_at?: string
        }
        Update: {
          action?: string
          actor_partner_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          opportunity_id?: string | null
          organisation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_partner_id_fkey"
            columns: ["actor_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      branches: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          created_by: string | null
          designation: string | null
          email: string | null
          id: string
          is_decision_maker: boolean
          is_referrer: boolean
          name: string
          notes: string | null
          organisation_id: string
          phone: string | null
          role: Database["public"]["Enums"]["contact_role"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_decision_maker?: boolean
          is_referrer?: boolean
          name: string
          notes?: string | null
          organisation_id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["contact_role"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_decision_maker?: boolean
          is_referrer?: boolean
          name?: string
          notes?: string | null
          organisation_id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["contact_role"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_sell_rules: {
        Row: {
          active: boolean
          created_at: string
          from_service_line_id: string
          id: string
          reason: string | null
          to_service_line_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          from_service_line_id: string
          id?: string
          reason?: string | null
          to_service_line_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          from_service_line_id?: string
          id?: string
          reason?: string | null
          to_service_line_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cross_sell_rules_from_service_line_id_fkey"
            columns: ["from_service_line_id"]
            isOneToOne: false
            referencedRelation: "service_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_sell_rules_to_service_line_id_fkey"
            columns: ["to_service_line_id"]
            isOneToOne: false
            referencedRelation: "service_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_sell_suggestions: {
        Row: {
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          dismissed_reason: string | null
          id: string
          opportunity_id: string | null
          organisation_id: string
          pursued_by: string | null
          reason: string | null
          service_line_id: string
          snoozed_until: string | null
          status: Database["public"]["Enums"]["cross_sell_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          dismissed_reason?: string | null
          id?: string
          opportunity_id?: string | null
          organisation_id: string
          pursued_by?: string | null
          reason?: string | null
          service_line_id: string
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["cross_sell_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          dismissed_reason?: string | null
          id?: string
          opportunity_id?: string | null
          organisation_id?: string
          pursued_by?: string | null
          reason?: string | null
          service_line_id?: string
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["cross_sell_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cross_sell_suggestions_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_sell_suggestions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_sell_suggestions_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_sell_suggestions_pursued_by_fkey"
            columns: ["pursued_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_sell_suggestions_service_line_id_fkey"
            columns: ["service_line_id"]
            isOneToOne: false
            referencedRelation: "service_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          doc_type: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_path: string
          id: string
          notes: string | null
          opportunity_id: string | null
          organisation_id: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_path: string
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          organisation_id: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          file_name?: string
          file_path?: string
          id?: string
          notes?: string | null
          opportunity_id?: string | null
          organisation_id?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_costs: {
        Row: {
          amount_inr: number | null
          auto_from_meeting_id: string | null
          cost_type: Database["public"]["Enums"]["lead_cost_type"]
          created_at: string
          created_by: string | null
          effort_minutes: number | null
          id: string
          incurred_by_partner_id: string | null
          incurred_date: string
          note: string | null
          opportunity_id: string
          updated_at: string
        }
        Insert: {
          amount_inr?: number | null
          auto_from_meeting_id?: string | null
          cost_type: Database["public"]["Enums"]["lead_cost_type"]
          created_at?: string
          created_by?: string | null
          effort_minutes?: number | null
          id?: string
          incurred_by_partner_id?: string | null
          incurred_date: string
          note?: string | null
          opportunity_id: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number | null
          auto_from_meeting_id?: string | null
          cost_type?: Database["public"]["Enums"]["lead_cost_type"]
          created_at?: string
          created_by?: string | null
          effort_minutes?: number | null
          id?: string
          incurred_by_partner_id?: string | null
          incurred_date?: string
          note?: string | null
          opportunity_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_costs_auto_from_meeting_id_fkey"
            columns: ["auto_from_meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_costs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_costs_incurred_by_partner_id_fkey"
            columns: ["incurred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_costs_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          meeting_id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          meeting_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          meeting_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_contacts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_partners: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          partner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          partner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          partner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_partners_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string | null
          calendar_event_id: string | null
          commitments: string | null
          created_at: string
          created_by: string | null
          decisions: string | null
          duration_minutes: number | null
          id: string
          location_or_link: string | null
          meeting_date: string
          next_step: string
          next_step_date: string
          objections: string | null
          opportunity_id: string | null
          organisation_id: string
          outcome: string | null
          requirements_identified: string | null
          summary: string | null
          type: Database["public"]["Enums"]["interaction_type"]
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          calendar_event_id?: string | null
          commitments?: string | null
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          duration_minutes?: number | null
          id?: string
          location_or_link?: string | null
          meeting_date: string
          next_step: string
          next_step_date: string
          objections?: string | null
          opportunity_id?: string | null
          organisation_id: string
          outcome?: string | null
          requirements_identified?: string | null
          summary?: string | null
          type: Database["public"]["Enums"]["interaction_type"]
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          calendar_event_id?: string | null
          commitments?: string | null
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          duration_minutes?: number | null
          id?: string
          location_or_link?: string | null
          meeting_date?: string
          next_step?: string
          next_step_date?: string
          objections?: string | null
          opportunity_id?: string | null
          organisation_id?: string
          outcome?: string | null
          requirements_identified?: string | null
          summary?: string | null
          type?: Database["public"]["Enums"]["interaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          partner_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          partner_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          partner_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          acquired_by_partner_id: string | null
          acquisition_source:
            | Database["public"]["Enums"]["acquisition_source"]
            | null
          blockers: string | null
          competitors: string | null
          conflict_check_at: string | null
          conflict_check_by: string | null
          conflict_check_confirmed: boolean
          conflict_check_note: string | null
          converted_at: string | null
          created_at: string
          created_by: string | null
          engagement_start_date: string | null
          estimated_expenses: number
          estimated_gross_fee: number
          estimated_net_profit: number | null
          execution_mode: Database["public"]["Enums"]["execution_mode"] | null
          expected_close_date: string | null
          id: string
          is_recurring_engagement: boolean
          is_restricted: boolean
          last_activity_date: string | null
          lost_note: string | null
          lost_reason: Database["public"]["Enums"]["lost_reason"] | null
          next_action: string | null
          next_action_date: string | null
          on_hold_revisit_date: string | null
          organisation_id: string
          owner_partner_id: string
          probability: number
          referral_contact_id: string | null
          renewal_of_opportunity_id: string | null
          requirements: string | null
          research_due_date: string | null
          research_status: Database["public"]["Enums"]["research_status"]
          sharing_template: string | null
          stage: Database["public"]["Enums"]["opportunity_stage"]
          stage_changed_at: string
          status: Database["public"]["Enums"]["opportunity_status"]
          target_rationale: string | null
          title: string
          updated_at: string
          urgency: Database["public"]["Enums"]["enquiry_urgency"]
        }
        Insert: {
          acquired_by_partner_id?: string | null
          acquisition_source?:
            | Database["public"]["Enums"]["acquisition_source"]
            | null
          blockers?: string | null
          competitors?: string | null
          conflict_check_at?: string | null
          conflict_check_by?: string | null
          conflict_check_confirmed?: boolean
          conflict_check_note?: string | null
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          engagement_start_date?: string | null
          estimated_expenses?: number
          estimated_gross_fee?: number
          estimated_net_profit?: number | null
          execution_mode?: Database["public"]["Enums"]["execution_mode"] | null
          expected_close_date?: string | null
          id?: string
          is_recurring_engagement?: boolean
          is_restricted?: boolean
          last_activity_date?: string | null
          lost_note?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          next_action?: string | null
          next_action_date?: string | null
          on_hold_revisit_date?: string | null
          organisation_id: string
          owner_partner_id: string
          probability?: number
          referral_contact_id?: string | null
          renewal_of_opportunity_id?: string | null
          requirements?: string | null
          research_due_date?: string | null
          research_status?: Database["public"]["Enums"]["research_status"]
          sharing_template?: string | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          stage_changed_at?: string
          status?: Database["public"]["Enums"]["opportunity_status"]
          target_rationale?: string | null
          title: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["enquiry_urgency"]
        }
        Update: {
          acquired_by_partner_id?: string | null
          acquisition_source?:
            | Database["public"]["Enums"]["acquisition_source"]
            | null
          blockers?: string | null
          competitors?: string | null
          conflict_check_at?: string | null
          conflict_check_by?: string | null
          conflict_check_confirmed?: boolean
          conflict_check_note?: string | null
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          engagement_start_date?: string | null
          estimated_expenses?: number
          estimated_gross_fee?: number
          estimated_net_profit?: number | null
          execution_mode?: Database["public"]["Enums"]["execution_mode"] | null
          expected_close_date?: string | null
          id?: string
          is_recurring_engagement?: boolean
          is_restricted?: boolean
          last_activity_date?: string | null
          lost_note?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          next_action?: string | null
          next_action_date?: string | null
          on_hold_revisit_date?: string | null
          organisation_id?: string
          owner_partner_id?: string
          probability?: number
          referral_contact_id?: string | null
          renewal_of_opportunity_id?: string | null
          requirements?: string | null
          research_due_date?: string | null
          research_status?: Database["public"]["Enums"]["research_status"]
          sharing_template?: string | null
          stage?: Database["public"]["Enums"]["opportunity_stage"]
          stage_changed_at?: string
          status?: Database["public"]["Enums"]["opportunity_status"]
          target_rationale?: string | null
          title?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["enquiry_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_acquired_by_partner_id_fkey"
            columns: ["acquired_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_conflict_check_by_fkey"
            columns: ["conflict_check_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_partner_id_fkey"
            columns: ["owner_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_referral_contact_id_fkey"
            columns: ["referral_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_renewal_of_opportunity_id_fkey"
            columns: ["renewal_of_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_collaborators: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          opportunity_id: string
          partner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id: string
          partner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id?: string
          partner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_collaborators_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_collaborators_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_collaborators_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_service_lines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          opportunity_id: string
          service_line_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id: string
          service_line_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id?: string
          service_line_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_service_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_service_lines_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_service_lines_service_line_id_fkey"
            columns: ["service_line_id"]
            isOneToOne: false
            referencedRelation: "service_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_services: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organisation_id: string
          service_line_id: string
          status: Database["public"]["Enums"]["organisation_service_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id: string
          service_line_id: string
          status: Database["public"]["Enums"]["organisation_service_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organisation_id?: string
          service_line_id?: string
          status?: Database["public"]["Enums"]["organisation_service_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_services_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_services_service_line_id_fkey"
            columns: ["service_line_id"]
            isOneToOne: false
            referencedRelation: "service_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          group_parent: string | null
          home_branch: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          phone: string | null
          relationship_owner_branch: string | null
          relationship_owner_partner_id: string | null
          relationship_owner_type:
            | Database["public"]["Enums"]["relationship_owner_type"]
            | null
          size_band: string | null
          status: Database["public"]["Enums"]["organisation_status"]
          updated_at: string
          website: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          group_parent?: string | null
          home_branch?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          relationship_owner_branch?: string | null
          relationship_owner_partner_id?: string | null
          relationship_owner_type?:
            | Database["public"]["Enums"]["relationship_owner_type"]
            | null
          size_band?: string | null
          status?: Database["public"]["Enums"]["organisation_status"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          group_parent?: string | null
          home_branch?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          relationship_owner_branch?: string | null
          relationship_owner_partner_id?: string | null
          relationship_owner_type?:
            | Database["public"]["Enums"]["relationship_owner_type"]
            | null
          size_band?: string | null
          status?: Database["public"]["Enums"]["organisation_status"]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organisations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisations_relationship_owner_partner_id_fkey"
            columns: ["relationship_owner_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          active: boolean
          branch: string
          created_at: string
          email: string
          id: string
          is_managing_partner: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          branch: string
          created_at?: string
          email: string
          id?: string
          is_managing_partner?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          branch?: string
          created_at?: string
          email?: string
          id?: string
          is_managing_partner?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      revenue_allocations: {
        Row: {
          base: Database["public"]["Enums"]["allocation_base"]
          beneficiary_branch: string | null
          beneficiary_partner_id: string | null
          beneficiary_type: Database["public"]["Enums"]["beneficiary_type"]
          component: Database["public"]["Enums"]["allocation_component"]
          computed_amount: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          opportunity_id: string
          share_pct: number
          updated_at: string
        }
        Insert: {
          base: Database["public"]["Enums"]["allocation_base"]
          beneficiary_branch?: string | null
          beneficiary_partner_id?: string | null
          beneficiary_type: Database["public"]["Enums"]["beneficiary_type"]
          component: Database["public"]["Enums"]["allocation_component"]
          computed_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          opportunity_id: string
          share_pct: number
          updated_at?: string
        }
        Update: {
          base?: Database["public"]["Enums"]["allocation_base"]
          beneficiary_branch?: string | null
          beneficiary_partner_id?: string | null
          beneficiary_type?: Database["public"]["Enums"]["beneficiary_type"]
          component?: Database["public"]["Enums"]["allocation_component"]
          computed_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          opportunity_id?: string
          share_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_allocations_beneficiary_partner_id_fkey"
            columns: ["beneficiary_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_allocations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      service_lines: {
        Row: {
          active: boolean
          cluster: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cluster?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cluster?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sharing_templates: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          rows: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          rows?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          rows?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          escalated: boolean
          id: string
          is_recurring: boolean
          meeting_id: string | null
          opportunity_id: string | null
          organisation_id: string | null
          owner_partner_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          recurrence_days: number | null
          source: Database["public"]["Enums"]["task_source"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          escalated?: boolean
          id?: string
          is_recurring?: boolean
          meeting_id?: string | null
          opportunity_id?: string | null
          organisation_id?: string | null
          owner_partner_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_days?: number | null
          source?: Database["public"]["Enums"]["task_source"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          escalated?: boolean
          id?: string
          is_recurring?: boolean
          meeting_id?: string | null
          opportunity_id?: string | null
          organisation_id?: string | null
          owner_partner_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          recurrence_days?: number | null
          source?: Database["public"]["Enums"]["task_source"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_partner_id_fkey"
            columns: ["owner_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          partner_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_task: {
        Args: {
          _due_date: string
          _opportunity_id?: string
          _owner_partner_id?: string
          _title: string
        }
        Returns: string
      }
      apply_sharing_template: {
        Args: { _opportunity_id: string; _rows: Json; _template_name: string }
        Returns: undefined
      }
      can_access_opportunity: {
        Args: { _opportunity_id: string }
        Returns: boolean
      }
      can_edit_opportunity: {
        Args: { _opportunity_id: string }
        Returns: boolean
      }
      complete_task: {
        Args: { _next_due?: string; _next_title?: string; _task_id: string }
        Returns: {
          next_task_id: string
          opportunity_id: string
          recurring_task_id: string
        }[]
      }
      convert_opportunity: {
        Args: {
          _conflict_confirmed: boolean
          _conflict_note: string
          _final_expenses: number
          _final_fee: number
          _opportunity_id: string
          _override_reason?: string
          _recurring: boolean
          _relationship_owner_partner_id: string
          _service_line_ids: string[]
          _start_date: string
        }
        Returns: string
      }
      create_cross_sell_opportunity: {
        Args: {
          _organisation_id: string
          _service_line_id: string
          _suggestion_id?: string
        }
        Returns: string
      }
      create_enquiry: {
        Args: {
          _acquired_by_partner_id?: string
          _acquisition_source: Database["public"]["Enums"]["acquisition_source"]
          _city?: string
          _contact_name: string
          _email?: string
          _estimated_gross_fee?: number
          _expected_close_date?: string
          _industry?: string
          _notes?: string
          _organisation_id?: string
          _organisation_name: string
          _owner_partner_id: string
          _phone?: string
          _referral_contact_id?: string
          _service_line_ids: string[]
          _urgency?: Database["public"]["Enums"]["enquiry_urgency"]
        }
        Returns: {
          contact_id: string
          opportunity_id: string
          organisation_id: string
        }[]
      }
      create_target: {
        Args: {
          _city?: string
          _industry?: string
          _organisation_id?: string
          _organisation_name: string
          _owner_partner_id: string
          _research_due_date?: string
          _service_line_ids?: string[]
          _target_rationale?: string
        }
        Returns: string
      }
      cross_sell_report: {
        Args: never
        Returns: {
          converted: number
          created: number
          partner_id: string
          partner_name: string
          pursued: number
        }[]
      }
      current_partner_id: { Args: never; Returns: string }
      dismiss_cross_sell: {
        Args: { _reason: string; _suggestion_id: string }
        Returns: undefined
      }
      find_enquiry_duplicates: {
        Args: { _email?: string; _name: string; _phone?: string }
        Returns: {
          has_other_owner_open_pursuit: boolean
          organisation_id: string
          organisation_name: string
          owner_name: string
          stage: Database["public"]["Enums"]["opportunity_stage"]
        }[]
      }
      generate_cross_sell_all: { Args: never; Returns: number }
      generate_cross_sell_for_org: {
        Args: { _organisation_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_partner: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      link_current_partner: {
        Args: never
        Returns: {
          partner_id: string
          partner_name: string
          partner_role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      log_app_install: { Args: { _device: string }; Returns: undefined }
      log_interaction: {
        Args: {
          _agenda?: string
          _commitments?: string
          _contact_ids?: string[]
          _decisions?: string
          _duration_minutes?: number
          _estimated_expenses?: number
          _estimated_gross_fee?: number
          _first_meeting?: boolean
          _meeting_date: string
          _next_step: string
          _next_step_date: string
          _objections?: string
          _opportunity_id?: string
          _organisation_id: string
          _outcome?: string
          _outcome_date?: string
          _outcome_reason?: string
          _partner_ids?: string[]
          _requirements?: string
          _summary?: string
          _type: Database["public"]["Enums"]["interaction_type"]
        }
        Returns: {
          meeting_id: string
          suggest_discovery: boolean
        }[]
      }
      mark_service_not_relevant: {
        Args: { _organisation_id: string; _service_line_id: string }
        Returns: undefined
      }
      move_opportunity_stage: {
        Args: {
          _opportunity_id: string
          _probability: number
          _stage: Database["public"]["Enums"]["opportunity_stage"]
        }
        Returns: undefined
      }
      normalise_business_name: { Args: { _value: string }; Returns: string }
      restricted_pursuit_notices: {
        Args: never
        Returns: {
          notice: string
          organisation_id: string
          owner_name: string
        }[]
      }
      run_daily_automations: { Args: never; Returns: Json }
      run_daily_automations_now: { Args: never; Returns: Json }
      search_crm: {
        Args: { _query: string }
        Returns: {
          organisation_id: string
          result_id: string
          result_type: string
          subtitle: string
          title: string
        }[]
      }
      set_opportunity_probability: {
        Args: { _opportunity_id: string; _probability: number }
        Returns: undefined
      }
      set_opportunity_status: {
        Args: {
          _action: string
          _lost_reason?: Database["public"]["Enums"]["lost_reason"]
          _note?: string
          _opportunity_id: string
          _revisit_date?: string
        }
        Returns: undefined
      }
      set_organisation_service_status: {
        Args: {
          _organisation_id: string
          _service_line_id: string
          _status: string
        }
        Returns: undefined
      }
      set_relationship_owner_from_opportunity: {
        Args: {
          _branch?: string
          _opportunity_id: string
          _partner_id?: string
          _type: Database["public"]["Enums"]["relationship_owner_type"]
        }
        Returns: undefined
      }
      snooze_cross_sell: {
        Args: { _suggestion_id: string; _until: string }
        Returns: undefined
      }
      undo_conversion: {
        Args: { _opportunity_id: string; _reason: string }
        Returns: undefined
      }
      update_enquiry_stage: {
        Args: { _action: string; _opportunity_id: string; _reason?: string }
        Returns: undefined
      }
      update_task: {
        Args: {
          _due_date?: string
          _owner_partner_id?: string
          _task_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      acquisition_source:
        | "managing_partner"
        | "partner_self"
        | "branch"
        | "external_referral"
        | "existing_client"
        | "website"
        | "event"
        | "walk_in"
        | "cold_outreach"
        | "social"
        | "outbound_research"
      allocation_base: "gross" | "net"
      allocation_component:
        | "firm_base"
        | "referral_acquisition"
        | "execution"
        | "branch_profit_share"
        | "custom"
      app_role: "partner" | "admin"
      beneficiary_type: "firm_mp" | "partner" | "branch" | "ho"
      contact_role:
        | "promoter"
        | "director"
        | "CFO"
        | "CS"
        | "finance_head"
        | "influencer"
        | "gatekeeper"
        | "other"
      cross_sell_status: "suggested" | "pursued" | "dismissed"
      document_type:
        | "research_report"
        | "proposal"
        | "engagement_letter"
        | "nda"
        | "other"
      enquiry_urgency: "low" | "medium" | "high"
      execution_mode:
        | "solo"
        | "collaboration"
        | "ho_executed"
        | "branch_executed"
        | "split_ho_branch"
      interaction_type: "meeting" | "call" | "email" | "whatsapp" | "note"
      lead_cost_type: "partner_time" | "travel" | "proposal_prep" | "other"
      lost_reason:
        | "price"
        | "competitor"
        | "no_budget"
        | "no_decision"
        | "in_house"
        | "timing"
        | "other"
      opportunity_stage:
        | "target"
        | "research"
        | "outreach"
        | "enquiry"
        | "first_meeting"
        | "qualified_lead"
        | "meeting_discovery"
        | "proposal"
        | "negotiation"
        | "converted"
      opportunity_status: "open" | "on_hold" | "lost" | "disqualified"
      organisation_service_status:
        | "engaged"
        | "past"
        | "pitched"
        | "not_relevant"
      organisation_status: "prospect" | "client" | "dormant"
      relationship_owner_type: "partner" | "branch" | "ho"
      research_status: "not_started" | "in_progress" | "done"
      task_priority: "low" | "medium" | "high"
      task_source:
        | "manual"
        | "from_meeting"
        | "stale_alert"
        | "conversion"
        | "cross_sell"
      task_status: "open" | "done" | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      acquisition_source: [
        "managing_partner",
        "partner_self",
        "branch",
        "external_referral",
        "existing_client",
        "website",
        "event",
        "walk_in",
        "cold_outreach",
        "social",
        "outbound_research",
      ],
      allocation_base: ["gross", "net"],
      allocation_component: [
        "firm_base",
        "referral_acquisition",
        "execution",
        "branch_profit_share",
        "custom",
      ],
      app_role: ["partner", "admin"],
      beneficiary_type: ["firm_mp", "partner", "branch", "ho"],
      contact_role: [
        "promoter",
        "director",
        "CFO",
        "CS",
        "finance_head",
        "influencer",
        "gatekeeper",
        "other",
      ],
      cross_sell_status: ["suggested", "pursued", "dismissed"],
      document_type: [
        "research_report",
        "proposal",
        "engagement_letter",
        "nda",
        "other",
      ],
      enquiry_urgency: ["low", "medium", "high"],
      execution_mode: [
        "solo",
        "collaboration",
        "ho_executed",
        "branch_executed",
        "split_ho_branch",
      ],
      interaction_type: ["meeting", "call", "email", "whatsapp", "note"],
      lead_cost_type: ["partner_time", "travel", "proposal_prep", "other"],
      lost_reason: [
        "price",
        "competitor",
        "no_budget",
        "no_decision",
        "in_house",
        "timing",
        "other",
      ],
      opportunity_stage: [
        "target",
        "research",
        "outreach",
        "enquiry",
        "first_meeting",
        "qualified_lead",
        "meeting_discovery",
        "proposal",
        "negotiation",
        "converted",
      ],
      opportunity_status: ["open", "on_hold", "lost", "disqualified"],
      organisation_service_status: [
        "engaged",
        "past",
        "pitched",
        "not_relevant",
      ],
      organisation_status: ["prospect", "client", "dormant"],
      relationship_owner_type: ["partner", "branch", "ho"],
      research_status: ["not_started", "in_progress", "done"],
      task_priority: ["low", "medium", "high"],
      task_source: [
        "manual",
        "from_meeting",
        "stale_alert",
        "conversion",
        "cross_sell",
      ],
      task_status: ["open", "done", "cancelled"],
    },
  },
} as const

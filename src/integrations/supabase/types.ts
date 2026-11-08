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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          id: string
          name: string
          org_id: string | null
          type: string
        }
        Insert: {
          balance?: number
          id?: string
          name: string
          org_id?: string | null
          type?: string
        }
        Update: {
          balance?: number
          id?: string
          name?: string
          org_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent: string
          created_at: string
          id: string
          input: Json | null
          latency_ms: number | null
          org_id: string | null
          output: Json | null
          tokens: number | null
        }
        Insert: {
          agent: string
          created_at?: string
          id?: string
          input?: Json | null
          latency_ms?: number | null
          org_id?: string | null
          output?: Json | null
          tokens?: number | null
        }
        Update: {
          agent?: string
          created_at?: string
          id?: string
          input?: Json | null
          latency_ms?: number | null
          org_id?: string | null
          output?: Json | null
          tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          activo: boolean
          categoria: Database["public"]["Enums"]["categoria_negocio"]
          cp: string | null
          created_at: string
          curp: string | null
          direccion: string | null
          estado_kyb: Database["public"]["Enums"]["estado_kyb"]
          horario: Json | null
          id: string
          lat: number | null
          lng: number | null
          nombre_comercial: string
          org_id: string
          razon_social: string | null
          recomendado: boolean
          rfc: string | null
          telefono: string | null
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          categoria?: Database["public"]["Enums"]["categoria_negocio"]
          cp?: string | null
          created_at?: string
          curp?: string | null
          direccion?: string | null
          estado_kyb?: Database["public"]["Enums"]["estado_kyb"]
          horario?: Json | null
          id?: string
          lat?: number | null
          lng?: number | null
          nombre_comercial: string
          org_id: string
          razon_social?: string | null
          recomendado?: boolean
          rfc?: string | null
          telefono?: string | null
          tipo_persona?: Database["public"]["Enums"]["tipo_persona"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          categoria?: Database["public"]["Enums"]["categoria_negocio"]
          cp?: string | null
          created_at?: string
          curp?: string | null
          direccion?: string | null
          estado_kyb?: Database["public"]["Enums"]["estado_kyb"]
          horario?: Json | null
          id?: string
          lat?: number | null
          lng?: number | null
          nombre_comercial?: string
          org_id?: string
          razon_social?: string | null
          recomendado?: boolean
          rfc?: string | null
          telefono?: string | null
          tipo_persona?: Database["public"]["Enums"]["tipo_persona"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          business_id: string
          cajero_id: string | null
          created_at: string
          customer_id: string | null
          descuento_puntos: number
          estado: Database["public"]["Enums"]["estado_cobro"]
          id: string
          idempotency_key: string
          monto: number
          org_id: string
          paid_at: string | null
          pey_charge_id: string | null
          tipo: Database["public"]["Enums"]["tipo_cobro"]
          updated_at: string
        }
        Insert: {
          business_id: string
          cajero_id?: string | null
          created_at?: string
          customer_id?: string | null
          descuento_puntos?: number
          estado?: Database["public"]["Enums"]["estado_cobro"]
          id?: string
          idempotency_key: string
          monto: number
          org_id: string
          paid_at?: string | null
          pey_charge_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_cobro"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          cajero_id?: string | null
          created_at?: string
          customer_id?: string | null
          descuento_puntos?: number
          estado?: Database["public"]["Enums"]["estado_cobro"]
          id?: string
          idempotency_key?: string
          monto?: number
          org_id?: string
          paid_at?: string | null
          pey_charge_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_cobro"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_cajero_id_fkey"
            columns: ["cajero_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
        }
        Insert: {
          client_id: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          client_id?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          balance_due: number
          created_at: string
          email: string | null
          id: string
          name: string
          org_id: string | null
          phone: string | null
          status: string
        }
        Insert: {
          balance_due?: number
          created_at?: string
          email?: string | null
          id?: string
          name: string
          org_id?: string | null
          phone?: string | null
          status?: string
        }
        Update: {
          balance_due?: number
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          org_id?: string | null
          phone?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string
          id: string
          nivel: Database["public"]["Enums"]["nivel_cliente"]
          nombre: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          nivel?: Database["public"]["Enums"]["nivel_cliente"]
          nombre?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nivel?: Database["public"]["Enums"]["nivel_cliente"]
          nombre?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          full_name: string
          hire_date: string
          id: string
          org_id: string | null
          position: string | null
          salary: number
          status: string
        }
        Insert: {
          full_name: string
          hire_date?: string
          id?: string
          org_id?: string | null
          position?: string | null
          salary?: number
          status?: string
        }
        Update: {
          full_name?: string
          hire_date?: string
          id?: string
          org_id?: string | null
          position?: string | null
          salary?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kyb_documents: {
        Row: {
          business_id: string
          created_at: string
          estado: Database["public"]["Enums"]["estado_documento"]
          id: string
          org_id: string
          storage_path: string
          tipo: Database["public"]["Enums"]["tipo_documento_kyb"]
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_documento"]
          id?: string
          org_id: string
          storage_path: string
          tipo: Database["public"]["Enums"]["tipo_documento_kyb"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_documento"]
          id?: string
          org_id?: string
          storage_path?: string
          tipo?: Database["public"]["Enums"]["tipo_documento_kyb"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyb_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyb_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kyb_reviews: {
        Row: {
          business_id: string
          created_at: string
          decision: Database["public"]["Enums"]["decision_kyb"]
          id: string
          notas: string | null
          org_id: string
          reviewer_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          decision: Database["public"]["Enums"]["decision_kyb"]
          id?: string
          notas?: string | null
          org_id: string
          reviewer_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          decision?: Database["public"]["Enums"]["decision_kyb"]
          id?: string
          notas?: string | null
          org_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyb_reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyb_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyb_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          employee_id: string
          end_date: string
          id: string
          start_date: string
          status: string
          type: string
        }
        Insert: {
          employee_id: string
          end_date: string
          id?: string
          start_date: string
          status?: string
          type?: string
        }
        Update: {
          employee_id?: string
          end_date?: string
          id?: string
          start_date?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country: string
          created_at: string
          currency_default: string
          id: string
          name: string
        }
        Insert: {
          country?: string
          created_at?: string
          currency_default?: string
          id?: string
          name: string
        }
        Update: {
          country?: string
          created_at?: string
          currency_default?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_fiat: number
          confirmed_at: string | null
          created_at: string
          currency_fiat: string
          error_message: string | null
          id: string
          org_id: string | null
          status: string
          submitted_at: string | null
          supplier_id: string
        }
        Insert: {
          amount_fiat: number
          confirmed_at?: string | null
          created_at?: string
          currency_fiat?: string
          error_message?: string | null
          id?: string
          org_id?: string | null
          status?: string
          submitted_at?: string | null
          supplier_id: string
        }
        Update: {
          amount_fiat?: number
          confirmed_at?: string | null
          created_at?: string
          currency_fiat?: string
          error_message?: string | null
          id?: string
          org_id?: string | null
          status?: string
          submitted_at?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pey_accounts: {
        Row: {
          business_id: string
          clabe_ultimos4: string | null
          created_at: string
          error_mensaje: string | null
          estado: Database["public"]["Enums"]["estado_cuenta_pey"]
          id: string
          org_id: string
          pey_api_key_ref: string | null
          pey_bank_account_id: string | null
          titular: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          clabe_ultimos4?: string | null
          created_at?: string
          error_mensaje?: string | null
          estado?: Database["public"]["Enums"]["estado_cuenta_pey"]
          id?: string
          org_id: string
          pey_api_key_ref?: string | null
          pey_bank_account_id?: string | null
          titular?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          clabe_ultimos4?: string | null
          created_at?: string
          error_mensaje?: string | null
          estado?: Database["public"]["Enums"]["estado_cuenta_pey"]
          id?: string
          org_id?: string
          pey_api_key_ref?: string | null
          pey_bank_account_id?: string | null
          titular?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pey_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pey_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pey_webhook_events: {
        Row: {
          id: string
          payload: Json
          procesado_at: string | null
          recibido_at: string
          resultado: string | null
          tipo: string
        }
        Insert: {
          id: string
          payload: Json
          procesado_at?: string | null
          recibido_at?: string
          resultado?: string | null
          tipo: string
        }
        Update: {
          id?: string
          payload?: Json
          procesado_at?: string | null
          recibido_at?: string
          resultado?: string | null
          tipo?: string
        }
        Relationships: []
      }
      point_rules: {
        Row: {
          activo: boolean
          business_id: string
          canje_max_porcentaje: number
          created_at: string
          id: string
          org_id: string
          porcentaje: number
          tope_puntos: number | null
          updated_at: string
          vigencia_dias: number | null
        }
        Insert: {
          activo?: boolean
          business_id: string
          canje_max_porcentaje?: number
          created_at?: string
          id?: string
          org_id: string
          porcentaje: number
          tope_puntos?: number | null
          updated_at?: string
          vigencia_dias?: number | null
        }
        Update: {
          activo?: boolean
          business_id?: string
          canje_max_porcentaje?: number
          created_at?: string
          id?: string
          org_id?: string
          porcentaje?: number
          tope_puntos?: number | null
          updated_at?: string
          vigencia_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "point_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          business_id: string
          charge_id: string | null
          created_at: string
          customer_id: string
          id: string
          org_id: string
          puntos: number
          saldo_resultante: number
          tipo: Database["public"]["Enums"]["tipo_mov_puntos"]
        }
        Insert: {
          business_id: string
          charge_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          org_id: string
          puntos: number
          saldo_resultante?: number
          tipo: Database["public"]["Enums"]["tipo_mov_puntos"]
        }
        Update: {
          business_id?: string
          charge_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          org_id?: string
          puntos?: number
          saldo_resultante?: number
          tipo?: Database["public"]["Enums"]["tipo_mov_puntos"]
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          org_id: string | null
          role: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          org_id?: string | null
          role?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          org_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          created_at: string
          email: string
          invited_by: string | null
          org_id: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          invited_by?: string | null
          org_id: string
          role: string
        }
        Update: {
          created_at?: string
          email?: string
          invited_by?: string | null
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category: string
          charge_id: string | null
          client_id: string | null
          currency: string
          description: string | null
          id: string
          occurred_at: string
          org_id: string | null
          payment_id: string | null
          supplier_id: string | null
          type: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category?: string
          charge_id?: string | null
          client_id?: string | null
          currency?: string
          description?: string | null
          id?: string
          occurred_at?: string
          org_id?: string | null
          payment_id?: string | null
          supplier_id?: string | null
          type: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string
          charge_id?: string | null
          client_id?: string | null
          currency?: string
          description?: string | null
          id?: string
          occurred_at?: string
          org_id?: string | null
          payment_id?: string | null
          supplier_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_point_balances: {
        Row: {
          business_id: string | null
          customer_id: string | null
          org_id: string | null
          saldo: number | null
          ultimo_movimiento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      aplicar_canje: {
        Args: { _charge_id: string; _puntos: number }
        Returns: number
      }
      cerrar_cobro: {
        Args: {
          _charge_id: string
          _estado: Database["public"]["Enums"]["estado_cobro"]
        }
        Returns: Database["public"]["Enums"]["estado_cobro"]
      }
      cliente_por_email: { Args: { _email: string }; Returns: string }
      current_org_id: { Args: never; Returns: string }
      expirar_puntos_inactivos: {
        Args: { _business_id: string; _customer_id: string }
        Returns: number
      }
      has_role: { Args: { _roles: string[] }; Returns: boolean }
      is_admin_red: { Args: never; Returns: boolean }
      multiplicador_nivel: {
        Args: { _nivel: Database["public"]["Enums"]["nivel_cliente"] }
        Returns: number
      }
      my_customer_id: { Args: never; Returns: string }
      nivel_por_compras: {
        Args: { _compras: number }
        Returns: Database["public"]["Enums"]["nivel_cliente"]
      }
      puntos_reservados: { Args: { _charge_id: string }; Returns: number }
      registrar_pago_pey: {
        Args: {
          _charge_id: string
          _fecha_pago: string
          _monto: number
          _pey_referencia: string
        }
        Returns: string
      }
      revisar_expediente: {
        Args: {
          _business_id: string
          _decision: Database["public"]["Enums"]["decision_kyb"]
          _notas?: string
        }
        Returns: undefined
      }
      seed_demo_data: { Args: { _org: string }; Returns: undefined }
      vencer_cobros_pendientes: {
        Args: { _business_id?: string }
        Returns: number
      }
    }
    Enums: {
      categoria_negocio:
        | "abarrotes"
        | "carniceria"
        | "taqueria"
        | "tortilleria"
        | "panaderia"
        | "fruteria"
        | "tienda"
        | "otro"
      decision_kyb: "aprobado" | "rechazado"
      estado_cobro: "pendiente" | "pagado" | "expirado" | "cancelado"
      estado_cuenta_pey: "en_registro" | "activa" | "suspendida" | "error"
      estado_documento: "pendiente" | "validado" | "rechazado"
      estado_kyb: "borrador" | "en_revision" | "aprobado" | "rechazado"
      nivel_cliente: "nuevo" | "confianza" | "vip"
      tipo_cobro: "qr" | "push"
      tipo_documento_kyb:
        | "ine"
        | "constancia_fiscal"
        | "comprobante_domicilio"
        | "titularidad_cuenta"
      tipo_mov_puntos: "acumulacion" | "canje" | "ajuste" | "expiracion"
      tipo_persona: "fisica" | "moral"
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
      categoria_negocio: [
        "abarrotes",
        "carniceria",
        "taqueria",
        "tortilleria",
        "panaderia",
        "fruteria",
        "tienda",
        "otro",
      ],
      decision_kyb: ["aprobado", "rechazado"],
      estado_cobro: ["pendiente", "pagado", "expirado", "cancelado"],
      estado_cuenta_pey: ["en_registro", "activa", "suspendida", "error"],
      estado_documento: ["pendiente", "validado", "rechazado"],
      estado_kyb: ["borrador", "en_revision", "aprobado", "rechazado"],
      nivel_cliente: ["nuevo", "confianza", "vip"],
      tipo_cobro: ["qr", "push"],
      tipo_documento_kyb: [
        "ine",
        "constancia_fiscal",
        "comprobante_domicilio",
        "titularidad_cuenta",
      ],
      tipo_mov_puntos: ["acumulacion", "canje", "ajuste", "expiracion"],
      tipo_persona: ["fisica", "moral"],
    },
  },
} as const

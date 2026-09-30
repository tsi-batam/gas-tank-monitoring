export type Role = 'admin' | 'operator' | 'user'
export type GasType = 'CO₂' | 'Argon'
export type InspectionStatus = 'Normal' | 'Refill' | 'Critical' | 'Unset'

export interface Profile {
  id: string
  username: string
  full_name: string
  role: Role
  is_active: boolean
}

export interface GasSetting {
  id: string
  gas_type: GasType
  pressure_unit: string
  refill_threshold: number | null
  critical_threshold: number | null
}

export interface Inspection {
  id: string
  inspection_date: string
  gas_type: GasType
  in_kgs: number | null
  pressure: number
  pressure_unit: string
  inspector_name: string
  status: InspectionStatus
  notes: string | null
  photo_path: string | null
  created_by: string
}

export interface InspectionPhoto {
  id: string
  inspection_id: string
  storage_path: string
  original_filename: string | null
  mime_type: string | null
  file_size: number | null
  uploaded_by: string | null
  created_at: string
}

import { supabase } from '../lib/supabase'

import type {
  GasSetting,
  Inspection,
  InspectionPhoto,
} from '../types'

export async function getSettings() {
  const { data, error } = await supabase
    .from('gas_settings')
    .select('*')
    .order('gas_type')
    .order('pressure_unit')

  if (error) throw error

  return data as GasSetting[]
}

export async function getInspections() {
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .order('inspection_date', { ascending: false })
    .limit(100)

  if (error) throw error

  return data as Inspection[]
}

/* Khusus untuk Export Excel - mengambil seluruh history */
export async function getAllInspectionsForExport() {
  const { data, error } = await supabase
    .from('inspections')
    .select('*')
    .order('inspection_date', { ascending: false })

  if (error) throw error

  return data as Inspection[]
}

export async function getInspectionPhotos(
  inspectionIds: string[],
) {
  if (!inspectionIds.length) {
    return [] as InspectionPhoto[]
  }

  const { data, error } = await supabase
    .from('inspection_photos')
    .select('*')
    .in('inspection_id', inspectionIds)
    .order('created_at')

  if (error) throw error

  return data as InspectionPhoto[]
}

export async function createInspection(
  input: Omit<
    Inspection,
    'id' | 'status' | 'created_by'
  >,
  userId: string,
) {
  const { data, error } = await supabase
    .from('inspections')
    .insert({
      ...input,
      created_by: userId,
    })
    .select()
    .single()

  if (error) throw error

  return data as Inspection
}

export async function deleteInspection(id: string) {
  const { error } = await supabase
    .from('inspections')
    .delete()
    .eq('id', id)

  if (error) throw error
}
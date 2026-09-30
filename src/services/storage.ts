import { supabase } from '../lib/supabase'
import type { InspectionPhoto } from '../types'

const BUCKET = import.meta.env.VITE_PHOTO_BUCKET || 'inspection-images'

export async function uploadInspectionPhotos(
  inspectionId: string,
  userId: string,
  files: File[],
): Promise<InspectionPhoto[]> {
  const uploaded: InspectionPhoto[] = []

  try {
    for (const file of files) {
      const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
      const safeName = `${crypto.randomUUID()}${extension}`
      const path = `${userId}/${inspectionId}/${safeName}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        })

      if (uploadError) throw uploadError

      const { data, error: rowError } = await supabase
        .from('inspection_photos')
        .insert({
          inspection_id: inspectionId,
          storage_path: path,
          original_filename: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          uploaded_by: userId,
        })
        .select('*')
        .single()

      if (rowError) throw rowError
      uploaded.push(data as InspectionPhoto)
    }

    return uploaded
  } catch (error) {
    // Best-effort cleanup of files uploaded before the failure.
    if (uploaded.length) {
      await supabase.storage
        .from(BUCKET)
        .remove(uploaded.map((photo) => photo.storage_path))
      await supabase
        .from('inspection_photos')
        .delete()
        .in('id', uploaded.map((photo) => photo.id))
    }
    throw error
  }
}

export async function getInspectionPhotos(inspectionId: string) {
  const { data, error } = await supabase
    .from('inspection_photos')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('created_at')

  if (error) throw error
  return data as InspectionPhoto[]
}

export async function createPhotoUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 10)

  if (error) throw error
  return data.signedUrl
}

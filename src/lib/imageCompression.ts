import imageCompression from 'browser-image-compression'
import { isSupabaseConfigured, RECIPE_IMAGES_BUCKET, supabase } from './supabase'

const RECIPE_IMAGE_COMPRESSION_OPTIONS = {
  maxSizeMB: 0.25,
  maxWidthOrHeight: 1400,
  useWebWorker: true,
  fileType: 'image/webp',
} as const

export interface PreparedAiImage {
  base64: string
  mimeType: string
  compressedFile: File
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Nie udało się odczytać zdjęcia jako danych tekstowych.'))
        return
      }
      const commaIndex = reader.result.indexOf(',')
      const base64 = commaIndex >= 0 ? reader.result.slice(commaIndex + 1) : reader.result
      if (!base64) {
        reject(new Error('Wybrany plik graficzny jest pusty.'))
        return
      }
      resolve(base64)
    }

    reader.onerror = () => {
      reject(new Error('Błąd podczas odczytu pliku zdjęcia.'))
    }

    reader.readAsDataURL(file)
  })
}

/**
 * Kompresuje zdjęcie potrawy po stronie klienta do formatu WebP (maks. 250 KB, 1400 px).
 */
export async function compressRecipeImage(file: File): Promise<File> {
  if (!file) {
    throw new Error('Nie wybrano pliku zdjęcia do kompresji.')
  }

  try {
    const compressed = await imageCompression(file, RECIPE_IMAGE_COMPRESSION_OPTIONS)
    return compressed
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'nieznany błąd'
    throw new Error(`Nie udało się skompresować zdjęcia (${reason}).`)
  }
}

/**
 * Kompresuje zdjęcie do WebP i zapisuje je w publicznym koszyku `recipe-images` w Supabase Storage.
 */
export async function uploadRecipeImage(file: File, folder = 'recipes'): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Brak konfiguracji Supabase. Nie można zapisać zdjęcia.')
  }

  const compressedFile = await compressRecipeImage(file)
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '') || 'recipes'
  const filePath = `${cleanFolder}/${crypto.randomUUID()}.webp`

  const { error: uploadError } = await supabase.storage
    .from(RECIPE_IMAGES_BUCKET)
    .upload(filePath, compressedFile, {
      contentType: 'image/webp',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Nie udało się wysłać zdjęcia do Supabase Storage: ${uploadError.message}`)
  }

  const { data } = supabase.storage.from(RECIPE_IMAGES_BUCKET).getPublicUrl(filePath)
  if (!data?.publicUrl) {
    throw new Error('Zdjęcie zostało zapisane, ale nie udało się pobrać jego publicznego adresu URL.')
  }

  return data.publicUrl
}

/**
 * Kompresuje zdjęcie (np. z aparatu lub galerii) i przygotowuje czysty ciąg base64 dla Edge Function AI.
 */
export async function prepareImageForAi(file: File): Promise<PreparedAiImage> {
  const compressedFile = await compressRecipeImage(file)
  const base64 = await readFileAsBase64(compressedFile)
  const mimeType = compressedFile.type || file.type || 'image/webp'

  return {
    base64,
    mimeType,
    compressedFile,
  }
}

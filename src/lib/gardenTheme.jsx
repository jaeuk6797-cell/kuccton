import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_GARDEN_THEME, gardenThemeStorageKey, normalizeGardenTheme, readGardenTheme, writeGardenTheme } from './gardenThemeStorage.js'

const GardenThemeContext = createContext({ tone: DEFAULT_GARDEN_THEME, setTone: () => {}, saved: true })

export function GardenThemeProvider({ userId, demo = false, children }) {
  const storageKey = gardenThemeStorageKey(userId, demo)
  // Changing accounts remounts the preference before any descendant can paint.
  return <ScopedTheme key={storageKey ?? 'anonymous'} storageKey={storageKey}>{children}</ScopedTheme>
}

function ScopedTheme({ storageKey, children }) {
  const [tone, updateTone] = useState(() => readGardenTheme(storageKey))
  const [saved, setSaved] = useState(true)
  const setTone = useCallback((value) => {
    const next = normalizeGardenTheme(value)
    updateTone(next)
    setSaved(writeGardenTheme(storageKey, next))
  }, [storageKey])

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === storageKey || event.key === null) {
        updateTone(readGardenTheme(storageKey))
        setSaved(true)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey])

  const value = useMemo(() => ({ tone, setTone, saved }), [tone, setTone, saved])
  return <GardenThemeContext.Provider value={value}>{children}</GardenThemeContext.Provider>
}

export const useGardenTheme = () => useContext(GardenThemeContext)

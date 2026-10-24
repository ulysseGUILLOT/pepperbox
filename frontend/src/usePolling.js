import { useEffect, useState } from 'react'

// Interroge `load` tout de suite puis toutes les `ms` millisecondes. Une
// erreur garde la derniere valeur connue : un battement manque ne vide pas
// l'ecran.
export default function usePolling(load, ms, deps = []) {
  const [value, setValue] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const refresh = () =>
      load(controller.signal)
        .then((next) => {
          setValue(next)
          setError(null)
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setError(err.message)
        })
    refresh()
    const id = setInterval(refresh, ms)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, deps)

  return [value, error]
}

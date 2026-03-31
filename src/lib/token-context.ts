const TOKEN_CONTEXT_KEY = 'memescout:last-token-address'

function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

export function getAddressFromUrl(): string {
  if (!hasWindow()) return ''
  return new URLSearchParams(window.location.search).get('address')?.trim() ?? ''
}

export function getStoredAddress(): string {
  if (!hasWindow()) return ''
  try {
    return window.sessionStorage.getItem(TOKEN_CONTEXT_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function getInitialTokenAddress(): string {
  return getAddressFromUrl() || getStoredAddress()
}

export function persistTokenAddress(address: string, syncUrl = true): void {
  if (!hasWindow()) return
  const normalized = address.trim()
  if (!normalized) return

  try {
    window.sessionStorage.setItem(TOKEN_CONTEXT_KEY, normalized)
  } catch {
    return
  }

  if (!syncUrl) return

  const url = new URL(window.location.href)
  url.searchParams.set('address', normalized)
  window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}`)
}

export function buildAddressHref(path: string, address: string): string {
  const normalized = address.trim()
  if (!normalized) return path
  return `${path}?address=${encodeURIComponent(normalized)}`
}

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`

export const assetUrl =
  (baseUrl: string) =>
  (path: string): string =>
    `${normalizeBaseUrl(baseUrl)}${path.replace(/^\/+/, '')}`

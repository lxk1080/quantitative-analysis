export const USERNAME_STORAGE_KEY = "__quant-analysis-username__";

export function usernameFromRequest(request: Request): string | null {
  const value = request.headers.get("x-quant-username")?.trim();
  return value && value.length <= 40 ? value : null;
}

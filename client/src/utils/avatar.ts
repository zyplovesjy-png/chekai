/** 昵称头像统一取首个完整 Unicode 字符；空昵称使用问号兜底。 */
export function getAvatarInitial(name?: string | null): string {
  const normalized = String(name || '').trim();
  return Array.from(normalized)[0] || '?';
}

export async function getAdminSession() {
  try {
    const response = await fetch("/api/admin/session", { cache: "no-store" });
    const data = await response.json();
    return response.ok && data.authenticated;
  } catch {
    return false;
  }
}

export async function clearAdminSession() {
  await fetch("/api/admin/session", { method: "DELETE" });
}

export function applyStoredTheme() {
  const t = localStorage.getItem("handle-theme");
  const dark = t === "dark"; // light by default; only an explicit choice enables dark
  document.documentElement.classList.toggle("dark", dark);
}

export function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("handle-theme", dark ? "dark" : "light");
}

export function notify(message: string) {
  window.dispatchEvent(new CustomEvent("ig-toast", { detail: message }));
}

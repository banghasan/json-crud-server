// Simple healthcheck script for Docker healthcheck
const url = "http://localhost:8000/health";

try {
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Healthcheck failed with status", res.status);
    Deno.exit(1);
  }

  const data = await res.json();
  if (data?.status !== "ok") {
    console.error("Healthcheck payload not ok", data);
    Deno.exit(1);
  }
} catch (error) {
  console.error("Healthcheck error", error);
  Deno.exit(1);
}

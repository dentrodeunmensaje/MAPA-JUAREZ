// 1) Pega tu API key aquí (solo para desarrollo local)
const API_KEY = "AIzaSyAqQDU_bhrIp3dyKBF8sTb5QN3HK3ch7to";

// 2) Coordenadas aproximadas del centro de Ciudad Juárez
const CDJ_CENTER = { lat: 31.6904, lng: -106.4245 };
const INITIAL_ZOOM = 12;

// Cargador moderno (recommended) + importLibrary()
async function loadGoogleMaps() {
  if (window.google?.maps) return;

  const script = document.createElement("script");
  const params = new URLSearchParams({
    key: API_KEY,
    v: "weekly",
  });

  // Nota: no usamos callback; esperamos a que cargue el script
  script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
  script.async = true;
  script.defer = true;

  const loaded = new Promise((resolve, reject) => {
    script.addEventListener("load", resolve);
    script.addEventListener("error", () => reject(new Error("No se pudo cargar Google Maps JS")));
  });

  document.head.appendChild(script);
  await loaded;
}

async function initMap() {
  await loadGoogleMaps();

  // Cargar librería "maps" on-demand
  const { Map } = await google.maps.importLibrary("maps");

  const map = new Map(document.getElementById("map"), {
    center: CDJ_CENTER,
    zoom: INITIAL_ZOOM,
    mapId: "DEMO_MAP_ID", // opcional; puedes quitarlo si no usas Map ID
  });

  // Solo para confirmar que ya está vivo
  console.log("Mapa listo:", map.getCenter()?.toJSON());
}

initMap().catch((err) => {
  console.error(err);
  alert("Error cargando el mapa. Revisa consola (F12).");
});
import * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import clsx from "clsx";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  emoji?: string;
  /** Shows a numbered pin (itinerary order). */
  number?: number;
  color?: string;
}

const STYLE = "https://tiles.openfreemap.org/styles/liberty";

/**
 * MapLibre map with OpenFreeMap tiles (no API key). Places without coordinates simply aren't drawn;
 * the surrounding list views always show them.
 */
export function MapView({
  markers,
  selectedId,
  onSelect,
  route,
  className,
  center,
}: {
  markers: MapMarker[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Ordered coordinates to connect with a line (day route). */
  route?: [number, number][];
  className?: string;
  center?: { lat: number; lng: number } | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef<Map<string, maplibregl.Marker>>(new Map());
  const loaded = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: center ? [center.lng, center.lat] : [0, 20],
      zoom: center ? 11 : 1.3,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      loaded.current = true;
      m.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: { "line-color": "#0f766e", "line-width": 3, "line-dasharray": [1.5, 1.5], "line-opacity": 0.8 },
      });
      drawRoute();
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      loaded.current = false;
      markerRefs.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawRoute = () => {
    const src = map.current?.getSource("route") as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: route && route.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route } }] : [],
    });
  };

  useEffect(() => {
    if (loaded.current) drawRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(route)]);

  // Sync markers.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const existing = markerRefs.current;
    for (const [id, mk] of existing) {
      if (!markers.some((x) => x.id === id)) {
        mk.remove();
        existing.delete(id);
      }
    }
    for (const mk of markers) {
      existing.get(mk.id)?.remove();
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", mk.label);
      el.title = mk.label;
      const selected = mk.id === selectedId;
      el.className = clsx(
        "flex items-center justify-center rounded-full border-2 border-white shadow-md transition-transform text-sm font-bold",
        selected ? "size-10 scale-110 z-10" : "size-8",
      );
      el.style.background = mk.color ?? (selected ? "#f97316" : "#0f766e");
      el.style.color = "white";
      el.textContent = mk.number != null ? String(mk.number) : (mk.emoji ?? "•");
      el.onclick = (e) => {
        e.stopPropagation();
        onSelectRef.current?.(mk.id);
      };
      const marker = new maplibregl.Marker({ element: el }).setLngLat([mk.lng, mk.lat]).addTo(m);
      existing.set(mk.id, marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(markers), selectedId]);

  // Fit to markers when the set changes.
  const fitKey = markers.map((m) => m.id).join(",");
  useEffect(() => {
    const m = map.current;
    if (!m || !markers.length) return;
    if (markers.length === 1) {
      m.easeTo({ center: [markers[0].lng, markers[0].lat], zoom: 14, duration: 500 });
      return;
    }
    const b = new maplibregl.LngLatBounds();
    for (const mk of markers) b.extend([mk.lng, mk.lat]);
    m.fitBounds(b, { padding: 60, maxZoom: 15, duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Pan to selection.
  useEffect(() => {
    const sel = markers.find((x) => x.id === selectedId);
    if (sel && map.current) map.current.easeTo({ center: [sel.lng, sel.lat], duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={container} className={clsx("overflow-hidden rounded-2xl bg-slate-100", className)} />;
}

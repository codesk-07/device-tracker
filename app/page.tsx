"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const TrackerMap = dynamic(() => import("@/components/TrackerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-80 items-center justify-center rounded-lg bg-[#eef2f7] text-sm font-medium text-[#5d6678]">
      Loading map...
    </div>
  ),
});

type LocationPoint = {
  latitude: number;
  longitude: number;
  accuracy: number;
  recordedAt: string;
};

export default function Home() {
  const watchIdRef = useRef<number | null>(null);
  const [deviceName, setDeviceName] = useState("My Mobile");
  const [status, setStatus] = useState<"idle" | "tracking" | "error">("idle");
  const [message, setMessage] = useState("Ready to start tracking.");
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [permissionState, setPermissionState] = useState("Checking...");
  const [secureContext, setSecureContext] = useState("Checking...");

  async function refreshBrowserStatus() {
    setSecureContext(window.isSecureContext ? "Yes" : "No");

    if (!("permissions" in navigator)) {
      setPermissionState("Not available");
      return;
    }

    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      setPermissionState(permission.state);
      permission.onchange = () => setPermissionState(permission.state);
    } catch {
      setPermissionState("Not available");
    }
  }

  function saveLocation(position: GeolocationPosition) {
    setLocation({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      recordedAt: new Date().toLocaleString(),
    });
    setStatus("tracking");
    setMessage("Tracking is active while this website/PWA stays open.");
  }

  function showLocationError(error: GeolocationPositionError) {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setStatus("error");

    if (!window.isSecureContext) {
      setMessage(
        "Location needs HTTPS on mobile. Localhost works on this Mac, but phone testing needs Vercel/HTTPS.",
      );
      return;
    }

    if (error.code === error.PERMISSION_DENIED) {
      setMessage("Location permission is blocked. Allow location for this site in browser settings.");
      return;
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      setMessage("Location is unavailable right now. Turn on GPS/location services and try again.");
      return;
    }

    if (error.code === error.TIMEOUT) {
      setMessage("Location request timed out. Try again near a window or with Wi-Fi/mobile data enabled.");
      return;
    }

    setMessage(error.message || "Unable to read location.");
  }

  function showDemoLocation() {
    setLocation({
      latitude: 28.6139,
      longitude: 77.209,
      accuracy: 25,
      recordedAt: new Date().toLocaleString(),
    });
    setStatus("idle");
    setMessage("Demo map loaded. If this appears, the map works and GPS is the only issue.");
  }

  function startTracking() {
    refreshBrowserStatus();

    if (!("geolocation" in navigator)) {
      setStatus("error");
      setMessage("Geolocation is not supported in this browser.");
      return;
    }

    if (!window.isSecureContext) {
      setStatus("error");
      setMessage(
        "This address is not secure. Use localhost on this Mac, or deploy to Vercel for mobile HTTPS tracking.",
      );
      return;
    }

    if (watchIdRef.current !== null) {
      return;
    }

    setStatus("tracking");
    setMessage("Waiting for location permission and first GPS reading...");

    navigator.geolocation.getCurrentPosition(saveLocation, showLocationError, {
      enableHighAccuracy: false,
      maximumAge: 0,
      timeout: 60000,
    });

    watchIdRef.current = navigator.geolocation.watchPosition(
      saveLocation,
      showLocationError,
      {
        enableHighAccuracy: false,
        maximumAge: 15000,
        timeout: 60000,
      },
    );
  }

  function stopTracking() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setStatus("idle");
    setMessage("Tracking stopped.");
  }

  useEffect(() => {
    const statusTimer = window.setTimeout(refreshBrowserStatus, 0);

    return () => {
      window.clearTimeout(statusTimer);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const isTracking = status === "tracking";

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#14161f]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-3 border-b border-[#dfe3eb] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#4f6f52]">Device Tracker</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#14161f]">
              Active location tracking
            </h1>
          </div>
          <div
            className={
              "w-fit rounded-md px-3 py-2 text-sm font-medium " +
              (isTracking
                ? "bg-[#dcefe0] text-[#24512b]"
                : status === "error"
                  ? "bg-[#fde1dc] text-[#8d2d20]"
                  : "bg-[#e9edf4] text-[#4a5568]")
            }
          >
            {isTracking ? "Tracking" : status === "error" ? "Needs attention" : "Stopped"}
          </div>
        </header>

        <div className="grid flex-1 gap-5 py-6 lg:grid-cols-[360px_1fr]">
          <aside className="rounded-lg border border-[#dfe3eb] bg-white p-5 shadow-sm">
            <label
              htmlFor="device-name"
              className="text-sm font-medium text-[#343947]"
            >
              Device name
            </label>
            <input
              id="device-name"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              className="mt-2 h-12 w-full rounded-md border border-[#cfd6e2] bg-white px-3 text-base outline-none transition focus:border-[#52765b] focus:ring-4 focus:ring-[#dcefe0]"
              placeholder="Example: Sourav phone"
            />

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={startTracking}
                disabled={isTracking}
                className="h-12 rounded-md bg-[#2f5f3a] px-4 text-sm font-semibold text-white transition hover:bg-[#264e30] disabled:cursor-not-allowed disabled:bg-[#9fb7a4]"
              >
                Start
              </button>
              <button
                type="button"
                onClick={stopTracking}
                disabled={!isTracking}
                className="h-12 rounded-md border border-[#c9d1df] bg-white px-4 text-sm font-semibold text-[#263041] transition hover:bg-[#f1f4f8] disabled:cursor-not-allowed disabled:text-[#9aa3b2]"
              >
                Stop
              </button>
              <button
                type="button"
                onClick={showDemoLocation}
                className="col-span-2 h-12 rounded-md border border-[#c9d1df] bg-[#f7f8fb] px-4 text-sm font-semibold text-[#263041] transition hover:bg-[#eef2f7]"
              >
                Demo Map
              </button>
            </div>

            <div className="mt-5 rounded-md bg-[#f1f4f8] p-4 text-sm leading-6 text-[#4b5567]">
              On Mac, test with localhost or 127.0.0.1. On mobile, location
              tracking needs HTTPS, so the proper test is after Vercel deploy.
            </div>

            <div className="mt-4 grid gap-3 rounded-md border border-[#dfe3eb] bg-white p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#687386]">Secure page</span>
                <span className="font-semibold text-[#253044]">{secureContext}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#687386]">Location permission</span>
                <span className="font-semibold text-[#253044]">{permissionState}</span>
              </div>
            </div>
          </aside>

          <section className="rounded-lg border border-[#dfe3eb] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 border-b border-[#e4e8ef] pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#14161f]">
                  {deviceName || "Unnamed device"}
                </h2>
                <p className="mt-1 text-sm text-[#5d6678]">{message}</p>
              </div>
              <p className="text-sm text-[#5d6678]">
                {location ? location.recordedAt : "No location saved yet"}
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <LocationMetric
                label="Latitude"
                value={location ? location.latitude.toFixed(6) : "--"}
              />
              <LocationMetric
                label="Longitude"
                value={location ? location.longitude.toFixed(6) : "--"}
              />
              <LocationMetric
                label="Accuracy"
                value={location ? Math.round(location.accuracy) + " m" : "--"}
              />
            </div>

            <div className="mt-5 min-h-80 overflow-hidden rounded-lg border border-[#dfe3eb] bg-[#f7f8fb]">
              {location ? (
                <TrackerMap
                  latitude={location.latitude}
                  longitude={location.longitude}
                  accuracy={location.accuracy}
                  deviceName={deviceName}
                />
              ) : (
                <div className="flex min-h-80 items-center justify-center p-6 text-center">
                  <div>
                    <p className="text-lg font-semibold text-[#253044]">
                      {isTracking ? "Waiting for GPS" : "Location map"}
                    </p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#5d6678]">
                      {isTracking
                        ? "Keep this page open. On desktop it can take up to 60 seconds for the first location reading."
                        : "Click Start and allow location permission to show this device on the map. Use Demo Map to test the map itself."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function LocationMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[#e1e6ee] bg-[#fbfcfe] p-4">
      <p className="text-sm font-medium text-[#687386]">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-[#182033]">
        {value}
      </p>
    </div>
  );
}

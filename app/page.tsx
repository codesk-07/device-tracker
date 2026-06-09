"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const TrackerMap = dynamic(() => import("@/components/TrackerMap"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-80 items-center justify-center rounded-lg bg-[#eef2f7] text-sm font-medium text-[#5d6678]">
      Loading map...
    </div>
  ),
});

type Device = {
  id: string;
  name: string;
  type: string;
};

type LocationPoint = {
  latitude: number;
  longitude: number;
  accuracy: number;
  recordedAt: string;
  placeName: string;
};

type LocationRow = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  place_name: string | null;
  created_at: string;
};

export default function Home() {
  const watchIdRef = useRef<number | null>(null);
  const lastSavedAtRef = useRef(0);
  const selectedDeviceIdRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);
  const placeCacheRef = useRef<Record<string, string>>({});

  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authMessage, setAuthMessage] = useState("Login or create an account to save tracking data online.");

  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceName, setDeviceName] = useState("My Mobile");
  const [deviceType, setDeviceType] = useState("mobile");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [status, setStatus] = useState<"idle" | "tracking" | "error">("idle");
  const [message, setMessage] = useState("Ready to start tracking.");
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [permissionState, setPermissionState] = useState("Checking...");
  const [secureContext, setSecureContext] = useState("Checking...");

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  function selectDevice(deviceId: string) {
    const device = devices.find((item) => item.id === deviceId);
    setSelectedDeviceId(deviceId);

    if (device) {
      setDeviceName(device.name);
      setDeviceType(device.type);
      loadLatestLocation(device.id);
    }
  }

  useEffect(() => {
    userRef.current = session?.user ?? null;
  }, [session]);

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

  function fallbackPlaceName(latitude: number, longitude: number) {
    return "Near " + latitude.toFixed(4) + ", " + longitude.toFixed(4);
  }

  function formatPlaceName(data: {
    display_name?: string;
    address?: Record<string, string>;
  }) {
    const address = data.address ?? {};
    const parts = [
      address.neighbourhood,
      address.suburb,
      address.city || address.town || address.village,
      address.state,
      address.country,
    ].filter(Boolean);

    if (parts.length) {
      return Array.from(new Set(parts)).slice(0, 4).join(", ");
    }

    return data.display_name?.split(",").slice(0, 4).join(",").trim() || "Nearby place unavailable";
  }

  async function getPlaceName(latitude: number, longitude: number) {
    const cacheKey = latitude.toFixed(4) + "," + longitude.toFixed(4);
    if (placeCacheRef.current[cacheKey]) {
      return placeCacheRef.current[cacheKey];
    }

    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        lat: String(latitude),
        lon: String(longitude),
        addressdetails: "1",
      });
      const response = await fetch("https://nominatim.openstreetmap.org/reverse?" + params);

      if (!response.ok) {
        throw new Error("Place lookup failed");
      }

      const data = await response.json();
      const placeName = formatPlaceName(data);
      placeCacheRef.current[cacheKey] = placeName;
      return placeName;
    } catch {
      return fallbackPlaceName(latitude, longitude);
    }
  }

  async function loadDevices(userId: string) {
    if (!supabase) {
      setMessage("Supabase environment variables are missing in this deployment.");
      return;
    }

    const { data, error } = await supabase!
      .from("devices")
      .select("id,name,type")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Run the Supabase schema SQL before saving devices.");
      return;
    }

    setDevices(data ?? []);
    if (data?.length && !selectedDeviceIdRef.current) {
      setSelectedDeviceId(data[0].id);
      setDeviceName(data[0].name);
      setDeviceType(data[0].type);
      loadLatestLocation(data[0].id);
    }
  }

  async function refreshSelectedLocation() {
    if (!selectedDeviceId) {
      setMessage("Select a device first.");
      return;
    }

    await loadLatestLocation(selectedDeviceId, true);
  }

  async function loadLatestLocation(deviceId: string, showStatus = false) {
    if (!supabase) {
      return;
    }

    if (showStatus) {
      setMessage("Refreshing latest saved location...");
    }

    const { data, error } = await supabase
      .from("locations")
      .select("latitude,longitude,accuracy,place_name,created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<LocationRow>();

    if (error || !data) {
      if (showStatus) {
        setMessage("No saved location found for this device yet.");
      }
      return;
    }

    const placeName = data.place_name || (await getPlaceName(data.latitude, data.longitude));

    setLocation({
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: data.accuracy ?? 0,
      recordedAt: new Date(data.created_at).toLocaleString(),
      placeName,
    });
    setMessage(showStatus ? "Latest saved location refreshed." : "Showing latest saved location for this device.");
  }

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setAuthMessage("Supabase environment variables are missing in this deployment.");
      return;
    }
    setAuthMessage("Working...");

    const authRequest =
      authMode === "signup"
        ? supabase!.auth.signUp({ email, password })
        : supabase!.auth.signInWithPassword({ email, password });

    const { error } = await authRequest;

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    setAuthMessage(authMode === "signup" ? "Account created. You are signed in." : "Logged in.");
  }

  async function logout() {
    if (!supabase) {
      return;
    }

    stopTracking();
    await supabase!.auth.signOut();
    setDevices([]);
    setSelectedDeviceId(null);
    setLocation(null);
    setAuthMessage("Logged out.");
  }

  async function saveDevice() {
    if (!supabase) {
      setMessage("Supabase environment variables are missing in this deployment.");
      return;
    }

    const user = session?.user;
    if (!user) {
      setMessage("Login first, then create a device.");
      return;
    }

    const cleanName = deviceName.trim();
    if (!cleanName) {
      setMessage("Enter a device name.");
      return;
    }

    const { data, error } = await supabase!
      .from("devices")
      .insert({ user_id: user.id, name: cleanName, type: deviceType })
      .select("id,name,type")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setDevices((current) => [data, ...current]);
    setSelectedDeviceId(data.id);
    setDeviceName(data.name);
    setDeviceType(data.type);
    setMessage("Device saved. Start tracking to save locations.");
  }

  async function saveLocationToDatabase(point: LocationPoint) {
    if (!supabase) {
      return;
    }

    const user = userRef.current;
    const deviceId = selectedDeviceIdRef.current;

    if (!user || !deviceId) {
      return;
    }

    const now = Date.now();
    if (now - lastSavedAtRef.current < 30000) {
      return;
    }

    lastSavedAtRef.current = now;

    const { error } = await supabase!.from("locations").insert({
      user_id: user.id,
      device_id: deviceId,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy,
      place_name: point.placeName,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Tracking is active. Latest place saved online.");
  }

  async function saveLocation(position: GeolocationPosition) {
    const placeName = await getPlaceName(
      position.coords.latitude,
      position.coords.longitude,
    );
    const point = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      recordedAt: new Date().toLocaleString(),
      placeName,
    };

    setLocation(point);
    setStatus("tracking");
    setMessage("Tracking is active while this website/PWA stays open.");
    saveLocationToDatabase(point);
  }

  function showLocationError(error: GeolocationPositionError) {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setStatus("error");

    if (!window.isSecureContext) {
      setMessage("Location needs HTTPS on mobile. Use the Vercel link for phone tracking.");
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
      setMessage("Location request timed out. Try again with GPS, Wi-Fi, or mobile data enabled.");
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
      placeName: "New Delhi, Delhi, India",
    });
    setStatus("idle");
    setMessage("Demo map loaded. If this appears, the map works and GPS is the only issue.");
  }

  function startTracking() {
    refreshBrowserStatus();

    if (!session?.user) {
      setStatus("error");
      setMessage("Login first so this device location can be saved online.");
      return;
    }

    if (!selectedDeviceId) {
      setStatus("error");
      setMessage("Create or select a device before starting tracking.");
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus("error");
      setMessage("Geolocation is not supported in this browser.");
      return;
    }

    if (!window.isSecureContext) {
      setStatus("error");
      setMessage("This address is not secure. Use localhost on Mac, or Vercel HTTPS on mobile.");
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

    watchIdRef.current = navigator.geolocation.watchPosition(saveLocation, showLocationError, {
      enableHighAccuracy: false,
      maximumAge: 15000,
      timeout: 60000,
    });
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

    if (!supabase) {
      window.setTimeout(() => {
        setAuthMessage("Add Supabase environment variables in Vercel, then redeploy.");
      }, 0);
      return () => {
        window.clearTimeout(statusTimer);
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadDevices(data.session.user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        loadDevices(nextSession.user.id);
      }
    });

    return () => {
      window.clearTimeout(statusTimer);
      listener.subscription.unsubscribe();
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const isTracking = status === "tracking";
  const currentUser = session?.user;

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#14161f]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-3 border-b border-[#dfe3eb] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#4f6f52]">Device Tracker</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#14161f]">
              Device location dashboard
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {currentUser ? <span className="text-sm text-[#5d6678]">{currentUser.email}</span> : null}
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
          </div>
        </header>

        {!isSupabaseConfigured ? (
          <div className="mt-5 rounded-md border border-[#f2c6bd] bg-[#fff1ee] p-4 text-sm font-medium text-[#8d2d20]">
            Supabase is not configured for this deployment. Add the two NEXT_PUBLIC_SUPABASE variables in Vercel and redeploy.
          </div>
        ) : null}

        <div className="grid flex-1 gap-5 py-6 lg:grid-cols-[380px_1fr]">
          <aside className="space-y-5">
            <section className="rounded-lg border border-[#dfe3eb] bg-white p-5 shadow-sm">
              {currentUser ? (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-[#14161f]">Account</h2>
                    <button type="button" onClick={logout} className="rounded-md border border-[#c9d1df] px-3 py-2 text-sm font-semibold text-[#263041]">
                      Logout
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-[#5d6678]">Use this same account on another phone or laptop to view the latest saved location.</p>
                </div>
              ) : (
                <form onSubmit={handleAuth} className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-[#14161f]">Account</h2>
                    <p className="mt-1 text-sm text-[#5d6678]">{authMessage}</p>
                  </div>
                  <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder="Email" className="h-12 w-full rounded-md border border-[#cfd6e2] px-3 outline-none focus:border-[#52765b] focus:ring-4 focus:ring-[#dcefe0]" />
                  <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={6} placeholder="Password" className="h-12 w-full rounded-md border border-[#cfd6e2] px-3 outline-none focus:border-[#52765b] focus:ring-4 focus:ring-[#dcefe0]" />
                  <button type="submit" className="h-12 w-full rounded-md bg-[#2f5f3a] px-4 text-sm font-semibold text-white hover:bg-[#264e30]">
                    {authMode === "signup" ? "Create account" : "Login"}
                  </button>
                  <button type="button" onClick={() => setAuthMode(authMode === "signup" ? "login" : "signup")} className="w-full text-sm font-semibold text-[#2f5f3a]">
                    {authMode === "signup" ? "Use existing account" : "Create a new account"}
                  </button>
                </form>
              )}
            </section>

            <section className="rounded-lg border border-[#dfe3eb] bg-white p-5 shadow-sm">
              <label htmlFor="device-name" className="text-sm font-medium text-[#343947]">Device name</label>
              <input id="device-name" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} className="mt-2 h-12 w-full rounded-md border border-[#cfd6e2] bg-white px-3 text-base outline-none transition focus:border-[#52765b] focus:ring-4 focus:ring-[#dcefe0]" placeholder="Example: Sourav phone" />

              <label htmlFor="device-type" className="mt-4 block text-sm font-medium text-[#343947]">Device type</label>
              <select id="device-type" value={deviceType} onChange={(event) => setDeviceType(event.target.value)} className="mt-2 h-12 w-full rounded-md border border-[#cfd6e2] bg-white px-3 text-base outline-none transition focus:border-[#52765b] focus:ring-4 focus:ring-[#dcefe0]">
                <option value="mobile">Mobile</option>
                <option value="laptop">Laptop</option>
                <option value="tablet">Tablet</option>
              </select>

              <button type="button" onClick={saveDevice} disabled={!currentUser} className="mt-4 h-12 w-full rounded-md bg-[#2f5f3a] px-4 text-sm font-semibold text-white transition hover:bg-[#264e30] disabled:cursor-not-allowed disabled:bg-[#9fb7a4]">
                Save Device
              </button>

              {devices.length ? (
                <select value={selectedDeviceId ?? ""} onChange={(event) => selectDevice(event.target.value)} className="mt-4 h-12 w-full rounded-md border border-[#cfd6e2] bg-white px-3 text-base outline-none transition focus:border-[#52765b] focus:ring-4 focus:ring-[#dcefe0]">
                  {devices.map((device) => <option key={device.id} value={device.id}>{device.name} ({device.type})</option>)}
                </select>
              ) : null}

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={startTracking} disabled={isTracking} className="h-12 rounded-md bg-[#2f5f3a] px-4 text-sm font-semibold text-white transition hover:bg-[#264e30] disabled:cursor-not-allowed disabled:bg-[#9fb7a4]">Start</button>
                <button type="button" onClick={stopTracking} disabled={!isTracking} className="h-12 rounded-md border border-[#c9d1df] bg-white px-4 text-sm font-semibold text-[#263041] transition hover:bg-[#f1f4f8] disabled:cursor-not-allowed disabled:text-[#9aa3b2]">Stop</button>
                <button type="button" onClick={refreshSelectedLocation} disabled={!selectedDeviceId} className="col-span-2 h-12 rounded-md border border-[#c9d1df] bg-[#f7f8fb] px-4 text-sm font-semibold text-[#263041] transition hover:bg-[#eef2f7] disabled:cursor-not-allowed disabled:text-[#9aa3b2]">Refresh Latest Location</button>
                <button type="button" onClick={showDemoLocation} className="col-span-2 h-12 rounded-md border border-[#c9d1df] bg-white px-4 text-sm font-semibold text-[#263041] transition hover:bg-[#eef2f7]">Demo Map</button>
              </div>

              <div className="mt-5 rounded-md bg-[#f1f4f8] p-4 text-sm leading-6 text-[#4b5567]">
                Keep the tracking device open. View from another device by logging in with the same account and pressing Refresh Latest Location.
              </div>

              <div className="mt-4 grid gap-3 rounded-md border border-[#dfe3eb] bg-white p-4 text-sm">
                <div className="flex items-center justify-between gap-3"><span className="text-[#687386]">Secure page</span><span className="font-semibold text-[#253044]">{secureContext}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-[#687386]">Location permission</span><span className="font-semibold text-[#253044]">{permissionState}</span></div>
              </div>
            </section>
          </aside>

          <section className="rounded-lg border border-[#dfe3eb] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 border-b border-[#e4e8ef] pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#14161f]">{deviceName || "Unnamed device"}</h2>
                <p className="mt-1 text-sm text-[#5d6678]">{message}</p>
              </div>
              <p className="text-sm text-[#5d6678]">{location ? location.recordedAt : "No location saved yet"}</p>
            </div>

            <div className="mt-5 rounded-lg border border-[#dfe3eb] bg-[#fbfcfe] p-5">
              <p className="text-sm font-medium text-[#687386]">Latest known place</p>
              <p className="mt-2 text-2xl font-semibold text-[#182033]">
                {location ? location.placeName : "--"}
              </p>
              <div className="mt-4 grid gap-3 text-sm text-[#5d6678] sm:grid-cols-3">
                <p>Accuracy: {location ? Math.round(location.accuracy) + " m" : "--"}</p>
                <p className="break-words">Lat: {location ? location.latitude.toFixed(5) : "--"}</p>
                <p className="break-words">Lng: {location ? location.longitude.toFixed(5) : "--"}</p>
              </div>
            </div>

            <div className="mt-5 min-h-80 overflow-hidden rounded-lg border border-[#dfe3eb] bg-[#f7f8fb]">
              {location ? (
                <TrackerMap latitude={location.latitude} longitude={location.longitude} accuracy={location.accuracy} deviceName={deviceName} />
              ) : (
                <div className="flex min-h-80 items-center justify-center p-6 text-center">
                  <div>
                    <p className="text-lg font-semibold text-[#253044]">{isTracking ? "Waiting for GPS" : "Location map"}</p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-[#5d6678]">{isTracking ? "Keep this page open. On mobile, the map appears after the first GPS reading." : "Select a device to view its latest saved location, or click Start on this device to track it."}</p>
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


import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import api from "./api";

const pin = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [35, 35] });
  }, [points, map]);
  return null;
}

async function geocode(place) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(place)}`
  );
  if (!response.ok) throw new Error("Location search failed");
  const data = await response.json();
  if (!data[0]) throw new Error(`Could not find "${place}"`);
  return [Number(data[0].lat), Number(data[0].lon)];
}

async function routeBetween(a, b) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Routing service unavailable");
  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.[0]) throw new Error("No route found");
  const r = data.routes[0];
  return {
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    points: r.geometry.coordinates.map(([lon, lat]) => [lat, lon])
  };
}

function Header() {
  const navigate = useNavigate();
  const token = localStorage.getItem("smartride_token");
  const user = JSON.parse(localStorage.getItem("smartride_user") || "null");

  function logout() {
    localStorage.removeItem("smartride_token");
    localStorage.removeItem("smartride_user");
    navigate("/");
  }

  return (
    <header className="header">
      <Link className="brand" to="/">
        <span className="brand-mark">S</span>
        SmartRide <span>AI</span>
      </Link>
      <nav>
        <Link to="/">Plan Ride</Link>
        {token && <Link to="/history">My Rides</Link>}
        {token ? (
          <button className="link-button" onClick={logout}>Logout</button>
        ) : (
          <Link className="nav-cta" to="/login">Login</Link>
        )}
      </nav>
      {user && <div className="user-chip">{user.name}</div>}
    </header>
  );
}

function Home() {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trip, setTrip] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const navigate = useNavigate();

  async function planRide(e) {
    e.preventDefault();
    setError("");
    setTrip(null);
    setRecommendation(null);
    if (!source.trim() || !destination.trim()) {
      setError("Enter both pickup and destination.");
      return;
    }

    setLoading(true);
    try {
      const [a, b] = await Promise.all([geocode(source), geocode(destination)]);
      const result = await routeBetween(a, b);
      setTrip({ ...result, sourceCoords: a, destinationCoords: b });
      const ai = await api.get("/ai/recommendation", {
        params: { distance: result.distanceKm, duration: result.durationMin }
      });
      setRecommendation(ai.data);
    } catch (err) {
      setError(err.message || "Unable to plan the ride.");
    } finally {
      setLoading(false);
    }
  }

  async function book(option) {
    const token = localStorage.getItem("smartride_token");
    if (!token) {
      navigate("/login", { state: { returnTo: "/" } });
      return;
    }
    try {
      await api.post("/rides", {
        source, destination,
        distanceKm: trip.distanceKm,
        durationMin: trip.durationMin,
        fare: option.fare,
        vehicle: option.vehicle
      });
      navigate("/history");
    } catch {
      setError("Could not save the ride. Please login again.");
    }
  }

  const mapPoints = useMemo(() => trip ? [trip.sourceCoords, trip.destinationCoords] : [], [trip]);

  return (
    <main>
      <section className="hero">
        <div>
          <div className="eyebrow">SMARTER ROUTES • FAIRER FARES</div>
          <h1>Plan your ride<br /><em>the smarter way.</em></h1>
          <p className="hero-copy">
            Compare ride options using distance, estimated time and fare — then choose what works best for you.
          </p>
        </div>
        <form className="planner-card" onSubmit={planRide}>
          <label>Pickup location</label>
          <input value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. JSS Academy of Technical Education" />
          <label>Destination</label>
          <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. India Gate, New Delhi" />
          <button className="primary" disabled={loading}>{loading ? "Finding best route..." : "Plan my ride →"}</button>
          {error && <div className="error">{error}</div>}
          <small>No Google Maps API. Routing uses OpenStreetMap-based services.</small>
        </form>
      </section>

      {trip && (
        <section className="results">
          <div className="section-heading">
            <div>
              <div className="eyebrow">YOUR ROUTE</div>
              <h2>Ride options</h2>
            </div>
            <div className="trip-stats">
              <strong>{trip.distanceKm.toFixed(1)} km</strong>
              <span>•</span>
              <strong>{Math.round(trip.durationMin)} min</strong>
            </div>
          </div>

          <div className="result-grid">
            <div className="map-card">
              <MapContainer center={trip.sourceCoords} zoom={12} scrollWheelZoom={false}>
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={trip.sourceCoords} icon={pin}>
                  <Popup>Pickup</Popup>
                </Marker>
                <Marker position={trip.destinationCoords} icon={pin}>
                  <Popup>Destination</Popup>
                </Marker>
                <Polyline positions={trip.points} />
                <FitBounds points={mapPoints} />
              </MapContainer>
            </div>

            <div className="options">
              {recommendation?.recommendation && (
                <div className="ai-card">
                  <div className="ai-title">✦ AI PICK</div>
                  <strong>{recommendation.recommendation.vehicle}</strong>
                  <span>Best overall balance for this trip</span>
                </div>
              )}

              {recommendation?.options.map(option => (
                <div className={`ride-option ${option.vehicle === recommendation.recommendation.vehicle ? "selected" : ""}`} key={option.vehicle}>
                  <div className="ride-icon">{option.vehicle === "Bike" ? "🏍️" : option.vehicle === "Auto" ? "🛺" : "🚕"}</div>
                  <div className="ride-info">
                    <strong>{option.vehicle}</strong>
                    <span>{option.eta} min pickup • score {option.score}/100</span>
                  </div>
                  <div className="ride-price">₹{option.fare}</div>
                  <button onClick={() => book(option)}>Choose</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Auth({ mode }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { name, email, password };
      const { data } = await api.post(endpoint, body);
      localStorage.setItem("smartride_token", data.token);
      localStorage.setItem("smartride_user", JSON.stringify(data.user));
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong.");
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="eyebrow">{mode === "login" ? "WELCOME BACK" : "CREATE ACCOUNT"}</div>
        <h2>{mode === "login" ? "Login to SmartRide" : "Start riding smarter"}</h2>
        {mode === "register" && <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />}
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (6+ characters)" />
        <button className="primary">{mode === "login" ? "Login" : "Create account"}</button>
        {error && <div className="error">{error}</div>}
        <p className="switch">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <Link to={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "Create one" : "Login"}
          </Link>
        </p>
      </form>
    </main>
  );
}

function History() {
  const [rides, setRides] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/rides").then(r => setRides(r.data)).catch(e => setError(e.response?.data?.message || "Login required"));
  }, []);

  return (
    <main className="page">
      <div className="eyebrow">ACCOUNT</div>
      <h1>My rides</h1>
      {error && <div className="error">{error}</div>}
      {!error && rides.length === 0 && <div className="empty">No rides yet. Plan your first ride from the home page.</div>}
      <div className="history-list">
        {rides.map(ride => (
          <div className="history-item" key={ride._id || ride.id}>
            <div><strong>{ride.source}</strong><span>to</span><strong>{ride.destination}</strong></div>
            <div className="history-meta">{ride.vehicle} • {Number(ride.distanceKm).toFixed(1)} km • ₹{ride.fare}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function App() {
  return (
    <div className="app">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="/history" element={<History />} />
      </Routes>
      <footer>SmartRide AI · Built as a full-stack college project</footer>
    </div>
  );
}

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

const demoUsers = [];
const demoRides = [];

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  passwordHash: String
}, { timestamps: true });

const rideSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  source: String,
  destination: String,
  distanceKm: Number,
  durationMin: Number,
  fare: Number,
  vehicle: String,
  status: { type: String, default: "completed" }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Ride = mongoose.model("Ride", rideSchema);

function signToken(user) {
  return jwt.sign({ id: String(user._id || user.id), email: user.email }, JWT_SECRET, {
    expiresIn: "7d"
  });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Login required" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "SmartRide AI API" });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: "Name, email and a 6+ character password are required." });
  }

  const cleanEmail = email.toLowerCase().trim();

  if (process.env.MONGODB_URI) {
    try {
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) return res.status(409).json({ message: "Email already registered." });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({ name: name.trim(), email: cleanEmail, passwordHash });
      return res.status(201).json({
        token: signToken(user),
        user: { id: String(user._id), name: user.name, email: user.email }
      });
    } catch (error) {
      return res.status(500).json({ message: "Registration failed.", detail: error.message });
    }
  }

  if (demoUsers.some(u => u.email === cleanEmail)) {
    return res.status(409).json({ message: "Email already registered in demo mode." });
  }

  const user = { id: crypto.randomUUID(), name: name.trim(), email: cleanEmail, passwordHash: await bcrypt.hash(password, 10) };
  demoUsers.push(user);

  res.status(201).json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email }
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = String(email || "").toLowerCase().trim();

  let user;
  if (process.env.MONGODB_URI) {
    user = await User.findOne({ email: cleanEmail });
  } else {
    user = demoUsers.find(u => u.email === cleanEmail);
  }

  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  res.json({
    token: signToken(user),
    user: { id: String(user._id || user.id), name: user.name, email: user.email }
  });
});

app.get("/api/rides", auth, async (req, res) => {
  if (process.env.MONGODB_URI) {
    const rides = await Ride.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(20);
    return res.json(rides);
  }

  res.json(demoRides.filter(r => r.userId === req.user.id).slice(-20).reverse());
});

app.post("/api/rides", auth, async (req, res) => {
  const { source, destination, distanceKm, durationMin, fare, vehicle } = req.body;

  if (!source || !destination) {
    return res.status(400).json({ message: "Source and destination are required." });
  }

  const payload = {
    source, destination,
    distanceKm: Number(distanceKm) || 0,
    durationMin: Number(durationMin) || 0,
    fare: Number(fare) || 0,
    vehicle: vehicle || "Bike"
  };

  if (process.env.MONGODB_URI) {
    const ride = await Ride.create({ ...payload, userId: req.user.id });
    return res.status(201).json(ride);
  }

  const ride = {
    id: crypto.randomUUID(),
    userId: req.user.id,
    ...payload,
    status: "booked",
    createdAt: new Date().toISOString()
  };
  demoRides.push(ride);
  res.status(201).json(ride);
});

app.get("/api/ai/recommendation", (req, res) => {
  const distance = Number(req.query.distance) || 0;
  const duration = Number(req.query.duration) || 0;

  const baseFare = 35 + distance * 12;
  const bike = Math.round(baseFare * 0.65);
  const auto = Math.round(baseFare * 0.95);
  const cab = Math.round(baseFare * 1.35);

  const options = [
    { vehicle: "Bike", fare: bike, eta: Math.max(3, Math.round(duration * 0.6)), score: 91 },
    { vehicle: "Auto", fare: auto, eta: Math.max(4, Math.round(duration * 0.8)), score: 86 },
    { vehicle: "Cab", fare: cab, eta: Math.max(5, Math.round(duration * 0.9)), score: 82 }
  ];

  const best = options.reduce((a, b) => b.score > a.score ? b : a);

  res.json({
    recommendation: best,
    options,
    explanation: `AI-style recommendation balances estimated fare, travel time and convenience for a ${distance.toFixed(1)} km trip.`
  });
});

async function start() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("MongoDB connected");
    } catch (error) {
      console.error("MongoDB connection failed:", error.message);
      console.log("Starting without database in demo mode.");
    }
  } else {
    console.log("No MONGODB_URI found — running in demo mode.");
  }

  app.listen(PORT, () => console.log(`SmartRide AI API running on http://localhost:${PORT}`));
}

start();

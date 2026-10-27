import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { asyncRoute } from "../utils/asyncRoute.js";
import { authenticate } from "../middleware/auth.js";
import { loginSchema, registerSchema, validate } from "../middleware/validation.js";

const router = Router();

function createToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
}

router.post("/register", validate(registerSchema), asyncRoute(async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = email.toLowerCase();
  if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: "An account with this email already exists" });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email: normalizedEmail, passwordHash, role: "student" });
  return res.status(201).json({
    token: createToken(user),
    user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
  });
}));

router.post("/login", validate(loginSchema), asyncRoute(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }
  return res.json({
    token: createToken(user),
    user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
  });
}));

router.get("/me", authenticate, (req, res) => {
  res.json({ id: String(req.user._id), name: req.user.name, email: req.user.email, role: req.user.role });
});

export default router;

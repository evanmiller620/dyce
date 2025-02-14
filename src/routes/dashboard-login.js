import User from "../schemas/userSchema.js";
import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import crypto from "crypto";
import z from "zod";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// Connect to MongoDB
mongoose.connect(process.env.DB_STRING)
.then(() => console.log("Connected to MongoDB"))
.catch((err) => console.error("MongoDB connection error:", err));

// Define sign up fields
const signUpSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
});

// Login route
router.post("/login", async (req, res) => {
    console.log("Received login request");

    const user = await User.findOne({ email: req.body.email });

    if (user && user.verified && await bcrypt.compare(req.body.password, user.password)) {
        req.session.user = user.email;
        return res.json({ user: req.session.user });
    }
    
    res.status(401).json({ message: "Wrong email or password" });
});

// Register route
router.post("/register", async (req, res) => {
    console.log("Received register request");

    const result = signUpSchema.safeParse(req.body);

    if (!result.success)
        return res.status(401).json({
            message: result.error.errors[0].message
        });

    const { email, password } = result.data;

    const existingUser = await User.findOne({ email: email });
    if (existingUser)
        return res.status(401).json({ message: "Email already in use!" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(20).toString("hex");
    const newUser = new User({
        email: email,
        password: hashedPassword,
        verified: false,
        verificationToken: verificationToken
    });
    await newUser.save();

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.EMAIL_PASSWORD
        }
    });

    const verificationLink = `http://localhost:5173/verify?token=${verificationToken}`;
    const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: "Email Verification",
        text: `Please verify your email address by clicking the link below:\n\n${verificationLink}`
    }

    try {
        await transporter.sendMail(mailOptions);
        res.status(201).json({ message: "Verification email sent" });
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ message: "Failed to send verification email" });
    }
});

// Email verification route
router.get("/verify-email", async (req, res) => {
    console.log("Received verify email request");

    const { token } = req.query;
    const user = await User.findOne({ verificationToken: token });

    if (!user) return res.status(400).json({ message: "Invalid verification link" });

    user.verified = true;
    user.verificationToken = undefined;
    await user.save();

    req.session.user = user.email;
    res.json({ user: req.session.user });
});

// Logout route
router.post("/logout", (req, res) => {
    console.log("Received logout request");

    req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ message: 'Logout successful' });
    });
});

// Dashboard data route
router.get("/auth-check", (req, res) => {
    console.log("Received authorization check request");

    if (req.session.user)
        res.json({ authenticated: true, user: req.session.user });
    else
        res.json({ authenticated: false });
});

export default router;
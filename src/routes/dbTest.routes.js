const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

router.get("/test-db", auth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 AS result");
    res.json({
      success: true,
      user: req.user,
      db: "connected"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

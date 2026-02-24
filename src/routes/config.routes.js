const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

router.get("/config/init", auth, async (req, res) => {
  const restaurantId = req.user.restaurant_id;

  try {
    const [
      categories,
      items,
      sizes,
      combos,
      comboItems,
      tenders
    ] = await Promise.all([
      db.query(
        "SELECT * FROM item_categories WHERE restaurant_id = ? AND is_active = 1 ORDER BY display_order",
        [restaurantId]
      ),
      db.query(
        "SELECT * FROM items WHERE restaurant_id = ? AND is_active = 1",
        [restaurantId]
      ),
      db.query(
        `SELECT s.* FROM item_sizes s
         JOIN items i ON i.item_id = s.item_id
         WHERE i.restaurant_id = ?`,
        [restaurantId]
      ),
      db.query(
        "SELECT * FROM combos WHERE restaurant_id = ? AND is_active = 1",
        [restaurantId]
      ),
      db.query(
        `SELECT ci.* FROM combo_items ci
         JOIN combos c ON c.combo_id = ci.combo_id
         WHERE c.restaurant_id = ?`,
        [restaurantId]
      ),
      db.query(
        "SELECT * FROM payment_tenders WHERE restaurant_id = ? AND is_active = 1",
        [restaurantId]
      )
    ]);

    res.json({
      categories: categories[0],
      items: items[0],
      sizes: sizes[0],
      combos: combos[0],
      comboItems: comboItems[0],
      tenders: tenders[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Config load failed" });
  }
});

module.exports = router;

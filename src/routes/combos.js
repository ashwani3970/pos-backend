const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

/**
 * GET COMBO DETAILS WITH GROUPS
 */
router.get("/combos/:comboId", auth, async (req, res) => {

  const { comboId } = req.params;
  const restaurantId = req.user.restaurant_id;

  try {

    // 1️⃣ Get combo
    const [comboRows] = await db.query(
      `SELECT combo_id, combo_name, combo_price
       FROM combos
       WHERE combo_id = ?
       AND restaurant_id = ?
       AND is_active = 1`,
      [comboId, restaurantId]
    );

    if (comboRows.length === 0) {
      return res.status(404).json({ message: "Combo not found" });
    }

    const combo = comboRows[0];

    // 2️⃣ Get groups
    const [groups] = await db.query(
      `SELECT
        group_id,
        group_name,
        min_select,
        max_select,
        display_order
       FROM combo_groups
       WHERE combo_id = ?
       ORDER BY display_order`,
      [comboId]
    );

    // 3️⃣ Get group items
    const [items] = await db.query(
      `SELECT
        cgi.group_id,
        i.item_id,
        i.item_name,
        s.size_id,
        s.size_name
      FROM combo_group_items cgi
      JOIN items i ON cgi.item_id = i.item_id
      LEFT JOIN item_sizes s ON cgi.size_id = s.size_id
      JOIN combo_groups g ON cgi.group_id = g.group_id
      WHERE g.combo_id = ?`,
      [comboId]
    );

    // 4️⃣ Map items into groups
    const groupsWithItems = groups.map(group => ({
      ...group,
      items: items.filter(i => i.group_id === group.group_id)
    }));

    // 5️⃣ Final response
    res.json({
      combo_id: combo.combo_id,
      combo_name: combo.combo_name,
      combo_price: combo.combo_price,
      groups: groupsWithItems
    });

  } catch (err) {
    console.error("COMBO LOAD ERROR:", err);
    res.status(500).json({ message: "Failed to load combo" });
  }

});

/**
 * ADD COMBO TO ORDER
 */
router.post("/orders/live/:orderId/combo", auth, async (req, res) => {

    const { orderId } = req.params;
  const { combo_id, items } = req.body;
  const restaurantId = req.user.restaurant_id;

  try {

    // 1️⃣ Get combo details
    const [comboRows] = await db.query(
      `SELECT combo_name, combo_price
       FROM combos
       WHERE combo_id = ? AND restaurant_id = ?`,
      [combo_id, restaurantId]
    );

    if (comboRows.length === 0) {
      return res.status(400).json({ message: "Invalid combo" });
    }

    const combo = comboRows[0];

    // 2️⃣ Insert combo parent row
    const [parentResult] = await db.query(
        `INSERT INTO live_order_items
        (live_order_id, combo_id, qty, price, is_combo_parent)
        VALUES (?, ?, ?, ?, 1)`,
        [
          orderId,
          combo_id,
          1,
          combo.combo_price
        ]
      );

      const parentId = parentResult.insertId;

    // 3️⃣ Insert combo items (price = 0)
    for (const item of items) {

        await db.query(
          `INSERT INTO live_order_items
          (live_order_id, item_id, size_id, qty, price, combo_parent_id)
          VALUES (?, ?, ?, ?, 0, ?)`,
          [
            orderId,
            item.item_id,
            item.size_id || null,
            item.qty || 1,
            parentId
          ]
        );

      }

    res.json({ message: "Combo added successfully" });

  } catch (err) {

    console.error("COMBO ADD ERROR:", err);

    res.status(500).json({
      message: "Failed to add combo"
    });

  }

});

module.exports = router;
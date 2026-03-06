const express = require("express");
const router = express.Router();
const db = require("../config/db");
const auth = require("../middlewares/auth.middleware");

router.get("/config/init", auth, async (req, res) => {

const restaurantId = req.user.restaurant_id;

try {

```
const [
  categories,
  items,
  sizes,
  combos,
  comboGroups,
  comboGroupItems,
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
    `SELECT *
     FROM combo_groups
     WHERE combo_id IN (
       SELECT combo_id FROM combos WHERE restaurant_id = ?
     )
     ORDER BY display_order`,
    [restaurantId]
  ),

  db.query(
    `SELECT
        cgi.group_id,
        i.item_id,
        i.item_name,
        s.size_id,
        s.size_name
     FROM combo_group_items cgi
     JOIN items i ON i.item_id = cgi.item_id
     LEFT JOIN item_sizes s ON s.size_id = cgi.size_id
     WHERE cgi.group_id IN (
       SELECT group_id FROM combo_groups
       WHERE combo_id IN (
         SELECT combo_id FROM combos WHERE restaurant_id = ?
       )
     )`,
    [restaurantId]
  ),

  db.query(
    "SELECT * FROM payment_tenders WHERE restaurant_id = ? AND is_active = 1",
    [restaurantId]
  )

]);



// 🔥 Build combo structure (groups + items)

const combosFormatted = combos[0].map(combo => {

  const groups = comboGroups[0]
    .filter(g => g.combo_id === combo.combo_id)
    .map(group => ({
      ...group,
      items: comboGroupItems[0].filter(
        i => i.group_id === group.group_id
      )
    }));

  return {
    ...combo,
    groups
  };

});



res.json({
  categories: categories[0],
  items: items[0],
  sizes: sizes[0],
  combos: combosFormatted,   // important change
  tenders: tenders[0]
});
```

} catch (err) {

```
console.error(err);

res.status(500).json({
  message: "Config load failed"
});
```

}

});

module.exports = router;

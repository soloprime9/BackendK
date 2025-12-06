const express = require("express");
const router = express.Router();

const Location = require("../models/Location");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ ADMIN: CREATE LOCATION
// -----------------------------------------
router.post("/create", verifyToken, isAdmin, async (req, res) => {
  try {
    const { country, state, city, coordinates } = req.body;

    if (!country || !city)
      return res.status(400).json({ error: "Country and city are required" });

    const location = new Location({
      country,
      state: state || "",
      city,
      coordinates: coordinates || { lat: 0, lng: 0 },
    });

    await location.save();

    res.json({ success: true, message: "Location created", location });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create location" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: UPDATE LOCATION
// -----------------------------------------
router.put("/update/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) return res.status(404).json({ error: "Location not found" });

    Object.keys(req.body).forEach((key) => {
      location[key] = req.body[key];
    });

    await location.save();

    res.json({ success: true, message: "Location updated", location });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update location" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: DELETE LOCATION
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const location = await Location.findByIdAndDelete(req.params.id);
    if (!location) return res.status(404).json({ error: "Location not found" });

    res.json({ success: true, message: "Location deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete location" });
  }
});

// -----------------------------------------
// ⭐ GET ALL LOCATIONS
// -----------------------------------------
router.get("/all", async (req, res) => {
  try {
    const locations = await Location.find().sort({ country: 1, city: 1 });
    res.json(locations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch locations" });
  }
});

// -----------------------------------------
// ⭐ GET SINGLE LOCATION BY ID
// -----------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) return res.status(404).json({ error: "Location not found" });
    res.json(location);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch location" });
  }
});

module.exports = router;

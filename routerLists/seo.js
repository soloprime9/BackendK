const express = require("express");
const router = express.Router();

const Seo = require("../models/Seo");
const { verifyToken, isAdmin } = require("../middlewares/auth");

// -----------------------------------------
// ⭐ ADMIN: CREATE SEO
// -----------------------------------------
router.post("/create", verifyToken, isAdmin, async (req, res) => {
  try {
    const data = req.body;

    const seo = new Seo({
      metaTitle: data.metaTitle || "",
      metaDescription: data.metaDescription || "",
      metaKeywords: data.metaKeywords || [],
      canonicalUrl: data.canonicalUrl || "",
      ogImage: data.ogImage || "",
      ogTitle: data.ogTitle || "",
      ogDescription: data.ogDescription || "",
      twitterCard: data.twitterCard || "",
      schemaType: data.schemaType || "Product",
    });

    await seo.save();

    res.json({ success: true, message: "SEO created", seo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create SEO" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: UPDATE SEO
// -----------------------------------------
router.put("/update/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const seo = await Seo.findById(req.params.id);
    if (!seo) return res.status(404).json({ error: "SEO not found" });

    Object.keys(req.body).forEach((key) => {
      seo[key] = req.body[key];
    });

    await seo.save();

    res.json({ success: true, message: "SEO updated", seo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update SEO" });
  }
});

// -----------------------------------------
// ⭐ ADMIN / PUBLIC: GET SEO BY ID
// -----------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const seo = await Seo.findById(req.params.id);
    if (!seo) return res.status(404).json({ error: "SEO not found" });
    res.json(seo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch SEO" });
  }
});

// -----------------------------------------
// ⭐ GET ALL SEO ENTRIES
// -----------------------------------------
router.get("/all", verifyToken, isAdmin, async (req, res) => {
  try {
    const seos = await Seo.find().sort({ createdAt: -1 });
    res.json(seos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch SEO entries" });
  }
});

module.exports = router;
